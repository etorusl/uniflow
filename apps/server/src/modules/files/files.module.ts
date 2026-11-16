import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { AttachmentAccessService } from './attachment-access.service.js';
import { FilesCleanupService } from './files-cleanup.service.js';
import {
  AttachmentUploadGuard,
  FilesController,
  GroupMaterialsController,
  UploadCapacityInterceptor,
} from './files.controller.js';
import { FilesService } from './files.service.js';
import { GroupMaterialsService } from './group-materials.service.js';

@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [FilesController, GroupMaterialsController],
  providers: [
    AttachmentAccessService,
    AttachmentUploadGuard,
    UploadCapacityInterceptor,
    FilesService,
    GroupMaterialsService,
    FilesCleanupService,
  ],
  exports: [FilesCleanupService],
})
export class FilesModule {}
