import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { ENVIRONMENT, type Environment } from '../../infrastructure/environment.js';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import type { Group, GroupInvitation, GroupMember, Prisma } from '../../generated/prisma/client.js';
import { hashToken } from '../auth/tokens.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import type { GroupDto, GroupInputDto, InvitationInputDto } from './groups.dto.js';

export type GroupAccess = { group: Group; member: GroupMember; role: GroupDto['role'] };
const missing = () => new NotFoundException('Группа недоступна.');
const invitationView = (value: GroupInvitation) => ({
  id: value.id,
  expiresAt: value.expiresAt.toISOString(),
  revokedAt: value.revokedAt?.toISOString() ?? null,
  maxUses: value.maxUses,
  uses: value.uses,
});
export function presentGroup({ group, member, role }: GroupAccess): GroupDto {
  return {
    id: group.id,
    name: group.name,
    subjectName: group.subjectName,
    description: group.description,
    role,
    subjectId: member.subjectId,
    createdAt: group.createdAt.toISOString(),
  };
}
export function requireModerator(access: GroupAccess) {
  if (access.role === 'MEMBER')
    throw new ForbiddenException('Требуются права модератора или владельца.');
}
export function requireOwner(access: GroupAccess) {
  if (access.role !== 'OWNER')
    throw new ForbiddenException('Это действие доступно владельцу группы.');
}
@Injectable()
export class GroupsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}
  async access(
    userId: string,
    groupId: string,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<GroupAccess> {
    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: true },
    });
    if (!member?.active || member.group.archivedAt) throw missing();
    return {
      group: member.group,
      member,
      role: member.group.ownerId === userId ? 'OWNER' : member.role,
    };
  }
  async locked<T>(
    userId: string,
    groupId: string,
    action: (tx: Prisma.TransactionClient, access: GroupAccess) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
      return action(tx, await this.access(userId, groupId, tx));
    });
  }
  async audit(
    tx: Prisma.TransactionClient,
    groupId: string,
    actorId: string,
    action: string,
    targetId: string | null = null,
  ) {
    await tx.groupAudit.create({ data: { groupId, actorId, action, targetId } });
  }
  async list(userId: string, query: PaginationDto) {
    const where = { userId, active: true, group: { archivedAt: null } };
    const [values, total] = await this.db.$transaction([
      this.db.groupMember.findMany({
        where,
        include: { group: true },
        orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.groupMember.count({ where }),
    ]);
    return {
      items: values.map((member) =>
        presentGroup({
          member,
          group: member.group,
          role: member.group.ownerId === userId ? 'OWNER' : member.role,
        }),
      ),
      total,
    };
  }
  async create(userId: string, input: GroupInputDto) {
    return this.db.$transaction(async (tx) => {
      const group = await tx.group.create({ data: { ...input, ownerId: userId } });
      const member = await tx.groupMember.create({ data: { groupId: group.id, userId } });
      await this.audit(tx, group.id, userId, 'CREATED');
      return presentGroup({ group, member, role: 'OWNER' });
    });
  }
  async get(userId: string, groupId: string) {
    return presentGroup(await this.access(userId, groupId));
  }
  async update(userId: string, groupId: string, input: GroupInputDto) {
    return this.locked(userId, groupId, async (tx, access) => {
      requireOwner(access);
      const group = await tx.group.update({ where: { id: groupId }, data: input });
      await this.audit(tx, groupId, userId, 'UPDATED');
      return presentGroup({ ...access, group });
    });
  }
  async archive(userId: string, groupId: string) {
    await this.locked(userId, groupId, async (tx, access) => {
      requireOwner(access);
      await tx.group.update({ where: { id: groupId }, data: { archivedAt: new Date() } });
      await tx.groupInvitation.updateMany({
        where: { groupId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, groupId, userId, 'ARCHIVED');
    });
  }
  async linkSubject(userId: string, groupId: string, subjectId: string | null) {
    return this.locked(userId, groupId, async (tx, access) => {
      if (subjectId && !(await tx.subject.findFirst({ where: { id: subjectId, userId } })))
        throw new NotFoundException('Предмет не найден.');
      const member = await tx.groupMember.update({
        where: { id: access.member.id },
        data: { subjectId },
      });
      return presentGroup({ ...access, member });
    });
  }
  async members(userId: string, groupId: string, query: PaginationDto) {
    const { group } = await this.access(userId, groupId);
    const where = { groupId, active: true };
    const [values, total] = await this.db.$transaction([
      this.db.groupMember.findMany({
        where,
        include: { user: { select: { displayName: true } } },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.groupMember.count({ where }),
    ]);
    return {
      items: values.map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        role: group.ownerId === m.userId ? 'OWNER' : m.role,
      })),
      total,
    };
  }
  async changeRole(
    userId: string,
    groupId: string,
    targetId: string,
    role: 'MEMBER' | 'MODERATOR',
  ) {
    await this.locked(userId, groupId, async (tx, access) => {
      requireOwner(access);
      if (targetId === access.group.ownerId)
        throw new BadRequestException('Для смены владельца используйте передачу владения.');
      const target = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: targetId } },
      });
      if (!target?.active) throw missing();
      await tx.groupMember.update({ where: { id: target.id }, data: { role } });
      await this.audit(tx, groupId, userId, `ROLE_${role}`, targetId);
    });
  }
  async removeMember(userId: string, groupId: string, targetId: string) {
    await this.locked(userId, groupId, async (tx, access) => {
      requireModerator(access);
      const target = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: targetId } },
      });
      if (!target?.active) throw missing();
      if (
        targetId === access.group.ownerId ||
        targetId === userId ||
        (target.role === 'MODERATOR' && access.role !== 'OWNER')
      )
        throw new ForbiddenException('Нельзя исключить этого участника.');
      await tx.groupMember.update({
        where: { id: target.id },
        data: { active: false, banned: true, role: 'MEMBER', subjectId: null },
      });
      await this.audit(tx, groupId, userId, 'REMOVED', targetId);
    });
  }
  async leave(userId: string, groupId: string) {
    await this.locked(userId, groupId, async (tx, access) => {
      if (access.role === 'OWNER')
        throw new BadRequestException('Перед выходом передайте владение или архивируйте группу.');
      await tx.groupMember.update({
        where: { id: access.member.id },
        data: { active: false, role: 'MEMBER', subjectId: null },
      });
      await this.audit(tx, groupId, userId, 'LEFT');
    });
  }
  async transfer(userId: string, groupId: string, targetId: string) {
    await this.locked(userId, groupId, async (tx, access) => {
      requireOwner(access);
      const target = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: targetId } },
      });
      if (!target?.active || targetId === userId)
        throw new BadRequestException('Выберите другого действующего участника.');
      await tx.group.update({ where: { id: groupId }, data: { ownerId: targetId } });
      await tx.groupMember.updateMany({
        where: { groupId, userId: { in: [userId, targetId] } },
        data: { role: 'MEMBER' },
      });
      await this.audit(tx, groupId, userId, 'OWNERSHIP_TRANSFERRED', targetId);
    });
  }
  async invitations(userId: string, groupId: string, query: PaginationDto) {
    requireModerator(await this.access(userId, groupId));
    const where = { groupId };
    const [values, total] = await this.db.$transaction([
      this.db.groupInvitation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.groupInvitation.count({ where }),
    ]);
    return { items: values.map(invitationView), total };
  }
  async invite(userId: string, groupId: string, input: InvitationInputDto) {
    return this.locked(userId, groupId, async (tx, access) => {
      requireModerator(access);
      const code = randomBytes(12).toString('hex').toUpperCase();
      const value = await tx.groupInvitation.create({
        data: {
          groupId,
          createdBy: userId,
          tokenHash: hashToken(code),
          maxUses: input.maxUses,
          expiresAt: new Date(Date.now() + input.expiresInDays * 86400000),
        },
      });
      await this.audit(tx, groupId, userId, 'INVITATION_CREATED');
      return {
        ...invitationView(value),
        code,
        url: `${this.env.WEB_ORIGIN}/groups?invite=${code}`,
      };
    });
  }
  async revoke(userId: string, groupId: string, id: string) {
    await this.locked(userId, groupId, async (tx, access) => {
      requireModerator(access);
      const result = await tx.groupInvitation.updateMany({
        where: { id, groupId },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw new NotFoundException('Приглашение не найдено.');
      await this.audit(tx, groupId, userId, 'INVITATION_REVOKED');
    });
  }
  async join(userId: string, code: string) {
    await this.limits.consume(`group-join:${userId}`, 10, 900);
    const invitation = await this.db.groupInvitation.findUnique({
      where: { tokenHash: hashToken(code) },
    });
    if (!invitation) throw new BadRequestException('Приглашение недействительно.');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM groups WHERE id = ${invitation.groupId}::uuid FOR UPDATE`;
      const current = await tx.groupInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
        include: { group: true },
      });
      const member = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId: current.groupId, userId } },
      });
      if (
        current.group.archivedAt ||
        current.revokedAt ||
        current.expiresAt <= new Date() ||
        member?.banned
      )
        throw new BadRequestException('Приглашение недействительно.');
      if (member?.active)
        return presentGroup({
          member,
          group: current.group,
          role: current.group.ownerId === userId ? 'OWNER' : member.role,
        });
      if (current.uses >= current.maxUses)
        throw new BadRequestException('Лимит приглашения исчерпан.');
      const joined = await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: current.groupId, userId } },
        create: { groupId: current.groupId, userId },
        update: { active: true, role: 'MEMBER', joinedAt: new Date() },
      });
      await tx.groupInvitation.update({
        where: { id: current.id },
        data: { uses: { increment: 1 } },
      });
      await this.audit(tx, current.groupId, userId, 'JOINED');
      return presentGroup({ group: current.group, member: joined, role: 'MEMBER' });
    });
  }
  async history(userId: string, groupId: string, query: PaginationDto) {
    requireModerator(await this.access(userId, groupId));
    const where = { groupId };
    const [values, total] = await this.db.$transaction([
      this.db.groupAudit.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.groupAudit.count({ where }),
    ]);
    return {
      items: values.map((v) => ({
        id: v.id,
        actorId: v.actorId,
        targetId: v.targetId,
        action: v.action,
        createdAt: v.createdAt.toISOString(),
      })),
      total,
    };
  }
}
