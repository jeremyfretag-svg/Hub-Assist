import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  UploadedFile,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  Req,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CacheInterceptor, CacheKey, CacheTTL, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from './user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';

@ApiTags('users')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1', path: 'users' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private userCacheKey(id: string) {
    return `user:${id}`;
  }
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (admin only, paginated)' })
  @ApiQuery({ name: 'skip', type: Number, required: false, example: 0 })
  @ApiQuery({ name: 'take', type: Number, required: false, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        users: { type: 'array' },
        total: { type: 'number' },
      },
    },
  })
  async findAll(@Query('skip') skip: number = 0, @Query('take') take: number = 10) {
    const [users, total] = await this.usersService.findAll(skip, take);
    return { users, total };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change own password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  changePassword(@Req() req: any, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.usersService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
  }

  @Get(':id')
  @UseInterceptors(CacheInterceptor)
  @CacheKey('user')
  @CacheTTL(600) // 10 minutes
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async update(@Param('id') id: string, @Body() data: any) {
    const result = await this.usersService.update(id, data);
    await this.cacheManager.del(this.userCacheKey(id));
    return result;
  }

  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(AuditInterceptor)
  @Audit('user.role_updated')
  @ApiOperation({ summary: 'Update user role (admin only) — immediately revokes the user\'s current access token' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  async updateRole(@Param('id') id: string, @Body('role') role: UserRole, @Req() req: any) {
    req.auditBefore = await this.usersService.findById(id);
    const result = await this.usersService.update(id, { role });
    await this.cacheManager.del(this.userCacheKey(id));

    // Blacklist the admin's current access token on role-change events so that
    // any token issued before the role change is immediately invalidated.
    // This also covers the case where the admin changes their own role.
    if (req.user?.jti && req.user?.exp !== undefined) {
      const nowMs = Date.now();
      const remainingMs = req.user.exp * 1000 - nowMs;
      await this.tokenBlacklistService.blacklistToken(req.user.jti, remainingMs);
    }

    return result;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user (soft delete)' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async delete(@Param('id') id: string) {
    const result = await this.usersService.delete(id);
    await this.cacheManager.del(this.userCacheKey(id));
    return result;
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate user' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User activated successfully' })
  activate(@Param('id') id: string) {
    return this.usersService.update(id, { isActive: true });
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  deactivate(@Param('id') id: string) {
    return this.usersService.update(id, { isActive: false });
  }

  @Post(':id/profile-picture')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiParam({ name: 'id', type: String, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Profile picture uploaded successfully' })
  async uploadProfilePicture(
    @Param('id') id: string,
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
  ) {
    const url = await this.cloudinaryService.uploadImage(file);
    const result = await this.usersService.updateProfilePicture(id, url);
    await this.cacheManager.del(this.userCacheKey(id));
    return result;
  }
}
