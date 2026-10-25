import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({ imports: [InfrastructureModule], controllers: [HealthController] })
export class AppModule {}
