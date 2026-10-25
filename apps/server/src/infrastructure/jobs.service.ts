import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENVIRONMENT, type Environment } from './environment.js';

export const PROBE_QUEUE = 'system.probe';
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  readonly boss: PgBoss;
  private readonly logger = new Logger(JobsService.name);
  constructor(@Inject(ENVIRONMENT) env: Environment) {
    this.boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss', max: 3 });
    this.boss.on('error', () => this.logger.error('Background queue connection failed.'));
  }
  async onModuleInit() {
    await this.boss.start();
    await this.boss.createQueue(PROBE_QUEUE);
  }
  async onModuleDestroy() {
    await this.boss.stop({ graceful: true, timeout: 5000 });
  }
}
