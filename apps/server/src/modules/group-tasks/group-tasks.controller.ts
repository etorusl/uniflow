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
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '../../common/pagination.dto.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import { TaskDto, TasksPageDto, TasksQueryDto, StatisticsDto } from '../tasks/tasks.dto.js';
import { GroupTasksService } from './group-tasks.service.js';
import { GroupTaskCreateDto, GroupTaskUpdateDto, GroupTaskHistoryDto } from './group-tasks.dto.js';
@ApiTags('Group tasks')
@UseGuards(SessionGuard)
@Controller('groups/:groupId')
export class GroupTasksController {
  constructor(@Inject(GroupTasksService) private readonly tasks: GroupTasksService) {}
  @Get('tasks') @ApiOkResponse({ type: TasksPageDto }) list(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Query() q: TasksQueryDto,
  ) {
    return this.tasks.list(u.id, g, q);
  }
  @Post('tasks') @HttpCode(200) @ApiOkResponse({ type: TaskDto }) create(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Body() b: GroupTaskCreateDto,
  ) {
    return this.tasks.create(u.id, g, b);
  }
  @Get('tasks/:id') @ApiOkResponse({ type: TaskDto }) get(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.get(u.id, g, id);
  }
  @Patch('tasks/:id') @ApiOkResponse({ type: TaskDto }) update(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: GroupTaskUpdateDto,
  ) {
    return this.tasks.update(u.id, g, id, b);
  }
  @Delete('tasks/:id') @HttpCode(204) remove(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.remove(u.id, g, id);
  }
  @Post('tasks/:id/complete') @HttpCode(200) @ApiOkResponse({ type: TaskDto }) complete(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.complete(u.id, g, id, true);
  }
  @Post('tasks/:id/reopen') @HttpCode(200) @ApiOkResponse({ type: TaskDto }) reopen(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.complete(u.id, g, id, false);
  }
  @Get('tasks/:id/history') @ApiOkResponse({ type: GroupTaskHistoryDto }) history(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PaginationDto,
  ) {
    return this.tasks.history(u.id, g, id, q);
  }
  @Get('statistics') @ApiOkResponse({ type: StatisticsDto }) statistics(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
  ) {
    return this.tasks.statistics(u.id, g);
  }
}
