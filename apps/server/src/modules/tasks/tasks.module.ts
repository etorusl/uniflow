import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
