import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CacheInterceptor, CacheKey, CacheTTL, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './workspaces.dto';
import { WorkspaceType, WorkspaceAvailability } from './workspace.entity';

const WORKSPACES_CACHE_KEY = 'workspaces';

@ApiTags('workspaces')
@Controller({ version: '1', path: 'workspaces' })
export class WorkspacesController {
  constructor(
    private service: WorkspacesService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private async invalidateWorkspacesCache() {
    await this.cacheManager.del(WORKSPACES_CACHE_KEY);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a new workspace' })
  @ApiResponse({ status: 201, description: 'Workspace created successfully' })
  async create(@Body() dto: CreateWorkspaceDto) {
    const result = await this.service.create(dto);
    await this.invalidateWorkspacesCache();
    return result;
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey(WORKSPACES_CACHE_KEY)
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get all workspaces (paginated and filterable)' })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 10 })
  @ApiQuery({ name: 'type', enum: WorkspaceType, required: false })
  @ApiQuery({ name: 'availability', enum: WorkspaceAvailability, required: false })
  @ApiResponse({ status: 200, description: 'Workspaces retrieved successfully' })
  findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('type') type?: WorkspaceType,
    @Query('availability') availability?: WorkspaceAvailability,
  ) {
    return this.service.findAll(page, limit, type, availability);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Workspace ID' })
  @ApiResponse({ status: 200, description: 'Workspace retrieved successfully' })
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update workspace' })
  @ApiParam({ name: 'id', type: String, description: 'Workspace ID' })
  @ApiResponse({ status: 200, description: 'Workspace updated successfully' })
  async update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    const result = await this.service.update(id, dto);
    await this.invalidateWorkspacesCache();
    return result;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete workspace (soft delete)' })
  @ApiParam({ name: 'id', type: String, description: 'Workspace ID' })
  @ApiResponse({ status: 200, description: 'Workspace deleted successfully' })
  async delete(@Param('id') id: string) {
    const result = await this.service.softDelete(id);
    await this.invalidateWorkspacesCache();
    return result;
  }
}
