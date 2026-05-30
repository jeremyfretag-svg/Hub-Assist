import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto, UpdateBookingDto } from './bookings.dto';
import { StellarService } from '../stellar/stellar.service';
import { Workspace } from '../workspaces/workspace.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ConflictDetectionService } from './conflict-detection.service';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private repo: Repository<Booking>,
    @InjectRepository(Workspace) private workspaceRepo: Repository<Workspace>,
    private stellarService: StellarService,
    private notificationsService: NotificationsService,
    private conflictDetectionService: ConflictDetectionService,
  ) {}

  async create(userId: string, dto: CreateBookingDto) {
    return this.repo.manager.transaction(async (manager) => {
      const workspace = await manager.findOne(Workspace, { where: { id: dto.workspaceId } });
      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      const startTime = new Date(dto.startTime);
      const endTime = new Date(dto.endTime);

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

      const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      const totalAmount = Number((hours * Number(workspace.pricePerHour)).toFixed(2));

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

  async findAll(userId?: string, isAdmin: boolean = false) {
    const query = this.repo.createQueryBuilder('booking').leftJoinAndSelect('booking.workspace', 'workspace').leftJoinAndSelect('booking.user', 'user');

    if (!isAdmin && userId) {
      query.where('booking.userId = :userId', { userId });
    }

    return query.getMany();
  }

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

  async findByWorkspace(workspaceId: string) {
    return this.repo.find({
      where: { workspaceId },
      relations: ['user'],
    });
  }

  async confirm(id: string) {
    const booking = await this.findById(id);

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }

    // Verify on-chain payment
    if (!booking.stellarTxHash) {
      throw new BadRequestException('No transaction hash provided for payment verification');
    }

    try {
      const txVerification = await this.stellarService.verifyTransaction(booking.stellarTxHash);
      if (txVerification.status !== 'SUCCESS') {
        throw new BadRequestException('Transaction verification failed');
      }
    } catch (error) {
      throw new BadRequestException(`Payment verification failed: ${(error as Error).message}`);
    }

    booking.status = BookingStatus.CONFIRMED;
    const saved = await this.repo.save(booking);
    this.notificationsService.sendToUser(booking.userId, 'booking:confirmed', {
      bookingId: booking.id,
      workspaceName: booking.workspace?.name,
    });
    return saved;
  }

  async cancel(id: string, userId: string) {
    const booking = await this.findById(id);
    if (booking.userId !== userId) {
      throw new ForbiddenException('Not authorized to cancel this booking');
    }
    booking.status = BookingStatus.CANCELLED;
    const saved = await this.repo.save(booking);
    this.notificationsService.sendToUser(booking.userId, 'booking:cancelled', {
      bookingId: booking.id,
    });
    return saved;
  }

  async update(id: string, dto: UpdateBookingDto) {
    return this.repo.manager.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id },
        relations: ['workspace', 'user'],
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const startTime = dto.startTime ? new Date(dto.startTime) : booking.startTime;
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
        const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        booking.totalAmount = Number((hours * Number(workspace.pricePerHour)).toFixed(2));
      }

      Object.assign(booking, dto);
      return manager.save(booking);
    });
  }
}
