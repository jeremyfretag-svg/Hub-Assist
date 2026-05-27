import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('bearer')
@Controller({ version: '1', path: 'dashboard' })
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('stats')
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
  @ApiOperation({ summary: 'Get member growth over the last 12 months' })
  @ApiResponse({ status: 200, description: 'Member growth data retrieved successfully' })
  getGrowth() {
    return this.service.getGrowth();
  }

  @Get('admin-stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get admin statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Admin stats retrieved successfully' })
  getAdminStats() {
    return this.service.getAdminStats();
  }
}
