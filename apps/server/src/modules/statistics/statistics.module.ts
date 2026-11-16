import { Controller, Get, Inject, Module, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthModule } from '../auth/auth.module.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TasksService } from '../tasks/tasks.service.js';
import { StatisticsDto } from '../tasks/tasks.dto.js';
import { GroupsModule } from '../groups/groups.module.js';
import { GroupTasksService } from '../groups/group-tasks.service.js';

@ApiTags('Statistics')
@UseGuards(SessionGuard)
@Controller('statistics')
class StatisticsController {
  constructor(
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(GroupTasksService) private readonly groupTasks: GroupTasksService,
  ) {}
  @Get('me') @ApiOkResponse({ type: StatisticsDto }) async statistics(
    @CurrentUser() user: UserDto,
  ) {
    const [personal, group] = await Promise.all([
      this.tasks.statistics(user.id),
      this.groupTasks.personalStatistics(user.id),
    ]);
    const total = personal.total + group.total;
    const completedOnTime = personal.completedOnTime + group.completedOnTime;
    const completedLate = personal.completedLate + group.completedLate;
    return {
      total,
      open: personal.open + group.open,
      completedOnTime,
      completedLate,
      overdue: personal.overdue + group.overdue,
      completionRate: total ? Math.round(((completedOnTime + completedLate) / total) * 100) : 0,
    };
  }
}
@Module({ imports: [AuthModule, TasksModule, GroupsModule], controllers: [StatisticsController] })
export class StatisticsModule {}
