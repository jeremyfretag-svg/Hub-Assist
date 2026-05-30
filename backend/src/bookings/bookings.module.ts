import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { CancellationPolicy } from './cancellation-policy.entity';
import { BookingsService } from './bookings.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { RecurrenceService } from './recurrence.service';
import { CancellationPolicyService } from './cancellation-policy.service';
import { BookingsController } from './bookings.controller';
import { StellarModule } from '../stellar/stellar.module';
import { Workspace } from '../workspaces/workspace.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Workspace, CancellationPolicy]),
    StellarModule,
    NotificationsModule,
  ],
  providers: [
    BookingsService,
    ConflictDetectionService,
    RecurrenceService,
    CancellationPolicyService,
    RolesGuard,
  ],
  controllers: [BookingsController],
  exports: [BookingsService, CancellationPolicyService],
})
export class BookingsModule {}
