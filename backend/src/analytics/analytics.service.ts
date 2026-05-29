import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Booking } from '../bookings/booking.entity';
import { Workspace } from '../workspaces/workspace.entity';
import { Attendance, AttendanceAction } from '../attendance/attendance.entity';

type Period = '7d' | '30d' | '90d';

function periodDays(period: Period): number {
  return period === '7d' ? 7 : period === '30d' ? 30 : 90;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Booking) private bookingRepo: Repository<Booking>,
    @InjectRepository(Workspace) private workspaceRepo: Repository<Workspace>,
    @InjectRepository(Attendance) private attendanceRepo: Repository<Attendance>,
  ) {}

  async getMemberGrowth(period: Period = '30d') {
    const days = periodDays(period);
    const results = await this.userRepo
      .createQueryBuilder('user')
      .select("TO_CHAR(DATE_TRUNC('day', user.createdAt), 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(user.id)', 'count')
      .where(`user.createdAt >= NOW() - INTERVAL '${days} days'`)
      .groupBy("DATE_TRUNC('day', user.createdAt)")
      .orderBy("DATE_TRUNC('day', user.createdAt)", 'ASC')
      .getRawMany();

    return results.map((r) => ({ date: r.date, count: parseInt(r.count, 10) }));
  }

  async getBookingRevenue(period: Period = '30d') {
    const days = periodDays(period);
    const results = await this.bookingRepo
      .createQueryBuilder('booking')
      .select("TO_CHAR(DATE_TRUNC('day', booking.createdAt), 'YYYY-MM-DD')", 'date')
      .addSelect('SUM(booking.totalAmount)', 'revenue')
      .where(`booking.createdAt >= NOW() - INTERVAL '${days} days'`)
      .groupBy("DATE_TRUNC('day', booking.createdAt)")
      .orderBy("DATE_TRUNC('day', booking.createdAt)", 'ASC')
      .getRawMany();

    return results.map((r) => ({ date: r.date, revenue: parseFloat(r.revenue) || 0 }));
  }

  async getWorkspaceUtilization() {
    const workspaces = await this.workspaceRepo.find({ where: { isActive: true } });
    const results = await Promise.all(
      workspaces.map(async (ws) => {
        const confirmedCount = await this.bookingRepo.count({
          where: { workspaceId: ws.id, status: 'Confirmed' as any },
        });
        return {
          workspaceId: ws.id,
          name: ws.name,
          type: ws.type,
          capacity: ws.capacity,
          confirmedBookings: confirmedCount,
          utilizationPct: ws.capacity > 0 ? Math.min(100, Math.round((confirmedCount / ws.capacity) * 100)) : 0,
        };
      }),
    );
    return results;
  }

  async getAttendancePatterns() {
    const records = await this.attendanceRepo.find({
      where: { action: AttendanceAction.CLOCK_IN },
    });

    const hourCounts: Record<number, number> = {};
    const dayCounts: Record<number, number> = {};

    for (const r of records) {
      const h = r.timestamp.getHours();
      const d = r.timestamp.getDay(); // 0=Sun
      hourCounts[h] = (hourCounts[h] || 0) + 1;
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return {
      peakHours: Object.entries(hourCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([hour, count]) => ({ hour: parseInt(hour), count })),
      dayOfWeekPatterns: Object.entries(dayCounts)
        .map(([day, count]) => ({ day: dayNames[parseInt(day)], count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
