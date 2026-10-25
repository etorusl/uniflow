import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ScheduleModule } from './modules/schedule/schedule.module.js';

@Module({
  imports: [InfrastructureModule, AuthModule, CatalogModule, ScheduleModule],
  controllers: [HealthController],
})
export class AppModule {}
