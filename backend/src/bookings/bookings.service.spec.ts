import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './booking.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { StellarService } from '../stellar/stellar.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingEngineService } from '../pricing/pricing-engine.service';
import { UserRole } from '../users/user.entity';

const mockWorkspace = { id: 'ws-1', name: 'Hot Desk', isActive: true };

const mockBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
  startTime: new Date('2025-01-01T09:00:00Z'),
  endTime: new Date('2025-01-01T11:00:00Z'),
  status: BookingStatus.PENDING,
  totalAmount: 20,
  stellarTxHash: null as any,
  workspace: mockWorkspace as any,
  user: { id: 'user-1' } as any,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('BookingsService', () => {
  let service: BookingsService;

  const mockManager = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]), // price rules
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockBookingRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn(async (cb) => cb(mockManager)),
    },
  };

  const mockWorkspaceRepo = {
    findOne: jest.fn(),
  };

  const mockStellarService = {
    verifyTransaction: jest.fn(),
  };

  const mockNotificationsService = {
    sendToUser: jest.fn(),
  };

  const mockConflictDetectionService = {
    hasConflict: jest.fn(),
  };

  const mockPricingEngineService = {
    calculatePrice: jest.fn().mockResolvedValue({
      segments: [],
      totalAmount: 20,
      userTier: UserRole.MEMBER,
      tierDiscount: 0.1,
      calculatedAt: new Date().toISOString(),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getRepositoryToken(Booking), useValue: mockBookingRepo },
        { provide: getRepositoryToken(Workspace), useValue: mockWorkspaceRepo },
        { provide: StellarService, useValue: mockStellarService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: ConflictDetectionService, useValue: mockConflictDetectionService },
        { provide: PricingEngineService, useValue: mockPricingEngineService },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    jest.clearAllMocks();
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      workspaceId: 'ws-1',
      startTime: '2025-01-01T09:00:00Z',
      endTime: '2025-01-01T11:00:00Z',
      totalAmount: 20,
    };

    const buildQbForCreate = (result: Booking | null) => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
    });

    it('creates and returns a booking', async () => {
      mockWorkspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      mockBookingRepo.createQueryBuilder.mockReturnValue(buildQbForCreate(null));
      mockManager.findOne.mockResolvedValueOnce(mockWorkspace);
      mockConflictDetectionService.hasConflict.mockResolvedValue(null);
      const created = mockBooking();
      mockManager.create.mockReturnValue(created);
      mockManager.save.mockResolvedValue(created);

      const result = await service.create('user-1', dto, UserRole.MEMBER);
      expect(result).toEqual(created);
      expect(mockManager.save).toHaveBeenCalledWith(created);
    });

    it('throws 404 when workspace not found', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);
      await expect(service.create('user-1', dto, UserRole.MEMBER)).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when overlapping confirmed booking exists', async () => {
      mockManager.findOne.mockResolvedValueOnce(mockWorkspace);
      // Overlapping confirmed booking
      mockBookingRepo.createQueryBuilder.mockReturnValue(buildQbForCreate(
        mockBooking({ status: BookingStatus.CONFIRMED, startTime: new Date('2025-01-01T08:00:00Z'), endTime: new Date('2025-01-01T10:00:00Z') }),
      ));
      mockConflictDetectionService.hasConflict.mockResolvedValue({ reason: 'Overlap' });

      await expect(service.create('user-1', dto, UserRole.MEMBER)).rejects.toThrow(ConflictException);
    });

    it('does not throw when confirmed booking does not overlap', async () => {
      mockWorkspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      // Non-overlapping: ends before our start
      mockBookingRepo.createQueryBuilder.mockReturnValue(buildQbForCreate(null));
      mockManager.findOne.mockResolvedValueOnce(mockWorkspace);
      // Non-overlapping
      mockConflictDetectionService.hasConflict.mockResolvedValue(null);
      const created = mockBooking();
      mockManager.create.mockReturnValue(created);
      mockManager.save.mockResolvedValue(created);

      await expect(service.create('user-1', dto, UserRole.MEMBER)).resolves.toEqual(created);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll (getUserBookings / getAdminBookings)', () => {
    const buildQb = (results: Booking[]) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(results),
    });

    it('returns only the requesting user bookings when not admin', async () => {
      const userBooking = mockBooking({ userId: 'user-1' });
      const qb = buildQb([userBooking]);
      mockBookingRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll('user-1', false);
      expect(qb.where).toHaveBeenCalledWith('booking.userId = :userId', { userId: 'user-1' });
      expect(result).toEqual([userBooking]);
    });

    it('returns all bookings when admin', async () => {
      const allBookings = [mockBooking({ userId: 'user-1' }), mockBooking({ id: 'booking-2', userId: 'user-2' })];
      const qb = buildQb(allBookings);
      mockBookingRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(undefined, true);
      expect(qb.where).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  // ── confirm ────────────────────────────────────────────────────────────────

  describe('confirm', () => {
    it('confirms a pending booking with valid stellar tx', async () => {
      const booking = mockBooking({ stellarTxHash: 'tx-hash-123' });
      mockBookingRepo.findOne.mockResolvedValue(booking);
      mockStellarService.verifyTransaction.mockResolvedValue({ status: 'SUCCESS' });
      mockBookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.CONFIRMED });

      const result = await service.confirm('booking-1');
      expect(result.status).toBe(BookingStatus.CONFIRMED);
    });

    it('throws 404 when booking not found', async () => {
      mockBookingRepo.findOne.mockResolvedValue(null);
      await expect(service.confirm('unknown')).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when booking is not pending', async () => {
      mockBookingRepo.findOne.mockResolvedValue(mockBooking({ status: BookingStatus.CONFIRMED }));
      await expect(service.confirm('booking-1')).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when no stellarTxHash provided', async () => {
      mockBookingRepo.findOne.mockResolvedValue(mockBooking({ stellarTxHash: null as any }));
      await expect(service.confirm('booking-1')).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when stellar transaction verification fails', async () => {
      mockBookingRepo.findOne.mockResolvedValue(mockBooking({ stellarTxHash: 'tx-hash-123' }));
      mockStellarService.verifyTransaction.mockResolvedValue({ status: 'FAILED' });
      await expect(service.confirm('booking-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('allows owner to cancel own booking', async () => {
      const booking = mockBooking();
      mockBookingRepo.findOne.mockResolvedValue(booking);
      mockBookingRepo.save.mockResolvedValue({ ...booking, status: BookingStatus.CANCELLED });

      const result = await service.cancel('booking-1', 'user-1');
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('throws 403 when non-owner tries to cancel', async () => {
      mockBookingRepo.findOne.mockResolvedValue(mockBooking({ userId: 'user-1' }));
      await expect(service.cancel('booking-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });

    it('throws 404 when booking not found', async () => {
      mockBookingRepo.findOne.mockResolvedValue(null);
      await expect(service.cancel('unknown', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
