import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto, UpdateBookingDto } from './bookings.dto';
import { StellarService } from '../stellar/stellar.service';
import { Workspace } from '../workspaces/workspace.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { RecurrenceService } from './recurrence.service';
import { CancellationPolicyService } from './cancellation-policy.service';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private repo: Repository<Booking>,
    @InjectRepository(Workspace) private workspaceRepo: Repository<Workspace>,
    private stellarService: StellarService,
    private notificationsService: NotificationsService,
    private conflictDetectionService: ConflictDetectionService,
    private recurrenceService: RecurrenceService,
    private cancellationPolicyService: CancellationPolicyService,
  ) {}

  // ── create ─────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateBookingDto) {
    return this.repo.manager.transaction(async (manager) => {
      const workspace = await manager.findOne(Workspace, {
        where: { id: dto.workspaceId },
      });
      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      const startTime = new Date(dto.startTime);
      const endTime = new Date(dto.endTime);
      const durationMs = endTime.getTime() - startTime.getTime();

      if (durationMs <= 0) {
        throw new BadRequestException('endTime must be after startTime');
      }

      // ── Recurring booking path ─────────────────────────────────────────────
      if (dto.recurrenceRule) {
        const instances = this.recurrenceService.expandInstances(
          dto.recurrenceRule,
          startTime,
          durationMs,
        );

        // Check conflicts for ALL instances before inserting any (atomic)
        for (const instance of instances) {
          const conflict = await this.conflictDetectionService.hasConflict(
            manager,
            dto.workspaceId,
            instance.startTime,
            instance.endTime,
          );

          if (conflict) {
            throw new ConflictException({
              message: `Recurring series conflict detected on instance starting ${instance.startTime.toISOString()}`,
              conflictDetail: conflict,
            });
          }
        }

        // All clear — batch-insert all instances
        const seriesId = uuidv4();
        const bookings: Booking[] = instances.map((instance, index) => {
          const hours =
            (instance.endTime.getTime() - instance.startTime.getTime()) /
            (1000 * 60 * 60);
          const totalAmount = Number(
            (hours * Number(workspace.pricePerHour)).toFixed(2),
          );

          return manager.create(Booking, {
            workspaceId: dto.workspaceId,
            userId,
            startTime: instance.startTime,
            endTime: instance.endTime,
            totalAmount,
            status: BookingStatus.PENDING,
            stellarTxHash: dto.stellarTxHash ?? null,
            // Only the first instance carries the RRULE string
            recurrenceRule: index === 0 ? dto.recurrenceRule : undefined,
            seriesId,
            instanceIndex: index,
          });
        });

        const saved = await manager.save(bookings);

        this.notificationsService.sendToUser(userId, 'booking:series_created', {
          seriesId,
          instanceCount: saved.length,
          workspaceName: workspace.name,
        });

        return saved;
      }

      // ── Single booking path ────────────────────────────────────────────────
      const conflict = await this.conflictDetectionService.hasConflict(
        manager,
        dto.workspaceId,
        startTime,
        endTime,
      );

      if (conflict) {
        throw new ConflictException({
          message: 'Workspace booking conflict detected',
          conflictDetail: conflict,
        });
      }

      const hours = durationMs / (1000 * 60 * 60);
      const totalAmount = Number(
        (hours * Number(workspace.pricePerHour)).toFixed(2),
      );

      const booking = manager.create(Booking, {
        ...dto,
        userId,
        startTime,
        endTime,
        totalAmount,
        status: BookingStatus.PENDING,
      });

      return manager.save(booking);
    });
  }

  // ── findAll ────────────────────────────────────────────────────────────────

  async findAll(userId?: string, isAdmin: boolean = false) {
    const query = this.repo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.workspace', 'workspace')
      .leftJoinAndSelect('booking.user', 'user');

    if (!isAdmin && userId) {
      query.where('booking.userId = :userId', { userId });
    }

    return query.getMany();
  }

  // ── findById ───────────────────────────────────────────────────────────────

  async findById(id: string) {
    const booking = await this.repo.findOne({
      where: { id },
      relations: ['workspace', 'user'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  // ── findByWorkspace ────────────────────────────────────────────────────────

  async findByWorkspace(workspaceId: string) {
    return this.repo.find({
      where: { workspaceId },
      relations: ['user'],
    });
  }

  // ── findBySeries ───────────────────────────────────────────────────────────

  async findBySeries(seriesId: string) {
    const bookings = await this.repo.find({
      where: { seriesId },
      order: { instanceIndex: 'ASC' },
    });

    if (bookings.length === 0) {
      throw new NotFoundException(`No bookings found for series "${seriesId}"`);
    }

    return bookings;
  }

  // ── confirm ────────────────────────────────────────────────────────────────

  async confirm(id: string) {
    const booking = await this.findById(id);

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }

    if (!booking.stellarTxHash) {
      throw new BadRequestException(
        'No transaction hash provided for payment verification',
      );
    }

    try {
      const txVerification = await this.stellarService.verifyTransaction(
        booking.stellarTxHash,
      );
      if (txVerification.status !== 'SUCCESS') {
        throw new BadRequestException('Transaction verification failed');
      }
    } catch (error) {
      throw new BadRequestException(
        `Payment verification failed: ${(error as Error).message}`,
      );
    }

    booking.status = BookingStatus.CONFIRMED;
    const saved = await this.repo.save(booking);
    this.notificationsService.sendToUser(booking.userId, 'booking:confirmed', {
      bookingId: booking.id,
      workspaceName: booking.workspace?.name,
    });
    return saved;
  }

  // ── cancel (single booking) ────────────────────────────────────────────────

  async cancel(id: string, userId: string) {
    const booking = await this.findById(id);

    if (booking.userId !== userId) {
      throw new ForbiddenException('Not authorized to cancel this booking');
    }

    // Evaluate refund policy
    const refundEval = await this.cancellationPolicyService.evaluateRefund(
      booking,
      new Date(),
    );

    booking.status = BookingStatus.CANCELLED;
    booking.refundAmount = refundEval.refundAmount;

    const saved = await this.repo.save(booking);

    this.notificationsService.sendToUser(booking.userId, 'booking:cancelled', {
      bookingId: booking.id,
      refundAmount: refundEval.refundAmount,
      refundPercent: refundEval.refundPercent,
      reason: refundEval.reason,
    });

    return saved;
  }

  // ── cancelSeries ───────────────────────────────────────────────────────────

  /**
   * Cancels all FUTURE instances of a recurring series.
   * Past instances (startTime <= now) are preserved.
   * Series are identified by seriesId.
   *
   * @param seriesId - UUID of the series to cancel
   * @param userId   - The requesting user's ID (must own the series)
   * @returns Object with counts of cancelled and preserved instances
   */
  async cancelSeries(seriesId: string, userId: string) {
    const now = new Date();

    // Load all instances of the series
    const allInstances = await this.repo.find({ where: { seriesId } });

    if (allInstances.length === 0) {
      throw new NotFoundException(`No bookings found for series "${seriesId}"`);
    }

    // Ownership check — all instances belong to the same user
    const owner = allInstances[0];
    if (owner.userId !== userId) {
      throw new ForbiddenException(
        'Not authorized to cancel this booking series',
      );
    }

    // Split into future (cancellable) and past (preserved)
    const futureInstances = allInstances.filter(
      (b) =>
        b.startTime > now &&
        b.status !== BookingStatus.CANCELLED,
    );

    if (futureInstances.length === 0) {
      return {
        cancelledCount: 0,
        preservedCount: allInstances.length,
        message: 'No future instances to cancel.',
      };
    }

    // Evaluate refund for each future instance and cancel
    const cancelledAt = now;
    for (const instance of futureInstances) {
      // Load workspace relation for policy evaluation
      const bookingWithWorkspace = await this.repo.findOne({
        where: { id: instance.id },
        relations: ['workspace'],
      });

      if (bookingWithWorkspace) {
        const refundEval =
          await this.cancellationPolicyService.evaluateRefund(
            bookingWithWorkspace,
            cancelledAt,
          );
        instance.refundAmount = refundEval.refundAmount;
      }

      instance.status = BookingStatus.CANCELLED;
    }

    await this.repo.save(futureInstances);

    this.notificationsService.sendToUser(userId, 'booking:series_cancelled', {
      seriesId,
      cancelledCount: futureInstances.length,
    });

    return {
      cancelledCount: futureInstances.length,
      preservedCount: allInstances.length - futureInstances.length,
      message: `Cancelled ${futureInstances.length} future instance(s). Past instances preserved.`,
    };
  }

  // ── update ─────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateBookingDto) {
    return this.repo.manager.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id },
        relations: ['workspace', 'user'],
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const startTime = dto.startTime
        ? new Date(dto.startTime)
        : booking.startTime;
      const endTime = dto.endTime ? new Date(dto.endTime) : booking.endTime;

      if (dto.startTime || dto.endTime) {
        const conflict = await this.conflictDetectionService.hasConflict(
          manager,
          booking.workspaceId,
          startTime,
          endTime,
          id,
        );

        if (conflict) {
          throw new ConflictException({
            message: 'Workspace booking conflict detected',
            conflictDetail: conflict,
          });
        }

        const workspace = booking.workspace;
        const hours =
          (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        booking.totalAmount = Number(
          (hours * Number(workspace.pricePerHour)).toFixed(2),
        );
      }

      Object.assign(booking, dto);
      return manager.save(booking);
    });
  }
}
