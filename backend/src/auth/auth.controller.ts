import { Body, Controller, Post, UseGuards, Req, Get, Sse } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SessionBroadcastService } from './session-broadcast.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Observable, interval } from 'rxjs';
import { map } from 'rxjs/operators';

@ApiTags('auth')
@Controller({ version: '1', path: 'auth' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionBroadcastService: SessionBroadcastService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'SecurePassword123!' },
      },
      required: ['email', 'password'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string' },
      },
    },
  })
  register(@Body() body: { firstName: string; lastName: string; email: string; password: string }) {
    return this.authService.register(body.email, body.password, body.firstName, body.lastName);
  }

  @Post('login')
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'SecurePassword123!' },
      },
      required: ['email', 'password'],
    },
  })
  @ApiResponse({ status: 200, description: 'Login successful', schema: { type: 'object', properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } } } })
  @ApiResponse({ status: 429, description: 'Too Many Requests', headers: { 'Retry-After': { description: 'Seconds until the rate limit resets', schema: { type: 'integer' } } } })
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('verify-otp')
  @Public()
  @ApiOperation({ summary: 'Verify OTP' })
  @ApiResponse({ status: 200, description: 'OTP verified successfully' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.otp);
  }

  @Post('resend-otp')
  @Public()
  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @ApiOperation({ summary: 'Resend OTP' })
  @ApiResponse({ status: 200, description: 'OTP resent successfully' })
  @ApiResponse({ status: 429, description: 'Too Many Requests', headers: { 'Retry-After': { description: 'Seconds until the rate limit resets', schema: { type: 'integer' } } } })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('csrf-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get CSRF token for state-mutating requests' })
  @ApiResponse({
    status: 200,
    description: 'CSRF token generated successfully',
    schema: {
      type: 'object',
      properties: {
        csrfToken: { type: 'string', description: 'CSRF token to include in X-CSRF-Token header' },
      },
    },
  })
  async getCsrfToken(@Req() req: any) {
    const csrfToken = await this.csrfService.generateToken(req.user.jti);
    return { csrfToken };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Logout user — immediately revokes the current access token' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Req() req: any) {
    // Invalidate CSRF token on logout
    if (req.user?.jti) {
      await this.csrfService.invalidateToken(req.user.jti);
    }
    // req.user is populated by JwtStrategy.validate()
    // Pass jti + exp so the access token is blacklisted in Redis immediately.
    return this.authService.logout(req.user.id, req.user.jti, req.user.exp);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Logout from all devices — revokes all refresh tokens and broadcasts session termination' })
  @ApiResponse({ status: 200, description: 'Logged out from all devices' })
  async logoutAll(@Req() req: any) {
    const result = await this.authService.logoutAll(req.user.id, req.user.jti, req.user.exp);
    // Broadcast session revocation to all connected SSE clients
    this.sessionBroadcastService.broadcastSessionRevocation(req.user.id);
    return result;
  }

  @Get('session-events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Server-Sent Events stream for session termination notifications' })
  @ApiResponse({ status: 200, description: 'SSE stream established' })
  @Sse()
  sessionEvents(@Req() req: any): Observable<any> {
    const userId = req.user.id;
    const eventStream = this.sessionBroadcastService.getSessionEventStream(userId);

    // Emit heartbeat every 30 seconds to keep connection alive
    const heartbeat$ = interval(30000).pipe(
      map(() => ({ data: { type: 'heartbeat', timestamp: new Date() } })),
    );

    // Merge event stream with heartbeat
    return new Observable((subscriber) => {
      const eventSub = eventStream.subscribe({
        next: (event) => subscriber.next({ data: event }),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      const heartbeatSub = heartbeat$.subscribe({
        next: (hb) => subscriber.next(hb),
        error: (err) => subscriber.error(err),
      });

      return () => {
        eventSub.unsubscribe();
        heartbeatSub.unsubscribe();
        this.sessionBroadcastService.cleanupSessionStream(userId);
      };
    });
  }

  @Post('forgot-password')
  @Public()
  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Password reset OTP sent' })
  @ApiResponse({ status: 429, description: 'Too Many Requests', headers: { 'Retry-After': { description: 'Seconds until the rate limit resets', schema: { type: 'integer' } } } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
  }
}
