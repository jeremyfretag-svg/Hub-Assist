import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { BookingsController } from './bookings.controller';
import { StellarModule } from '../stellar/stellar.module';
import { Workspace } from '../workspaces/workspace.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Workspace]),
    StellarModule,
    NotificationsModule,
    PricingModule,
  ],
  providers: [BookingsService, ConflictDetectionService, RolesGuard],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
