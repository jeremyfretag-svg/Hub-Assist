import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './utils/error';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // URI versioning — all routes become /api/v{n}/...
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Security headers
  app.use(helmet());

  // Response compression
  app.use(compression());

  // CORS — whitelist FRONTEND_URL, allow credentials
  app.enableCors({
    origin: configService.get('FRONTEND_URL'),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('HubAssist API')
    .setDescription(
      'A comprehensive coworking and workspace management system powered by Stellar.\n\n' +
      '## Response Format\n\n' +
      'All successful responses are wrapped in a consistent envelope:\n\n' +
      '```json\n' +
      '{\n' +
      '  "success": true,\n' +
      '  "data": <payload>,\n' +
      '  "timestamp": "2026-05-27T16:00:00.000Z"\n' +
      '}\n' +
      '```\n\n' +
      'Error responses retain their original shape (statusCode, message, error, timestamp, path).\n\n' +
      '## Rate Limiting\n\n' +
      'All endpoints are rate-limited. Exceeded limits return **429 Too Many Requests** with:\n\n' +
      '| Header | Description |\n' +
      '|--------|-------------|\n' +
      '| `X-RateLimit-Limit` | Maximum requests allowed in the window |\n' +
      '| `X-RateLimit-Window` | Window duration in seconds |\n' +
      '| `Retry-After` | Seconds until the limit resets |\n\n' +
      'Stricter limits apply to auth endpoints: `/auth/login` (5/min), `/auth/resend-otp` (3/5min).\n\n' +
      '## Idempotency\n\n' +
      'State-mutating endpoints (`POST /bookings`, etc.) require an `X-Idempotency-Key` header.\n' +
      'Duplicate requests with the same key and user return the original response for 5 minutes.',
    )
    .setVersion('1.0.0')
    .addServer('/api/v1', 'Version 1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(3001);
  console.log('HubAssist API running on http://localhost:3001');
  console.log('Swagger UI available at http://localhost:3001/api/docs');
}
bootstrap();
