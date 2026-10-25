import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ScheduleController, SemestersController } from './schedule.controller.js';
import { ScheduleService } from './schedule.service.js';
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [ScheduleController, SemestersController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
