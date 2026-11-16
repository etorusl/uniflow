import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '../../common/pagination.dto.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import { StatisticsDto } from '../tasks/tasks.dto.js';
import {
  AccessibleGroupTasksQueryDto,
  GroupTaskDto,
  GroupTaskHistoryDto,
  GroupTaskInputDto,
  GroupTasksPageDto,
  GroupTasksQueryDto,
  NewGroupTaskInputDto,
} from './group-tasks.dto.js';
import { GroupTasksService } from './group-tasks.service.js';

@ApiTags('Group tasks')
@UseGuards(SessionGuard)
@Controller('groups/tasks')
export class AccessibleGroupTasksController {
  constructor(@Inject(GroupTasksService) private readonly tasks: GroupTasksService) {}

  @Get()
  @ApiOkResponse({ type: GroupTasksPageDto })
  list(@CurrentUser() user: UserDto, @Query() query: AccessibleGroupTasksQueryDto) {
    return this.tasks.personalList(user.id, query);
  }
}

@ApiTags('Group tasks')
@UseGuards(SessionGuard)
@Controller('groups/:groupId')
export class GroupTasksController {
  constructor(@Inject(GroupTasksService) private readonly tasks: GroupTasksService) {}

  @Get('tasks')
  @ApiOkResponse({ type: GroupTasksPageDto })
  list(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: GroupTasksQueryDto,
  ) {
    return this.tasks.list(groupId, user.id, query);
  }

  @Post('tasks')
  @ApiCreatedResponse({ type: GroupTaskDto })
  create(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: NewGroupTaskInputDto,
  ) {
    return this.tasks.create(groupId, user.id, input);
  }

  @Get('tasks/:id')
  @ApiOkResponse({ type: GroupTaskDto })
  get(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.get(groupId, id, user.id);
  }

  @Patch('tasks/:id')
  @ApiOkResponse({ type: GroupTaskDto })
  update(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: GroupTaskInputDto,
  ) {
    return this.tasks.update(groupId, id, user.id, input);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.remove(groupId, id, user.id);
  }

  @Post('tasks/:id/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: GroupTaskDto })
  complete(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.complete(groupId, id, user.id, true);
  }

  @Post('tasks/:id/reopen')
  @HttpCode(200)
  @ApiOkResponse({ type: GroupTaskDto })
  reopen(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.complete(groupId, id, user.id, false);
  }

  @Get('tasks/:id/history')
  @ApiOkResponse({ type: GroupTaskHistoryDto })
  history(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationDto,
  ) {
    return this.tasks.history(groupId, id, user.id, query);
  }

  @Get('statistics')
  @ApiOkResponse({ type: StatisticsDto })
  statistics(@CurrentUser() user: UserDto, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.tasks.sharedStatistics(groupId, user.id);
  }
}
