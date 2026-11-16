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
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '../../common/pagination.dto.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { UserDto } from '../auth/auth.dto.js';
import {
  GroupDto,
  GroupInputDto,
  GroupInvitationInputDto,
  GroupInvitationsPageDto,
  GroupJoinInputDto,
  GroupMembersPageDto,
  GroupMembersQueryDto,
  GroupRoleInputDto,
  GroupsPageDto,
  GroupSubjectInputDto,
  NewGroupInvitationDto,
  TransferGroupInputDto,
} from './groups.dto.js';
import { GroupsService } from './groups.service.js';

@ApiTags('Groups')
@UseGuards(SessionGuard)
@Controller('groups')
export class GroupsController {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  @Get()
  @ApiOkResponse({ type: GroupsPageDto })
  list(@CurrentUser() user: UserDto, @Query() query: PaginationDto) {
    return this.groups.list(user.id, query);
  }

  @Post()
  @ApiCreatedResponse({ type: GroupDto })
  create(@CurrentUser() user: UserDto, @Body() input: GroupInputDto) {
    return this.groups.create(user.id, input);
  }

  @Post('join')
  @HttpCode(200)
  @ApiOkResponse({ type: GroupDto })
  join(@CurrentUser() user: UserDto, @Body() input: GroupJoinInputDto) {
    return this.groups.join(user.id, input.code);
  }

  @Get(':groupId')
  @ApiOkResponse({ type: GroupDto })
  get(@CurrentUser() user: UserDto, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.groups.get(groupId, user.id);
  }

  @Patch(':groupId')
  @ApiOkResponse({ type: GroupDto })
  update(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: GroupInputDto,
  ) {
    return this.groups.update(groupId, user.id, input);
  }

  @Delete(':groupId')
  @HttpCode(204)
  @ApiNoContentResponse()
  archive(@CurrentUser() user: UserDto, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.groups.archive(groupId, user.id);
  }

  @Put(':groupId/subject')
  @ApiOkResponse({ type: GroupDto })
  linkSubject(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: GroupSubjectInputDto,
  ) {
    return this.groups.linkSubject(groupId, user.id, input.subjectId);
  }

  @Get(':groupId/members')
  @ApiOkResponse({ type: GroupMembersPageDto })
  members(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: GroupMembersQueryDto,
  ) {
    return this.groups.members(groupId, user.id, query);
  }

  @Patch(':groupId/members/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  setRole(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: GroupRoleInputDto,
  ) {
    return this.groups.setRole(groupId, user.id, userId, input);
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  removeMember(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.groups.removeMember(groupId, user.id, userId);
  }

  @Post(':groupId/members/:userId/unblock')
  @HttpCode(204)
  @ApiNoContentResponse()
  unblock(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.groups.unblockMember(groupId, user.id, userId);
  }

  @Post(':groupId/leave')
  @HttpCode(204)
  @ApiNoContentResponse()
  leave(@CurrentUser() user: UserDto, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.groups.leave(groupId, user.id);
  }

  @Post(':groupId/transfer-ownership')
  @HttpCode(200)
  @ApiOkResponse({ type: GroupDto })
  transfer(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: TransferGroupInputDto,
  ) {
    return this.groups.transfer(groupId, user.id, input.userId);
  }

  @Get(':groupId/invitations')
  @ApiOkResponse({ type: GroupInvitationsPageDto })
  invitations(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: PaginationDto,
  ) {
    return this.groups.invitations(groupId, user.id, query);
  }

  @Post(':groupId/invitations')
  @ApiCreatedResponse({ type: NewGroupInvitationDto })
  invite(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() input: GroupInvitationInputDto,
  ) {
    return this.groups.createInvitation(groupId, user.id, input);
  }

  @Delete(':groupId/invitations/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  revoke(
    @CurrentUser() user: UserDto,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groups.revoke(groupId, user.id, id);
  }
}
