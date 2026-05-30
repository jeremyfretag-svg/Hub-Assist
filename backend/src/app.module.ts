import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CacheModule } from '@nestjs/cache-manager';
import { pinoLoggerConfig } from './config/logger.config';
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
import { AppLoggerModule } from './common/logger/logger.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
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
    // Pino structured JSON logger — replaces nest-winston
    LoggerModule.forRoot(pinoLoggerConfig),
    // App-wide LoggerService wrapper (auto-injects correlationId/userId)
    AppLoggerModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.get('database');
        return config || {};
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    CacheModule.register({ isGlobal: true }),
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // LoggingInterceptor registered here so DI (LoggerService) works
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // RequestIdMiddleware runs first (kept for backward compat with x-request-id)
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    // HttpLoggerMiddleware seeds AsyncLocalStorage with correlationId
    consumer
      .apply(HttpLoggerMiddleware)
      .exclude('health', 'health/live', 'health/ready')
      .forRoutes('*');
  }
}
