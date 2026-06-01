import { Controller, Get, UseInterceptors, Req, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CacheInterceptor, CacheKey, CacheTTL, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('bearer')
@Controller({ version: '1', path: 'dashboard' })
export class DashboardController {
  constructor(
    private service: DashboardService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Get('stats')
  @UseInterceptors(CacheInterceptor)
  @CacheKey('dashboard:stats')
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats retrieved successfully' })
  getStats() {
    return this.service.getStats();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get recent activity' })
  @ApiResponse({ status: 200, description: 'Activity retrieved successfully' })
  getActivity() {
    return this.service.getActivity();
  }

  @Get('growth')
  @UseInterceptors(CacheInterceptor)
  @CacheKey('dashboard:growth')
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get member growth over the last 12 months' })
  @ApiResponse({ status: 200, description: 'Member growth data retrieved successfully' })
  getGrowth() {
    return this.service.getGrowth();
  }

  @Get('admin-stats')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(CacheInterceptor)
  @CacheKey('dashboard:admin-stats')
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get admin statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Admin stats retrieved successfully' })
  getAdminStats() {
    return this.service.getAdminStats();
  }

  /**
   * Admin endpoint to manually flush dashboard cache.
   * Useful for testing or forcing a refresh.
   */
  @Get('admin/cache/flush')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Flush dashboard cache (admin only)' })
  @ApiResponse({ status: 200, description: 'Cache flushed successfully' })
  async flushCache() {
    await this.cacheManager.del('dashboard:stats');
    await this.cacheManager.del('dashboard:growth');
    await this.cacheManager.del('dashboard:admin-stats');
    return { message: 'Dashboard cache flushed' };
  }
}
