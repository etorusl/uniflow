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
import {
  MaterialDto,
  MaterialInputDto,
  MaterialsPageDto,
  MaterialUpdateDto,
} from './materials.dto.js';
import { MaterialsService } from './materials.service.js';
@ApiTags('Materials')
@UseGuards(SessionGuard)
@Controller('groups/:groupId/materials')
export class MaterialsController {
  constructor(@Inject(MaterialsService) private readonly materials: MaterialsService) {}
  @Get() @ApiOkResponse({ type: MaterialsPageDto }) list(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Query() q: PaginationDto,
  ) {
    return this.materials.list(u.id, g, q);
  }
  @Post() @HttpCode(200) @ApiOkResponse({ type: MaterialDto }) create(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Body() b: MaterialInputDto,
  ) {
    return this.materials.create(u.id, g, b);
  }
  @Get(':id') @ApiOkResponse({ type: MaterialDto }) get(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.materials.get(u.id, g, id);
  }
  @Patch(':id') @ApiOkResponse({ type: MaterialDto }) update(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: MaterialUpdateDto,
  ) {
    return this.materials.update(u.id, g, id, b);
  }
  @Delete(':id') @HttpCode(204) remove(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.materials.remove(u.id, g, id);
  }
}
