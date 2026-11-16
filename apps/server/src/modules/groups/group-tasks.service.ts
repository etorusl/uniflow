import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Prisma, type GroupTask, type GroupMemberRole } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { JobsService } from '../../infrastructure/jobs.service.js';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import { enqueueReminderChange } from '../notifications/reminder-changes.js';
import type { StatisticsDto } from '../tasks/tasks.dto.js';
import { taskStatus } from '../tasks/tasks.service.js';
import { groupRole, GroupsService } from './groups.service.js';
import type { GroupRole } from './groups.dto.js';
import type {
  GroupTaskDto,
  GroupTaskInputDto,
  GroupTasksQueryDto,
  NewGroupTaskInputDto,
  AccessibleGroupTasksQueryDto,
} from './group-tasks.dto.js';

type IncludedTask = GroupTask & {
  group: { name: string };
  author: { displayName: string } | null;
  completions: { completedAt: Date; deadlineAtCompletion: Date }[];
};

function includeFor(userId: string) {
  return {
    group: { select: { name: true } },
    author: { select: { displayName: true } },
    completions: { where: { userId }, select: { completedAt: true, deadlineAtCompletion: true } },
  } as const;
}
function statusFor(task: IncludedTask) {
  return task.mode === 'INDIVIDUAL'
    ? {
        completedAt: task.completions[0]?.completedAt ?? null,
        deadlineAtCompletion: task.completions[0]?.deadlineAtCompletion ?? null,
      }
    : { completedAt: task.completedAt, deadlineAtCompletion: task.deadlineAtCompletion };
}
function publicTask(
  task: IncludedTask,
  userId: string,
  role: GroupRole,
  now = new Date(),
): GroupTaskDto {
  const { completedAt, deadlineAtCompletion } = statusFor(task);
  const authored = task.authorId === userId;
  const canModerate = role !== 'MEMBER';
  return {
    id: task.id,
    groupId: task.groupId,
    groupName: task.group.name,
    authorId: task.authorId,
    authorName: task.author?.displayName ?? null,
    title: task.title,
    description: task.description,
    mode: task.mode,
    dueAt: task.dueAt.toISOString(),
    deadlineRevision: task.deadlineRevision,
    completedAt: completedAt?.toISOString() ?? null,
    deadlineAtCompletion: deadlineAtCompletion?.toISOString() ?? null,
    status: taskStatus({ completedAt, deadlineAtCompletion, dueAt: task.dueAt }, now),
    canComplete: task.mode === 'INDIVIDUAL' || authored || canModerate,
    canEdit: authored,
    canDelete: authored || canModerate,
  };
}
function values(input: GroupTaskInputDto) {
  const due = DateTime.fromISO(input.dueAt, { setZone: true });
  if (!due.isValid) throw new BadRequestException('Укажите корректный дедлайн с часовым поясом.');
  return { title: input.title, description: input.description, dueAt: due.toJSDate() };
}
function forbid() {
  throw new ForbiddenException('Недостаточно прав для этого задания.');
}
function statusWhere(
  userId: string,
  query: GroupTasksQueryDto,
  now: Date,
): Prisma.GroupTaskWhereInput {
  const completed = query.status === 'COMPLETED';
  if (query.status === 'ALL') return { mode: query.mode };
  return {
    mode: query.mode,
    dueAt: query.status === 'OVERDUE' ? { lt: now } : undefined,
    OR: [
      { mode: 'SHARED', completedAt: completed ? { not: null } : null },
      { mode: 'INDIVIDUAL', completions: completed ? { some: { userId } } : { none: { userId } } },
    ],
  };
}
function statisticsSql(where: Prisma.Sql, source: Prisma.Sql) {
  return Prisma.sql`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "completedAt" IS NULL)::int AS open,
      COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL AND "completedAt" <= "completionDeadline")::int AS "completedOnTime",
      COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL AND "completedAt" > "completionDeadline")::int AS "completedLate",
      COUNT(*) FILTER (WHERE "completedAt" IS NULL AND "dueAt" < NOW())::int AS overdue
    FROM ${source} WHERE ${where}`;
}
function withRate(value: Omit<StatisticsDto, 'completionRate'>): StatisticsDto {
  return {
    ...value,
    completionRate: value.total
      ? Math.round((100 * (value.completedOnTime + value.completedLate)) / value.total)
      : 0,
  };
}

@Injectable()
export class GroupTasksService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  async requireTask(
    groupId: string,
    taskId: string,
    userId: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const { role } = await this.groups.requireMember(groupId, userId, tx);
    const task = await tx.groupTask.findFirst({
      where: { groupId, id: taskId, deletedAt: null },
      include: includeFor(userId),
    });
    if (!task) throw new NotFoundException('Задание не найдено.');
    return { role, task };
  }

  private async change<T>(
    groupId: string,
    userId: string,
    fn: (tx: Prisma.TransactionClient, role: GroupRole) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.groups.lock(tx, groupId);
      const { role } = await this.groups.requireMember(groupId, userId, tx);
      return fn(tx, role);
    });
  }

  async get(groupId: string, taskId: string, userId: string) {
    const { role, task } = await this.requireTask(groupId, taskId, userId);
    return publicTask(task, userId, role);
  }

  async list(groupId: string, userId: string, query: GroupTasksQueryDto) {
    return this.change(groupId, userId, async (tx, role) => {
      const now = new Date();
      const where = { groupId, deletedAt: null, ...statusWhere(userId, query, now) };
      const rows = await tx.groupTask.findMany({
        where,
        include: includeFor(userId),
        ...pageQuery(query),
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      });
      const total = await tx.groupTask.count({ where });
      return { items: rows.map((task) => publicTask(task, userId, role, now)), total };
    });
  }

  async personalList(userId: string, query: AccessibleGroupTasksQueryDto) {
    const now = new Date();
    const membership = { userId, leftAt: null, blockedAt: null };
    const where = {
      groupId: query.groupId,
      deletedAt: null,
      group: { archivedAt: null, members: { some: membership } },
      ...statusWhere(userId, query, now),
    };
    const [rows, total] = await this.db.$transaction(
      [
        this.db.groupTask.findMany({
          where,
          include: {
            ...includeFor(userId),
            group: {
              select: {
                name: true,
                ownerId: true,
                members: { where: membership, select: { role: true } },
              },
            },
          },
          ...pageQuery(query),
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        }),
        this.db.groupTask.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const items = rows.map((task) =>
      publicTask(
        task,
        userId,
        groupRole(task.group.ownerId, {
          userId,
          role: task.group.members[0]!.role satisfies GroupMemberRole,
        }),
        now,
      ),
    );
    return { items, total };
  }

  async create(groupId: string, userId: string, input: NewGroupTaskInputDto) {
    return this.change(groupId, userId, async (tx, role) => {
      const task = await tx.groupTask.create({
        data: { ...values(input), mode: input.mode, groupId, authorId: userId },
        include: includeFor(userId),
      });
      await enqueueReminderChange(tx, this.jobs, { type: 'GROUP_TASK', taskId: task.id });
      return publicTask(task, userId, role);
    });
  }

  async update(groupId: string, taskId: string, userId: string, input: GroupTaskInputDto) {
    return this.change(groupId, userId, async (tx, role) => {
      const { task } = await this.requireTask(groupId, taskId, userId, tx);
      if (task.authorId !== userId) forbid();
      const data = values(input);
      const moved = data.dueAt.getTime() !== task.dueAt.getTime();
      const updated = await tx.groupTask.update({
        where: { id: taskId },
        data: { ...data, deadlineRevision: moved ? { increment: 1 } : undefined },
        include: includeFor(userId),
      });
      if (moved) await enqueueReminderChange(tx, this.jobs, { type: 'GROUP_TASK', taskId });
      return publicTask(updated, userId, role);
    });
  }

  async remove(groupId: string, taskId: string, userId: string) {
    await this.change(groupId, userId, async (tx, role) => {
      const { task } = await this.requireTask(groupId, taskId, userId, tx);
      if (role === 'MEMBER' && task.authorId !== userId) forbid();
      await tx.groupTask.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
      await enqueueReminderChange(tx, this.jobs, { type: 'GROUP_TASK', taskId });
    });
  }

  async complete(groupId: string, taskId: string, userId: string, completed: boolean) {
    return this.change(groupId, userId, async (tx, role) => {
      const { task } = await this.requireTask(groupId, taskId, userId, tx);
      if (task.mode === 'SHARED' && role === 'MEMBER' && task.authorId !== userId) forbid();
      const previous = statusFor(task);
      if (!!previous.completedAt === completed) return publicTask(task, userId, role);
      const now = new Date();
      if (task.mode === 'SHARED') {
        await tx.groupTask.update({
          where: { id: taskId },
          data: {
            completedAt: completed ? now : null,
            deadlineAtCompletion: completed ? task.dueAt : null,
            completedById: completed ? userId : null,
          },
        });
      } else if (completed) {
        await tx.groupTaskCompletion.create({
          data: { taskId, userId, completedAt: now, deadlineAtCompletion: task.dueAt },
        });
      } else {
        await tx.groupTaskCompletion.delete({ where: { taskId_userId: { taskId, userId } } });
      }
      await tx.groupTaskEvent.create({
        data: {
          taskId,
          actorId: userId,
          kind: completed ? 'COMPLETED' : 'REOPENED',
          createdAt: now,
          deadlineSnapshot: completed ? task.dueAt : previous.deadlineAtCompletion!,
        },
      });
      await enqueueReminderChange(
        tx,
        this.jobs,
        task.mode === 'SHARED'
          ? { type: 'GROUP_TASK', taskId }
          : { type: 'GROUP_TASK_USER', taskId, userId },
      );
      return publicTask(
        await tx.groupTask.findUniqueOrThrow({
          where: { id: taskId },
          include: includeFor(userId),
        }),
        userId,
        role,
      );
    });
  }

  async history(groupId: string, taskId: string, userId: string, query: PaginationDto) {
    return this.change(groupId, userId, async (tx) => {
      const { task } = await this.requireTask(groupId, taskId, userId, tx);
      const where = { taskId, actorId: task.mode === 'INDIVIDUAL' ? userId : undefined };
      const rows = await tx.groupTaskEvent.findMany({
        where,
        include: { actor: { select: { displayName: true } } },
        ...pageQuery(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const total = await tx.groupTaskEvent.count({ where });
      return {
        items: rows.map((row) => ({
          id: row.id,
          actorName: row.actor?.displayName ?? null,
          kind: row.kind,
          createdAt: row.createdAt.toISOString(),
          deadlineSnapshot: row.deadlineSnapshot.toISOString(),
        })),
        total,
      };
    });
  }

  async sharedStatistics(groupId: string, userId: string) {
    return this.change(groupId, userId, async (tx) => {
      const rows = await tx.$queryRaw<Omit<StatisticsDto, 'completionRate'>[]>(
        statisticsSql(
          Prisma.sql`"groupId" = ${groupId}::uuid AND "deletedAt" IS NULL AND mode = 'SHARED'`,
          Prisma.sql`(SELECT *, "deadlineAtCompletion" AS "completionDeadline" FROM group_tasks) AS visible`,
        ),
      );
      return withRate(rows[0]!);
    });
  }

  async personalStatistics(userId: string) {
    const rows = await this.db.$queryRaw<Omit<StatisticsDto, 'completionRate'>[]>(
      statisticsSql(
        Prisma.sql`visible."deletedAt" IS NULL AND visible.mode = 'INDIVIDUAL'`,
        Prisma.sql`(
        SELECT t."dueAt", t."deletedAt", t.mode, c."completedAt", c."deadlineAtCompletion" AS "completionDeadline"
        FROM group_tasks t
        JOIN study_groups g ON g.id = t."groupId" AND g."archivedAt" IS NULL
        JOIN group_members m ON m."groupId" = g.id AND m."userId" = ${userId}::uuid
          AND m."leftAt" IS NULL AND m."blockedAt" IS NULL
        LEFT JOIN group_task_completions c ON c."taskId" = t.id AND c."userId" = m."userId"
      ) AS visible`,
      ),
    );
    return withRate(rows[0]!);
  }
}
