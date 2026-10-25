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
import { CatalogService } from './catalog.service.js';
import {
  SubjectDto,
  SubjectInputDto,
  SubjectsPageDto,
  TeacherDto,
  TeacherInputDto,
  TeachersPageDto,
} from './catalog.dto.js';

@ApiTags('Subjects')
@UseGuards(SessionGuard)
@Controller('subjects')
export class SubjectsController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get()
  @ApiOkResponse({ type: SubjectsPageDto })
  list(@CurrentUser() user: UserDto, @Query() query: PaginationDto) {
    return this.catalog.subjects(user.id, query);
  }
  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: SubjectDto })
  create(@CurrentUser() user: UserDto, @Body() input: SubjectInputDto) {
    return this.catalog.createSubject(user.id, input);
  }
  @Patch(':id')
  @ApiOkResponse({ type: SubjectDto })
  update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: SubjectInputDto,
  ) {
    return this.catalog.updateSubject(user.id, id, input);
  }
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: UserDto, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteSubject(user.id, id);
  }
}
@ApiTags('Teachers')
@UseGuards(SessionGuard)
@Controller('teachers')
export class TeachersController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get()
  @ApiOkResponse({ type: TeachersPageDto })
  list(@CurrentUser() user: UserDto, @Query() query: PaginationDto) {
    return this.catalog.teachers(user.id, query);
  }
  @Post()
  @HttpCode(200)
  @ApiOkResponse({ type: TeacherDto })
  create(@CurrentUser() user: UserDto, @Body() input: TeacherInputDto) {
    return this.catalog.createTeacher(user.id, input);
  }
  @Patch(':id')
  @ApiOkResponse({ type: TeacherDto })
  update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: TeacherInputDto,
  ) {
    return this.catalog.updateTeacher(user.id, id, input);
  }
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: UserDto, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deleteTeacher(user.id, id);
  }
}
