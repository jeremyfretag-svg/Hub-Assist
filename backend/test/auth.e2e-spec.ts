import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, UnauthorizedException, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

const JWT_SECRET = 'hubassist-secret';

const mockAuthService = {
  register: jest.fn(),
  verifyOtp: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  resendOtp: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
};

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const makeToken = (id = 'user-uuid-1') =>
    jwtService.sign({ sub: id, email: 'user@test.com', role: 'member' });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AuthController],
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = module.get(JwtService);
  });

  afterAll(() => app.close());

  beforeEach(() => jest.clearAllMocks());

  // ── POST /api/v1/auth/register ────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('201 – creates user and returns message', async () => {
      mockAuthService.register.mockResolvedValue({
        message: 'User registered. Check your email for OTP.',
      });

      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'newuser@test.com', password: 'SecurePass123' })
        .expect(201)
        .expect((res) => expect(res.body.message).toBeDefined());
    });
  });

  // ── POST /api/v1/auth/login ───────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('201 – returns access and refresh tokens', async () => {
      mockAuthService.login.mockResolvedValue({
        access_token: 'access-jwt',
        refresh_token: 'refresh-uuid',
      });

      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'user@test.com', password: 'SecurePass123' })
        .expect(201)
        .expect((res) => {
          expect(res.body.access_token).toBeDefined();
          expect(res.body.refresh_token).toBeDefined();
        });
    });

    it('401 – wrong password returns unauthorized', async () => {
      mockAuthService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'user@test.com', password: 'WrongPass' })
        .expect(401);
    });
  });

  // ── POST /api/v1/auth/verify-otp ──────────────────────────────────────────────

  describe('POST /api/v1/auth/verify-otp', () => {
    it('201 – verifies account with valid OTP', async () => {
      mockAuthService.verifyOtp.mockResolvedValue({ message: 'Email verified successfully' });

      return request(app.getHttpServer())
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'user@test.com', otp: '123456' })
        .expect(201)
        .expect((res) => expect(res.body.message).toBe('Email verified successfully'));
    });
  });

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('201 – rotates tokens with valid refresh token', async () => {
      mockAuthService.refresh.mockResolvedValue({
        access_token: 'new-access-jwt',
        refresh_token: 'new-refresh-uuid',
      });

      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(201)
        .expect((res) => {
          expect(res.body.access_token).toBeDefined();
          expect(res.body.refresh_token).toBeDefined();
        });
    });

    it('401 – invalid refresh token returns unauthorized', async () => {
      mockAuthService.refresh.mockRejectedValue(
        new UnauthorizedException('Invalid or revoked refresh token'),
      );

      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });
  });

  // ── POST /api/v1/auth/forgot-password ────────────────────────────────────────

  describe('POST /api/v1/auth/forgot-password', () => {
    it('201 – sends reset OTP for existing email', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({
        message: 'Password reset OTP sent to your email',
      });

      return request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'user@test.com' })
        .expect(201)
        .expect((res) => expect(res.body.message).toBeDefined());
    });
  });

  // ── POST /api/v1/auth/reset-password ─────────────────────────────────────────

  describe('POST /api/v1/auth/reset-password', () => {
    it('201 – resets password with valid OTP', async () => {
      mockAuthService.resetPassword.mockResolvedValue({ message: 'Password reset successfully' });

      return request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ email: 'user@test.com', otp: '123456', newPassword: 'NewSecurePass123' })
        .expect(201)
        .expect((res) => expect(res.body.message).toBe('Password reset successfully'));
    });

    it('401 – invalid OTP returns unauthorized', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new UnauthorizedException('Invalid or expired OTP'),
      );

      return request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ email: 'user@test.com', otp: '000000', newPassword: 'NewSecurePass123' })
        .expect(401);
    });
  });

  // ── POST /api/v1/auth/logout ──────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('201 – revokes token for authenticated user', async () => {
      mockAuthService.logout.mockResolvedValue({ message: 'Logged out successfully' });

      return request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(201)
        .expect((res) => expect(res.body.message).toBe('Logged out successfully'));
    });

    it('401 – unauthenticated request is rejected', () =>
      request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401));
  });
});
