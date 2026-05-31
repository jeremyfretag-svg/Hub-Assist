import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Attendance, AttendanceAction } from './attendance.entity';
import { ClockInDto, ClockOutDto } from './attendance.dto';

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
    const duration = Math.floor(
      (attendance.timestamp.getTime() - openSession.timestamp.getTime()) / 1000,
    );

    return {
      sessionId: openSession.sessionId,
      message: 'Clocked out successfully',
      timestamp: attendance.timestamp,
      sessionDuration: duration,
    };
  }

  async getMyAttendance(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [records, total] = await this.attendanceRepository.findAndCount({
      where: { userId },
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

  async getAllAttendance(
    page: number = 1,
    limit: number = 20,
    filters?: { userId?: string; action?: AttendanceAction; startDate?: Date; endDate?: Date },
  ) {
    const skip = (page - 1) * limit;
    const query = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.user', 'user')
      .orderBy('attendance.timestamp', 'DESC');

    if (filters?.userId) {
      query.andWhere('attendance.userId = :userId', { userId: filters.userId });
    }

    if (filters?.action) {
      query.andWhere('attendance.action = :action', { action: filters.action });
    }

    if (filters?.startDate) {
      query.andWhere('attendance.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      query.andWhere('attendance.timestamp <= :endDate', { endDate: filters.endDate });
    }

    const [records, total] = await query.skip(skip).take(limit).getManyAndCount();

    return {
      records,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }
}
