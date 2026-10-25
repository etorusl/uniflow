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
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import { TaskDto, TaskHistoryDto, TaskInputDto, TasksPageDto, TasksQueryDto } from './tasks.dto.js';
import { TasksService } from './tasks.service.js';

@ApiTags('Tasks')
@UseGuards(SessionGuard)
@Controller('tasks')
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Get() @ApiOkResponse({ type: TasksPageDto }) list(
    @CurrentUser() user: UserDto,
    @Query() query: TasksQueryDto,
  ) {
    return this.tasks.list(user.id, query);
  }
  @Post() @HttpCode(200) @ApiOkResponse({ type: TaskDto }) create(
    @CurrentUser() user: UserDto,
    @Body() input: TaskInputDto,
  ) {
    return this.tasks.create(user.id, input);
  }
  @Patch(':id') @ApiOkResponse({ type: TaskDto }) update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TaskInputDto,
  ) {
    return this.tasks.update(user.id, id, input);
  }
  @Delete(':id') @HttpCode(204) remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.remove(user.id, id);
  }
  @Post(':id/complete') @HttpCode(200) @ApiOkResponse({ type: TaskDto }) complete(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.complete(user.id, id, true);
  }
  @Post(':id/reopen') @HttpCode(200) @ApiOkResponse({ type: TaskDto }) reopen(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.complete(user.id, id, false);
  }
  @Get(':id/history') @ApiOkResponse({ type: TaskHistoryDto }) history(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.history(user.id, id);
  }
}
