import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SubjectsController, TeachersController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
@Module({
  imports: [AuthModule],
  controllers: [SubjectsController, TeachersController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
