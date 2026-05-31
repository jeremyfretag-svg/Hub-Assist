import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingDto } from './bookings.dto';

@ApiTags('bookings')
@ApiBearerAuth('bearer')
@Controller({ version: '1', path: 'bookings' })
export class BookingsController {
  constructor(private service: BookingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Create a new booking',
    description: `Creates a new booking with **dynamic pricing**.

## Pricing Rules

Booking cost is calculated by the PricingEngine using time-of-day rates, day-of-week multipliers, and membership tier discounts.

### How it works
1. The booking window is split into hour-aligned segments.
2. Each segment is matched against active \`PriceRule\` records for the workspace (by \`dayOfWeek\` + \`startHour\`/\`endHour\`).
3. If no rule matches a segment, the workspace's base \`pricePerHour\` is used as a fallback.
4. A tier discount is applied to the gross total:

| Role   | Discount |
|--------|----------|
| member | 10 %     |
| staff  | 15 %     |
| admin  | 0 %      |

### Rate Snapshot
The full pricing breakdown is stored in \`appliedRateSnapshot\` (JSONB) on the booking record for historical auditability. This snapshot is immutable after creation — changing price rules later does **not** affect existing bookings.

### Conflict Rules
| Condition | Description |
|-----------|-------------|
| Maintenance Window | The requested time falls within an admin-set maintenance window |
| Capacity Limits | The requested time exceeds the maximum capacity of the workspace |
| Overlapping Time | For a single-capacity workspace, another booking already occupies the time range |`,
  })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({
    status: 409,
    description: 'Workspace booking conflict detected',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'Workspace booking conflict detected' },
        conflictDetail: {
          type: 'object',
          properties: {
            reason: { type: 'string', example: 'Capacity Exceeded' },
            conflictingBookingId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
            overlappingWindow: {
              type: 'object',
              properties: {
                startTime: { type: 'string', format: 'date-time' },
                endTime: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  })
  create(@Request() req: any, @Body() dto: CreateBookingDto) {
    return this.service.create(req.user.id, dto, req.user.role ?? 'member');
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all bookings (user sees own, admin sees all)' })
  @ApiResponse({ status: 200, description: 'Bookings retrieved successfully' })
   findAll(@Request() req: any) {
     const isAdmin = req.user.role === 'admin';
     return this.service.findAll(isAdmin ? undefined : req.user.id, isAdmin);
   }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking retrieved successfully' })
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Confirm booking' })
  @ApiParam({ name: 'id', type: String, description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking confirmed successfully' })
  confirm(@Param('id') id: string) {
    return this.service.confirm(id);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel booking' })
  @ApiParam({ name: 'id', type: String, description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
   cancel(@Param('id') id: string, @Request() req: any) {
     return this.service.cancel(id, req.user.id);
   }

  @Get('workspace/:workspaceId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get bookings for a workspace' })
  @ApiParam({ name: 'workspaceId', type: String, description: 'Workspace ID' })
  @ApiResponse({ status: 200, description: 'Workspace bookings retrieved successfully' })
  findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.service.findByWorkspace(workspaceId);
  }
}
