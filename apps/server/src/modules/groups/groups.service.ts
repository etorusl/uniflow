import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  GroupInvitation,
  GroupMember,
  Prisma,
  StudyGroup,
} from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { ENVIRONMENT, type Environment } from '../../infrastructure/environment.js';
import { JobsService } from '../../infrastructure/jobs.service.js';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import { hashToken } from '../auth/tokens.js';
import { enqueueReminderChange } from '../notifications/reminder-changes.js';
import type {
  GroupDto,
  GroupInputDto,
  GroupInvitationDto,
  GroupInvitationInputDto,
  GroupMemberDto,
  GroupMembersQueryDto,
  GroupRole,
  GroupRoleInputDto,
} from './groups.dto.js';

function publicGroup(group: StudyGroup, member: GroupMember): GroupDto {
  return {
    id: group.id,
    ownerId: group.ownerId,
    name: group.name,
    subjectName: group.subjectName,
    description: group.description,
    role: groupRole(group.ownerId, member),
    linkedSubjectId: member.subjectId,
    createdAt: group.createdAt.toISOString(),
  };
}
export function groupRole(
  ownerId: string,
  member: Pick<GroupMember, 'userId' | 'role'>,
): GroupRole {
  return ownerId === member.userId ? 'OWNER' : member.role;
}
function publicInvitation(row: GroupInvitation, canRevoke: boolean): GroupInvitationDto {
  return {
    id: row.id,
    creatorId: row.creatorId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    maxUses: row.maxUses,
    uses: row.uses,
    canRevoke,
  };
}
function deny() {
  throw new ForbiddenException('Недостаточно прав для этого действия.');
}
function missingInvitation() {
  return new NotFoundException('Приглашение недействительно или недоступно.');
}

@Injectable()
export class GroupsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  async lock(tx: Prisma.TransactionClient, groupId: string) {
    await tx.$queryRaw`SELECT id FROM study_groups WHERE id = ${groupId}::uuid FOR UPDATE`;
  }

  async requireMember(groupId: string, userId: string, tx: Prisma.TransactionClient = this.db) {
    const membership = await tx.groupMember.findFirst({
      where: { groupId, userId, leftAt: null, blockedAt: null, group: { archivedAt: null } },
      include: { group: true },
    });
    if (!membership) throw new NotFoundException('Группа не найдена.');
    return {
      membership,
      group: membership.group,
      role: groupRole(membership.group.ownerId, membership),
    };
  }

  private async change<T>(
    groupId: string,
    userId: string,
    fn: (
      tx: Prisma.TransactionClient,
      access: Awaited<ReturnType<GroupsService['requireMember']>>,
    ) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, groupId);
      return fn(tx, await this.requireMember(groupId, userId, tx));
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    groupId: string,
    actorId: string,
    kind: string,
    targetUserId?: string,
  ) {
    await tx.groupAuditEvent.create({ data: { groupId, actorId, kind, targetUserId } });
  }

  async create(userId: string, input: GroupInputDto) {
    return this.db.$transaction(async (tx) => {
      const group = await tx.studyGroup.create({ data: { ...input, ownerId: userId } });
      const member = await tx.groupMember.create({ data: { groupId: group.id, userId } });
      return publicGroup(group, member);
    });
  }

  async list(userId: string, query: PaginationDto) {
    const where = { userId, leftAt: null, blockedAt: null, group: { archivedAt: null } };
    const [rows, total] = await this.db.$transaction([
      this.db.groupMember.findMany({
        where,
        include: { group: true },
        ...pageQuery(query),
        orderBy: [{ group: { name: 'asc' } }, { groupId: 'asc' }],
      }),
      this.db.groupMember.count({ where }),
    ]);
    return { items: rows.map((row) => publicGroup(row.group, row)), total };
  }

  async get(groupId: string, userId: string) {
    const { group, membership } = await this.requireMember(groupId, userId);
    return publicGroup(group, membership);
  }

  async update(groupId: string, userId: string, input: GroupInputDto) {
    return this.change(groupId, userId, async (tx, { membership, role }) => {
      if (role !== 'OWNER') deny();
      return publicGroup(
        await tx.studyGroup.update({ where: { id: groupId }, data: input }),
        membership,
      );
    });
  }

  async archive(groupId: string, userId: string) {
    await this.change(groupId, userId, async (tx, { role }) => {
      if (role !== 'OWNER') deny();
      const archivedAt = new Date();
      await tx.studyGroup.update({ where: { id: groupId }, data: { archivedAt } });
      await tx.groupInvitation.updateMany({
        where: { groupId, revokedAt: null },
        data: { revokedAt: archivedAt },
      });
      await this.audit(tx, groupId, userId, 'ARCHIVED');
      await enqueueReminderChange(tx, this.jobs, { type: 'GROUP', groupId });
    });
  }

  async linkSubject(groupId: string, userId: string, subjectId: string | null) {
    return this.change(groupId, userId, async (tx, { group }) => {
      if (
        subjectId &&
        !(await tx.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } }))
      )
        throw new NotFoundException('Предмет не найден.');
      return publicGroup(
        group,
        await tx.groupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: { subjectId },
        }),
      );
    });
  }

  async members(groupId: string, userId: string, query: GroupMembersQueryDto) {
    return this.change(groupId, userId, async (tx, { group, role }) => {
      if (query.status === 'BLOCKED' && role !== 'OWNER') deny();
      const where: Prisma.GroupMemberWhereInput =
        query.status === 'BLOCKED'
          ? { groupId, blockedAt: { not: null } }
          : { groupId, leftAt: null, blockedAt: null };
      const rows = await tx.groupMember.findMany({
        where,
        include: { user: { select: { displayName: true } } },
        ...pageQuery(query),
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
      });
      const total = await tx.groupMember.count({ where });
      const items: GroupMemberDto[] = rows.map((row) => ({
        userId: row.userId,
        displayName: row.user.displayName,
        joinedAt: row.joinedAt.toISOString(),
        role: groupRole(group.ownerId, row),
        blocked: !!row.blockedAt,
      }));
      return { items, total };
    });
  }

  async setRole(groupId: string, actorId: string, userId: string, input: GroupRoleInputDto) {
    await this.change(groupId, actorId, async (tx, { group, role }) => {
      if (role !== 'OWNER' || userId === group.ownerId) deny();
      const { membership } = await this.requireMember(groupId, userId, tx);
      if (input.role === membership.role) return;
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { role: input.role },
      });
      await this.audit(
        tx,
        groupId,
        actorId,
        input.role === 'MODERATOR' ? 'PROMOTED' : 'DEMOTED',
        userId,
      );
    });
  }

  async transfer(groupId: string, actorId: string, userId: string) {
    return this.change(groupId, actorId, async (tx, { membership, role }) => {
      if (role !== 'OWNER') deny();
      if (actorId === userId) throw new ConflictException('Этот участник уже владеет группой.');
      await this.requireMember(groupId, userId, tx);
      const group = await tx.studyGroup.update({
        where: { id: groupId },
        data: { ownerId: userId },
      });
      const former = await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId: actorId } },
        data: { role: 'MODERATOR' },
      });
      await this.audit(tx, groupId, actorId, 'OWNERSHIP_TRANSFERRED', userId);
      return publicGroup(group, { ...membership, ...former });
    });
  }

  async leave(groupId: string, userId: string) {
    await this.change(groupId, userId, async (tx, { role }) => {
      if (role === 'OWNER') throw new ConflictException('Сначала передайте владение группой.');
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { leftAt: new Date(), role: 'MEMBER' },
      });
      await this.audit(tx, groupId, userId, 'LEFT', userId);
      await enqueueReminderChange(tx, this.jobs, { type: 'GROUP_USER', groupId, userId });
    });
  }

  async removeMember(groupId: string, actorId: string, userId: string) {
    await this.change(groupId, actorId, async (tx, { role }) => {
      if (role === 'MEMBER' || actorId === userId) deny();
      const target = await this.requireMember(groupId, userId, tx);
      if (target.role === 'OWNER' || (role === 'MODERATOR' && target.role === 'MODERATOR')) deny();
      const now = new Date();
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { leftAt: now, blockedAt: now, role: 'MEMBER' },
      });
      await this.audit(tx, groupId, actorId, 'REMOVED', userId);
      await enqueueReminderChange(tx, this.jobs, { type: 'GROUP_USER', groupId, userId });
    });
  }

  async unblockMember(groupId: string, actorId: string, userId: string) {
    await this.change(groupId, actorId, async (tx, { role }) => {
      if (role !== 'OWNER') deny();
      const result = await tx.groupMember.updateMany({
        where: { groupId, userId, blockedAt: { not: null } },
        data: { blockedAt: null },
      });
      if (result.count) await this.audit(tx, groupId, actorId, 'UNBLOCKED', userId);
    });
  }

  async createInvitation(groupId: string, userId: string, input: GroupInvitationInputDto) {
    return this.change(groupId, userId, async (tx, { role }) => {
      if (role === 'MEMBER') deny();
      const code = randomBytes(15).toString('base64url');
      const row = await tx.groupInvitation.create({
        data: {
          groupId,
          creatorId: userId,
          tokenHash: hashToken(code),
          maxUses: input.maxUses ?? 25,
          expiresAt: new Date(Date.now() + (input.expiresInHours ?? 168) * 3600_000),
        },
      });
      const url = new URL('/groups', this.env.WEB_ORIGIN);
      url.searchParams.set('invite', code);
      return { ...publicInvitation(row, true), code, url: url.toString() };
    });
  }

  async invitations(groupId: string, userId: string, query: PaginationDto) {
    return this.change(groupId, userId, async (tx, { role }) => {
      if (role === 'MEMBER') deny();
      const where = { groupId, revokedAt: null, expiresAt: { gt: new Date() } };
      const rows = await tx.groupInvitation.findMany({
        where,
        ...pageQuery(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      const total = await tx.groupInvitation.count({ where });
      return {
        items: rows.map((row) =>
          publicInvitation(row, role === 'OWNER' || row.creatorId === userId),
        ),
        total,
      };
    });
  }

  async revoke(groupId: string, userId: string, id: string) {
    await this.change(groupId, userId, async (tx, { role }) => {
      if (role === 'MEMBER') deny();
      const row = await tx.groupInvitation.findFirst({ where: { id, groupId } });
      if (!row) throw new NotFoundException('Приглашение не найдено.');
      if (role !== 'OWNER' && row.creatorId !== userId) deny();
      if (row.revokedAt) return;
      await tx.groupInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit(tx, groupId, userId, 'INVITATION_REVOKED');
    });
  }

  async join(userId: string, code: string) {
    await this.rateLimit.consume(`group-join:${userId}`, 30, 900);
    const tokenHash = hashToken(code);
    const found = await this.db.groupInvitation.findUnique({
      where: { tokenHash },
      select: { groupId: true },
    });
    if (!found) throw missingInvitation();
    const { groupId } = found;
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, groupId);
      const invitation = await tx.groupInvitation.findUnique({
        where: { tokenHash },
        include: { group: true },
      });
      if (
        !invitation ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date() ||
        invitation.group.archivedAt
      )
        throw missingInvitation();
      const where = { groupId_userId: { groupId, userId } };
      const prior = await tx.groupMember.findUnique({ where });
      if (prior?.blockedAt) throw missingInvitation();
      if (prior && !prior.leftAt) return publicGroup(invitation.group, prior);
      if (invitation.uses >= invitation.maxUses) throw missingInvitation();
      await tx.groupInvitation.update({
        where: { id: invitation.id },
        data: { uses: { increment: 1 } },
      });
      const member = await tx.groupMember.upsert({
        where,
        create: { groupId, userId },
        update: { leftAt: null, role: 'MEMBER', joinedAt: new Date() },
      });
      await this.audit(tx, groupId, userId, 'JOINED', userId);
      await enqueueReminderChange(tx, this.jobs, { type: 'GROUP_USER', groupId, userId });
      return publicGroup(invitation.group, member);
    });
  }
}
