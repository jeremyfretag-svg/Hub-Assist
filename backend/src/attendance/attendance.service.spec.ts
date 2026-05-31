import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { Attendance, AttendanceAction } from './attendance.entity';
import { encodeCursor, decodeCursor } from '../common/pagination/utils/cursor.util';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<Attendance> = {}): Attendance {
  const base: Attendance = {
    id: 'rec-id-1',
    userId: 'user-1',
    action: AttendanceAction.CLOCK_IN,
    timestamp: new Date('2024-06-01T10:00:00.000Z'),
    sessionId: 'session-1',
    details: undefined,
    hubId: undefined,
    user: {} as any,
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Mock repository factory
// ---------------------------------------------------------------------------

function buildMockRepo() {
  return {
    findOne: jest.fn(),
    create: jest.fn((data) => ({ ...data, timestamp: new Date() })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    find: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttendanceService — cursor pagination', () => {
  let service: AttendanceService;
  let repo: ReturnType<typeof buildMockRepo>;

  beforeEach(async () => {
    repo = buildMockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: getRepositoryToken(Attendance), useValue: repo },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // First page (no cursor)
  // -------------------------------------------------------------------------

  describe('first page (no cursor)', () => {
    it('returns data and null nextCursor when total records ≤ limit', async () => {
      const records = [makeRecord({ id: 'r1' }), makeRecord({ id: 'r2' })];
      repo.find.mockResolvedValue(records);

      const result = await service.getMyAttendance('user-1', { limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('returns nextCursor and hasMore=true when more records exist', async () => {
      // Service fetches limit+1 to detect hasMore; simulate 21 records for limit=20
      const records = Array.from({ length: 21 }, (_, i) =>
        makeRecord({
          id: `r${i}`,
          timestamp: new Date(`2024-06-01T${String(10 + i).padStart(2, '0')}:00:00.000Z`),
        }),
      );
      repo.find.mockResolvedValue(records);

      const result = await service.getMyAttendance('user-1', { limit: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();

      // The cursor must decode to the last record on the page (index 19)
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe(records[19].id);
      expect(decoded.timestamp).toBe(records[19].timestamp.toISOString());
    });

    it('calls find with DESC ordering and take = limit + 1', async () => {
      repo.find.mockResolvedValue([]);
      await service.getMyAttendance('user-1', { limit: 10 });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          order: { timestamp: 'DESC', id: 'DESC' },
          take: 11,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Subsequent pages (with cursor)
  // -------------------------------------------------------------------------

  describe('subsequent pages (with cursor)', () => {
    function buildQueryBuilder(records: Attendance[]) {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(records),
      };
      return qb;
    }

    it('uses the query builder with the correct compound WHERE predicate', async () => {
      const cursorRecord = makeRecord({
        id: 'cursor-rec',
        timestamp: new Date('2024-06-01T10:00:00.000Z'),
      });
      const cursor = encodeCursor({
        timestamp: cursorRecord.timestamp.toISOString(),
        id: cursorRecord.id,
      });

      const nextPageRecords = [makeRecord({ id: 'next-1' })];
      const qb = buildQueryBuilder(nextPageRecords);
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyAttendance('user-1', { cursor, limit: 20 });

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('a');
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(a.timestamp < :ts OR (a.timestamp = :ts AND a.id < :id))',
        expect.objectContaining({ id: cursorRecord.id }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when the page is full', async () => {
      const cursorRecord = makeRecord({ id: 'cursor-rec' });
      const cursor = encodeCursor({
        timestamp: cursorRecord.timestamp.toISOString(),
        id: cursorRecord.id,
      });

      // 21 records returned → hasMore = true
      const nextPageRecords = Array.from({ length: 21 }, (_, i) =>
        makeRecord({
          id: `next-${i}`,
          timestamp: new Date(`2024-05-01T${String(10 + i).padStart(2, '0')}:00:00.000Z`),
        }),
      );
      const qb = buildQueryBuilder(nextPageRecords);
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyAttendance('user-1', { cursor, limit: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('throws BadRequestException for a malformed cursor', async () => {
      await expect(
        service.getMyAttendance('user-1', { cursor: 'not-a-valid-cursor!!!', limit: 20 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // Non-overlapping pages (integration-style)
  // -------------------------------------------------------------------------

  describe('non-overlapping ordered pages', () => {
    it('two consecutive pages do not share any record ids', async () => {
      // Page 1: 20 records + 1 sentinel to signal hasMore
      const page1Records = Array.from({ length: 21 }, (_, i) =>
        makeRecord({
          id: `r${20 - i}`,
          timestamp: new Date(Date.now() - i * 1000),
        }),
      );
      repo.find.mockResolvedValueOnce(page1Records);

      const page1 = await service.getMyAttendance('user-1', { limit: 20 });
      expect(page1.hasMore).toBe(true);

      // Page 2: simulate records that come after the cursor
      const page2Records = Array.from({ length: 5 }, (_, i) =>
        makeRecord({
          id: `r${i}`,
          timestamp: new Date(Date.now() - (21 + i) * 1000),
        }),
      );
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(page2Records),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const page2 = await service.getMyAttendance('user-1', {
        cursor: page1.nextCursor!,
        limit: 20,
      });

      const page1Ids = new Set(page1.data.map((r) => r.id));
      const page2Ids = page2.data.map((r) => r.id);
      const overlap = page2Ids.filter((id) => page1Ids.has(id));

      expect(overlap).toHaveLength(0);
      expect(page2.hasMore).toBe(false);
    });
  });
});
