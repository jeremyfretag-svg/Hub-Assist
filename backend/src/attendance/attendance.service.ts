import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Attendance, AttendanceAction } from './attendance.entity';
import { ClockInDto, ClockOutDto } from './attendance.dto';
import { CursorPaginationQueryDto } from '../common/pagination/dto/cursor-pagination-query.dto';
import { encodeCursor, decodeCursor } from '../common/pagination/utils/cursor.util';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
  ) {}

  async clockIn(userId: string, dto: ClockInDto) {
    // Check if user already has an open session
    const openSession = await this.attendanceRepository.findOne({
      where: {
        userId,
        action: AttendanceAction.CLOCK_IN,
      },
      order: { timestamp: 'DESC' },
    });

    if (openSession) {
      // Check if there's a corresponding clock-out
      const hasClockOut = await this.attendanceRepository.findOne({
        where: {
          userId,
          sessionId: openSession.sessionId,
          action: AttendanceAction.CLOCK_OUT,
        },
      });

      if (!hasClockOut) {
        throw new BadRequestException('User already clocked in. Please clock out first.');
      }
    }

    const sessionId = uuidv4();
    const attendance = this.attendanceRepository.create({
      userId,
      action: AttendanceAction.CLOCK_IN,
      sessionId,
      details: dto.details,
    });

    await this.attendanceRepository.save(attendance);
    return { sessionId, message: 'Clocked in successfully', timestamp: attendance.timestamp };
  }

  async clockOut(userId: string, dto: ClockOutDto) {
    // Find the most recent clock-in without a corresponding clock-out
    const openSession = await this.attendanceRepository.findOne({
      where: {
        userId,
        action: AttendanceAction.CLOCK_IN,
      },
      order: { timestamp: 'DESC' },
    });

    if (!openSession) {
      throw new BadRequestException('No active session. Please clock in first.');
    }

    // Check if already clocked out
    const existingClockOut = await this.attendanceRepository.findOne({
      where: {
        userId,
        sessionId: openSession.sessionId,
        action: AttendanceAction.CLOCK_OUT,
      },
    });

    if (existingClockOut) {
      throw new BadRequestException('Already clocked out for this session.');
    }

    const attendance = this.attendanceRepository.create({
      userId,
      action: AttendanceAction.CLOCK_OUT,
      sessionId: openSession.sessionId,
      details: dto.details,
    });

    await this.attendanceRepository.save(attendance);

    // Calculate session duration
    const duration = Math.floor((attendance.timestamp.getTime() - openSession.timestamp.getTime()) / 1000);

    return {
      sessionId: openSession.sessionId,
      message: 'Clocked out successfully',
      timestamp: attendance.timestamp,
      sessionDuration: duration,
    };
  }

  async getMyAttendance(
    userId: string,
    query: CursorPaginationQueryDto,
  ): Promise<{
    data: Attendance[];
    nextCursor: string | null;
    hasMore: boolean;
    /** @deprecated Use cursor-based navigation. Kept for backward compatibility. */
    total?: number;
    /** @deprecated Use cursor-based navigation. Kept for backward compatibility. */
    page?: number;
    /** @deprecated Use cursor-based navigation. Kept for backward compatibility. */
    limit?: number;
    /** @deprecated Use cursor-based navigation. Kept for backward compatibility. */
    pages?: number;
  }> {
    const limit = query.limit ?? 20;

    if (query.cursor) {
      let cursorPayload: { timestamp: string; id: string };
      try {
        cursorPayload = decodeCursor(query.cursor);
      } catch {
        throw new BadRequestException('Invalid cursor token');
      }

      // Fetch records that come *before* the cursor position in DESC order,
      // i.e. timestamp < cursorTimestamp OR (timestamp = cursorTimestamp AND id < cursorId).
      // TypeORM's FindOptions don't support OR conditions cleanly, so we use
      // the QueryBuilder for the compound predicate.
      const records = await this.attendanceRepository
        .createQueryBuilder('a')
        .where('a.userId = :userId', { userId })
        .andWhere(
          '(a.timestamp < :ts OR (a.timestamp = :ts AND a.id < :id))',
          { ts: new Date(cursorPayload.timestamp), id: cursorPayload.id },
        )
        .orderBy('a.timestamp', 'DESC')
        .addOrderBy('a.id', 'DESC')
        .take(limit + 1)
        .getMany();

      const hasMore = records.length > limit;
      const data = hasMore ? records.slice(0, limit) : records;
      const nextCursor =
        hasMore && data.length > 0
          ? encodeCursor({
              timestamp: data[data.length - 1].timestamp.toISOString(),
              id: data[data.length - 1].id,
            })
          : null;

      return { data, nextCursor, hasMore };
    }

    // First page — no cursor provided
    const records = await this.attendanceRepository.find({
      where: { userId },
      order: { timestamp: 'DESC', id: 'DESC' },
      take: limit + 1,
    });

    const hasMore = records.length > limit;
    const data = hasMore ? records.slice(0, limit) : records;
    const nextCursor =
      hasMore && data.length > 0
        ? encodeCursor({
            timestamp: data[data.length - 1].timestamp.toISOString(),
            id: data[data.length - 1].id,
          })
        : null;

    return { data, nextCursor, hasMore };
  }

  async getUserAttendance(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [records, total] = await this.attendanceRepository.findAndCount({
      where: { userId },
      relations: ['user'],
      order: { timestamp: 'DESC' },
      skip,
      take: limit,
    });

    return {
      records,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getAttendanceSummary() {
    const records = await this.attendanceRepository.find({
      relations: ['user'],
    });

    const sessions = new Map<string, { clockIn: Attendance; clockOut?: Attendance }>();

    for (const record of records) {
      if (!sessions.has(record.sessionId!)) {
        sessions.set(record.sessionId!, { clockIn: record });
      } else {
        const session = sessions.get(record.sessionId!)!;
        if (record.action === AttendanceAction.CLOCK_OUT) {
          session.clockOut = record;
        }
      }
    }

    let totalSessions = 0;
    let totalDuration = 0;
    const hourlyStats: Record<number, number> = {};

    for (const session of sessions.values()) {
      if (session.clockOut) {
        totalSessions++;
        const duration = Math.floor(
          (session.clockOut.timestamp.getTime() - session.clockIn.timestamp.getTime()) / 1000,
        );
        totalDuration += duration;

        const hour = session.clockIn.timestamp.getHours();
        hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
      }
    }

    const avgDuration = totalSessions > 0 ? Math.floor(totalDuration / totalSessions) : 0;

    return {
      totalSessions,
      totalDuration,
      avgDuration,
      peakHours: Object.entries(hourlyStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([hour, count]) => ({ hour: parseInt(hour), count })),
    };
  }
}
