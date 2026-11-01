import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { GroupTasksService } from './group-tasks.service.js';
import { GroupTasksController } from './group-tasks.controller.js';
@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [GroupTasksController],
  providers: [GroupTasksService],
  exports: [GroupTasksService],
})
export class GroupTasksModule {}
