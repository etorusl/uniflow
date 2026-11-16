import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccessibleGroupTasksController, GroupTasksController } from './group-tasks.controller.js';
import { GroupTasksService } from './group-tasks.service.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AccessibleGroupTasksController, GroupsController, GroupTasksController],
  providers: [GroupsService, GroupTasksService],
  exports: [GroupsService, GroupTasksService],
})
export class GroupsModule {}
