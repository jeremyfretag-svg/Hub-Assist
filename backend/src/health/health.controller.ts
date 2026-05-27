import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Basic health check' })
  async check() {
    const result = await this.health.check([() => this.db.pingCheck('database')]);
    return {
      status: result.status === 'ok' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: result.details?.database?.status === 'up' ? 'connected' : 'disconnected',
    };
  }

  @Get('detailed')
  @Roles(UserRole.ADMIN)
  @HealthCheck()
  @ApiOperation({ summary: 'Detailed health check (admin only)' })
  async detailed() {
    const result = await this.health.check([() => this.db.pingCheck('database')]);
    const mem = process.memoryUsage();
    return {
      status: result.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: result.details?.database ?? {},
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
      version: process.env.npm_package_version ?? '0.1.0',
      nodeVersion: process.version,
    };
  }
}
