import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto, UpdateBookingDto } from './bookings.dto';
import { StellarService } from '../stellar/stellar.service';
import { Workspace } from '../workspaces/workspace.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private repo: Repository<Booking>,
    @InjectRepository(Workspace) private workspaceRepo: Repository<Workspace>,
    private stellarService: StellarService,
    private notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateBookingDto) {
    // Validate workspace exists
    const workspace = await this.workspaceRepo.findOne({ where: { id: dto.workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    // Validate no overlapping bookings with confirmed status
    const overlapping = await this.repo
      .createQueryBuilder('booking')
      .where('booking.workspaceId = :workspaceId', { workspaceId: dto.workspaceId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('(booking.startTime BETWEEN :startTime AND :endTime OR booking.endTime BETWEEN :startTime AND :endTime OR :startTime BETWEEN booking.startTime AND booking.endTime)', { startTime, endTime })
      .getOne();

    if (overlapping) {
      throw new ConflictException('Workspace has overlapping bookings');
    }

    const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const totalAmount = Number((hours * Number(workspace.pricePerHour)).toFixed(2));

    const booking = this.repo.create({
      ...dto,
      userId,
      startTime,
      endTime,
      totalAmount,
      status: BookingStatus.PENDING,
    });

    return this.repo.save(booking);
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
    const booking = await this.findById(id);
    Object.assign(booking, dto);
    return this.repo.save(booking);
  }
}
