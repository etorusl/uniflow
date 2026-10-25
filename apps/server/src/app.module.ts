import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({ imports: [InfrastructureModule, AuthModule], controllers: [HealthController] })
export class AppModule {}
