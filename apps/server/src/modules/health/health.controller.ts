import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../../common/api-error.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { MailService } from '../../infrastructure/mail.service.js';
import { StorageService } from '../../infrastructure/storage.service.js';

export class HealthDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
  @ApiProperty() service!: string;
  @ApiProperty() version!: string;
  @ApiProperty({ format: 'date-time' }) timestamp!: string;
}
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}
  private response(): HealthDto {
    return {
      status: 'ok',
      service: 'uniflow-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
  @Get('live')
  @ApiOperation({ operationId: 'getLiveness', summary: 'Process liveness' })
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return this.response();
  }
  @Get('ready')
  @ApiOperation({
    operationId: 'getReadiness',
    summary: 'Database, queue, storage and SMTP readiness',
  })
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorDto })
  async ready(): Promise<HealthDto> {
    const checks = await Promise.allSettled([
      this.db.$queryRaw`SELECT 1`,
      this.db.$queryRaw`SELECT name FROM pgboss.queue LIMIT 1`,
      this.storage.check(),
      this.mail.check(),
    ]);
    const failed = checks.flatMap((result, index) =>
      result.status === 'rejected' ? [['database', 'queue', 'storage', 'smtp'][index]] : [],
    );
    if (failed.length) {
      this.logger.warn(JSON.stringify({ event: 'readiness_failed', dependencies: failed }));
      throw new ServiceUnavailableException();
    }
    return this.response();
  }
}
