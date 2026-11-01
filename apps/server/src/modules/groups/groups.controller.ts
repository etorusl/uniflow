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
import { GroupsService } from './groups.service.js';
import {
  AuditPageDto,
  GroupDto,
  GroupInputDto,
  GroupsPageDto,
  InvitationInputDto,
  InvitationSecretDto,
  InvitationsPageDto,
  JoinInputDto,
  MembersPageDto,
  RoleInputDto,
  SubjectLinkDto,
  TransferInputDto,
} from './groups.dto.js';

@ApiTags('Groups')
@UseGuards(SessionGuard)
@Controller('groups')
export class GroupsController {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}
  @Get() @ApiOkResponse({ type: GroupsPageDto }) list(
    @CurrentUser() u: UserDto,
    @Query() q: PaginationDto,
  ) {
    return this.groups.list(u.id, q);
  }
  @Post() @HttpCode(200) @ApiOkResponse({ type: GroupDto }) create(
    @CurrentUser() u: UserDto,
    @Body() b: GroupInputDto,
  ) {
    return this.groups.create(u.id, b);
  }
  @Post('join') @HttpCode(200) @ApiOkResponse({ type: GroupDto }) join(
    @CurrentUser() u: UserDto,
    @Body() b: JoinInputDto,
  ) {
    return this.groups.join(u.id, b.code);
  }
  @Get(':groupId') @ApiOkResponse({ type: GroupDto }) get(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
  ) {
    return this.groups.get(u.id, g);
  }
  @Patch(':groupId') @ApiOkResponse({ type: GroupDto }) update(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Body() b: GroupInputDto,
  ) {
    return this.groups.update(u.id, g, b);
  }
  @Delete(':groupId') @HttpCode(204) archive(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
  ) {
    return this.groups.archive(u.id, g);
  }
  @Patch(':groupId/me/subject') @ApiOkResponse({ type: GroupDto }) subject(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Body() b: SubjectLinkDto,
  ) {
    return this.groups.linkSubject(u.id, g, b.subjectId ?? null);
  }
  @Get(':groupId/members') @ApiOkResponse({ type: MembersPageDto }) members(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Query() q: PaginationDto,
  ) {
    return this.groups.members(u.id, g, q);
  }
  @Patch(':groupId/members/:userId') @HttpCode(204) role(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('userId', ParseUUIDPipe) t: string,
    @Body() b: RoleInputDto,
  ) {
    return this.groups.changeRole(u.id, g, t, b.role);
  }
  @Delete(':groupId/members/:userId') @HttpCode(204) remove(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('userId', ParseUUIDPipe) t: string,
  ) {
    return this.groups.removeMember(u.id, g, t);
  }
  @Post(':groupId/leave') @HttpCode(204) leave(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
  ) {
    return this.groups.leave(u.id, g);
  }
  @Post(':groupId/transfer-ownership') @HttpCode(204) transfer(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Body() b: TransferInputDto,
  ) {
    return this.groups.transfer(u.id, g, b.userId);
  }
  @Get(':groupId/invitations') @ApiOkResponse({ type: InvitationsPageDto }) invitations(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Query() q: PaginationDto,
  ) {
    return this.groups.invitations(u.id, g, q);
  }
  @Post(':groupId/invitations') @HttpCode(200) @ApiOkResponse({ type: InvitationSecretDto }) invite(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Body() b: InvitationInputDto,
  ) {
    return this.groups.invite(u.id, g, b);
  }
  @Delete(':groupId/invitations/:id') @HttpCode(204) revoke(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groups.revoke(u.id, g, id);
  }
  @Get(':groupId/history') @ApiOkResponse({ type: AuditPageDto }) history(
    @CurrentUser() u: UserDto,
    @Param('groupId', ParseUUIDPipe) g: string,
    @Query() q: PaginationDto,
  ) {
    return this.groups.history(u.id, g, q);
  }
}
