import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, url, ip } = req;
    const requestId = req['requestId'];

    res.on('finish', () => {
      this.logger.info(`${method} ${url}`, {
        context: HttpLoggerMiddleware.name,
        requestId,
        statusCode: res.statusCode,
        responseTime: Date.now() - startTime,
        ip,
      });
    });

    next();
  }
}
