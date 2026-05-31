import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiExtraModels,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { AttendanceService } from './attendance.service';
import { ClockInDto, ClockOutDto } from './attendance.dto';
import { CursorPaginationQueryDto } from '../common/pagination/dto/cursor-pagination-query.dto';

@ApiTags('attendance')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
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
  @ApiOperation({
    summary: 'Get current user attendance history (cursor-paginated)',
    description:
      'Returns a page of attendance records ordered by timestamp DESC. ' +
      'Pass the `nextCursor` value from the previous response as the `cursor` ' +
      'query parameter to fetch the next page. Omit `cursor` to start from the ' +
      'most recent record.',
  })
  @ApiQuery({
    name: 'cursor',
    type: String,
    required: false,
    description: 'Opaque cursor token from the previous page `nextCursor` field.',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    example: 20,
    description: 'Number of records per page (1–100, default 20).',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { type: 'object' },
          description: 'Attendance records for this page',
        },
        nextCursor: {
          type: 'string',
          nullable: true,
          description:
            'Opaque cursor token to pass as `cursor` on the next request. ' +
            'Null when there are no more pages.',
        },
        hasMore: {
          type: 'boolean',
          description: 'True when additional pages exist beyond this one.',
        },
      },
    },
  })
  async getMyAttendance(
    @Request() req: any,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.attendanceService.getMyAttendance(req.user.sub, query);
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
}
