import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { winstonConfig } from './config/logger.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContactModule } from './contact/contact.module';
import { AttendanceModule } from './attendance/attendance.module';
import { BookingsModule } from './bookings/bookings.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { StellarModule } from './stellar/stellar.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { HealthModule } from './health/health.module';
import { HubsModule } from './hubs/hubs.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OutboxModule } from './outbox/outbox.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AuditLogModule } from './audit/audit-log.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { validationSchema } from './config/validation.schema';
import { HttpLoggerMiddleware } from './common/middlewares/http-logger.middleware';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      validationSchema,
    }),
    WinstonModule.forRoot(winstonConfig),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.get('database');
        return config || {};
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    CacheModule.register({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    ContactModule,
    AttendanceModule,
    BookingsModule,
    WorkspacesModule,
    StellarModule,
    DashboardModule,
    NewsletterModule,
    CloudinaryModule,
    HealthModule,
    HubsModule,
    AnalyticsModule,
    NotificationsModule,
    OutboxModule,
    WebhooksModule,
    AuditLogModule.forRoot(),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer
      .apply(HttpLoggerMiddleware)
      .exclude('health', 'health/live', 'health/ready')
      .forRoutes('*');
  }
}
