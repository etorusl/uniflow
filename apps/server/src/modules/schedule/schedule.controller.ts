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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '../../common/pagination.dto.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import { ScheduleService } from './schedule.service.js';
import {
  EntriesPageDto,
  EntryDto,
  EntryInputDto,
  ExceptionInputDto,
  OccurrencesDto,
  OccurrencesQueryDto,
  SemesterDto,
  SemesterInputDto,
  SemestersPageDto,
} from './schedule.dto.js';

@ApiTags('Semesters')
@UseGuards(SessionGuard)
@Controller('semesters')
export class SemestersController {
  constructor(@Inject(ScheduleService) private readonly schedule: ScheduleService) {}
  @Get() @ApiOkResponse({ type: SemestersPageDto }) list(
    @CurrentUser() user: UserDto,
    @Query() query: PaginationDto,
  ) {
    return this.schedule.semesters(user.id, query);
  }
  @Post() @HttpCode(200) @ApiOkResponse({ type: SemesterDto }) create(
    @CurrentUser() user: UserDto,
    @Body() input: SemesterInputDto,
  ) {
    return this.schedule.createSemester(user.id, input);
  }
  @Patch(':id') @ApiOkResponse({ type: SemesterDto }) update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SemesterInputDto,
  ) {
    return this.schedule.updateSemester(user.id, id, input);
  }
  @Delete(':id') @HttpCode(204) remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedule.deleteSemester(user.id, id);
  }
}
@ApiTags('Schedule')
@UseGuards(SessionGuard)
@Controller('schedule')
export class ScheduleController {
  constructor(@Inject(ScheduleService) private readonly schedule: ScheduleService) {}
  @Get('entries') @ApiOkResponse({ type: EntriesPageDto }) list(
    @CurrentUser() user: UserDto,
    @Query() query: PaginationDto,
  ) {
    return this.schedule.entries(user.id, query);
  }
  @Post('entries') @HttpCode(200) @ApiOkResponse({ type: EntryDto }) create(
    @CurrentUser() user: UserDto,
    @Body() input: EntryInputDto,
  ) {
    return this.schedule.createEntry(user.id, input);
  }
  @Patch('entries/:id') @ApiOkResponse({ type: EntryDto }) update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: EntryInputDto,
  ) {
    return this.schedule.updateEntry(user.id, id, input);
  }
  @Delete('entries/:id') @HttpCode(204) remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedule.deleteEntry(user.id, id);
  }
  @Get('occurrences') @ApiOkResponse({ type: OccurrencesDto }) occurrences(
    @CurrentUser() user: UserDto,
    @Query() query: OccurrencesQueryDto,
  ) {
    return this.schedule.occurrences(user.id, user.timeZone, query);
  }
  @Put('entries/:id/exceptions/:date') @HttpCode(204) exception(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @Body() input: ExceptionInputDto,
  ) {
    return this.schedule.setException(user.id, id, date, input);
  }
  @Delete('entries/:id/exceptions/:date') @HttpCode(204) restore(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
  ) {
    return this.schedule.removeException(user.id, id, date);
  }
}
