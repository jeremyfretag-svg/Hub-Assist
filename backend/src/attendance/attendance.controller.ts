import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { AttendanceService } from './attendance.service';
import { ClockInDto, ClockOutDto } from './attendance.dto';
import { AttendanceAction } from './attendance.entity';

@ApiTags('attendance')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1', path: 'attendance' })
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  @ApiOperation({ summary: 'Record a clock-in event' })
  @ApiResponse({
    status: 201,
    description: 'Clock-in recorded successfully',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        message: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  })
  async clockIn(@Request() req: any, @Body() dto: ClockInDto) {
    return this.attendanceService.clockIn(req.user.sub, dto);
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Record a clock-out event' })
  @ApiResponse({
    status: 200,
    description: 'Clock-out recorded successfully',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        message: { type: 'string' },
        timestamp: { type: 'string' },
        sessionDuration: { type: 'number' },
      },
    },
  })
  async clockOut(@Request() req: any, @Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(req.user.sub, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user attendance history (paginated)' })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Attendance history retrieved successfully',
  })
  async getMyAttendance(
    @Request() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.attendanceService.getMyAttendance(req.user.sub, page, limit);
  }

  @Get('user/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get specific user attendance history (admin only, paginated)' })
  @ApiParam({ name: 'userId', type: String, description: 'User ID' })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'User attendance history retrieved successfully',
  })
  async getUserAttendance(
    @Param('userId') userId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.attendanceService.getUserAttendance(userId, page, limit);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get attendance summary statistics (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Attendance summary retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalSessions: { type: 'number' },
        totalDuration: { type: 'number' },
        avgDuration: { type: 'number' },
        peakHours: { type: 'array' },
      },
    },
  })
  async getAttendanceSummary() {
    return this.attendanceService.getAttendanceSummary();
  }

  @Get('all')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get all attendance records with optional filters (admin only, paginated)',
  })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiQuery({ name: 'userId', type: String, required: false, description: 'Filter by user ID' })
  @ApiQuery({
    name: 'action',
    enum: AttendanceAction,
    required: false,
    description: 'Filter by action (clock_in or clock_out)',
  })
  @ApiQuery({
    name: 'startDate',
    type: String,
    required: false,
    description: 'Filter by start date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    type: String,
    required: false,
    description: 'Filter by end date (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'All attendance records retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        records: { type: 'array' },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        pages: { type: 'number' },
      },
    },
  })
  async getAllAttendance(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('userId') userId?: string,
    @Query('action') action?: AttendanceAction,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = {
      userId,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    return this.attendanceService.getAllAttendance(page, limit, filters);
  }
}
