import { Controller, Get, Inject, Module, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthModule } from '../auth/auth.module.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TasksService } from '../tasks/tasks.service.js';
import { StatisticsDto } from '../tasks/tasks.dto.js';

@ApiTags('Statistics')
@UseGuards(SessionGuard)
@Controller('statistics')
class StatisticsController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Get('me') @ApiOkResponse({ type: StatisticsDto }) statistics(@CurrentUser() user: UserDto) {
    return this.tasks.statistics(user.id);
  }
}
@Module({ imports: [AuthModule, TasksModule], controllers: [StatisticsController] })
export class StatisticsModule {}
