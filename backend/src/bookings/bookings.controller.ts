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
  ApiHeader,
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
    description: `Creates a new booking.
    
Conflict Rules:
| Condition | Description |
|-----------|-------------|
| Maintenance Window | The requested time falls within an admin-set maintenance window |
| Capacity Limits | The requested time exceeds the maximum capacity of the workspace |
| Overlapping Time | For a single capacity workspace, another booking already occupies the time range |`
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    description:
      'Client-generated unique key (UUID v4 recommended) that prevents duplicate bookings ' +
      'caused by network retries or UI double-submits. ' +
      'The same key scoped to the same user returns the original response for up to 5 minutes. ' +
      'Must be 1–128 printable ASCII characters with no whitespace. **Required.**',
    required: true,
    schema: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
  })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({
    status: 200,
    description: 'Duplicate request — original response replayed (idempotent)',
  })
  @ApiResponse({
    status: 409,
    description: 'Workspace booking conflict detected OR concurrent duplicate key in-flight',
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
                endTime: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 422,
    description: 'Missing or malformed X-Idempotency-Key header',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 422 },
        message: { type: 'string', example: 'X-Idempotency-Key header is required for this endpoint' },
        error: { type: 'string', example: 'Unprocessable Entity' },
      },
    },
  })
   create(@Request() req: any, @Body() dto: CreateBookingDto) {
     return this.service.create(req.user.id, dto);
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
