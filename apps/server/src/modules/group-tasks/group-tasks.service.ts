import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import { Prisma, type GroupTask, type GroupCompletion } from '../../generated/prisma/client.js';
import { GroupsService, type GroupAccess } from '../groups/groups.service.js';
import { taskStatus } from '../tasks/task-status.js';
import type { TaskDto, TasksQueryDto } from '../tasks/tasks.dto.js';
import type { GroupTaskCreateDto, GroupTaskUpdateDto } from './group-tasks.dto.js';

function present(
  task: GroupTask & { completions: GroupCompletion[] },
  access: GroupAccess,
): TaskDto {
  const own = task.completions[0];
  const completedAt = task.mode === 'SHARED' ? task.completedAt : (own?.completedAt ?? null);
  const deadlineAtCompletion =
    task.mode === 'SHARED' ? task.deadlineAtCompletion : (own?.deadlineAtCompletion ?? null);
  const canEdit = task.authorId === access.member.userId;
  return {
    id: task.id,
    scope: 'GROUP',
    groupId: task.groupId,
    groupName: access.group.name,
    mode: task.mode,
    authorId: task.authorId,
    version: task.version,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt.toISOString(),
    deadlineRevision: task.deadlineRevision,
    subjectId: access.member.subjectId,
    subjectName: access.group.subjectName,
    subjectColor: null,
    completedAt: completedAt?.toISOString() ?? null,
    deadlineAtCompletion: deadlineAtCompletion?.toISOString() ?? null,
    status: taskStatus({ dueAt: task.dueAt, completedAt, deadlineAtCompletion }),
    canEdit,
    canDelete: canEdit || access.role !== 'MEMBER',
    canComplete: task.mode === 'INDIVIDUAL' || canEdit || access.role !== 'MEMBER',
  };
}
@Injectable()
export class GroupTasksService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(GroupsService) private readonly groups: GroupsService,
  ) {}
  async task(tx: Prisma.TransactionClient, groupId: string, id: string, userId: string) {
    const value = await tx.groupTask.findFirst({
      where: { id, groupId, deletedAt: null },
      include: { completions: { where: { userId } } },
    });
    if (!value) throw new NotFoundException('Задание не найдено.');
    return value;
  }
  async get(userId: string, groupId: string, id: string) {
    const access = await this.groups.access(userId, groupId);
    return present(await this.task(this.db, groupId, id, userId), access);
  }
  async list(userId: string, groupId: string, query: TasksQueryDto) {
    const access = await this.groups.access(userId, groupId);
    const completed: Prisma.GroupTaskWhereInput = {
      OR: [
        { mode: 'SHARED', completedAt: { not: null } },
        { mode: 'INDIVIDUAL', completions: { some: { userId, completedAt: { not: null } } } },
      ],
    };
    const where: Prisma.GroupTaskWhereInput = {
      groupId,
      deletedAt: null,
      AND: [
        query.status === 'ALL' ? {} : query.status === 'COMPLETED' ? completed : { NOT: completed },
        ...(query.status === 'OVERDUE' ? [{ dueAt: { lt: new Date() } }] : []),
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.groupTask.findMany({
        where,
        include: { completions: { where: { userId } } },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.groupTask.count({ where }),
    ]);
    return { items: items.map((t) => present(t, access)), total };
  }
  async create(userId: string, groupId: string, input: GroupTaskCreateDto) {
    return this.groups.locked(userId, groupId, async (tx, access) =>
      present(
        await tx.groupTask.create({
          data: { ...input, dueAt: new Date(input.dueAt), groupId, authorId: userId },
          include: { completions: true },
        }),
        access,
      ),
    );
  }
  async update(userId: string, groupId: string, id: string, input: GroupTaskUpdateDto) {
    return this.groups.locked(userId, groupId, async (tx, access) => {
      const task = await this.task(tx, groupId, id, userId);
      if (task.authorId !== userId)
        throw new ForbiddenException('Редактировать задание может только автор.');
      if (task.version !== input.version)
        throw new ConflictException(
          'Задание изменено на другом устройстве. Обновите список и повторите правку.',
        );
      const dueAt = new Date(input.dueAt);
      return present(
        await tx.groupTask.update({
          where: { id },
          data: {
            title: input.title,
            description: input.description,
            dueAt,
            version: { increment: 1 },
            ...(dueAt.getTime() !== task.dueAt.getTime()
              ? { deadlineRevision: { increment: 1 } }
              : {}),
          },
          include: { completions: { where: { userId } } },
        }),
        access,
      );
    });
  }
  async remove(userId: string, groupId: string, id: string) {
    await this.groups.locked(userId, groupId, async (tx, access) => {
      const task = await this.task(tx, groupId, id, userId);
      if (task.authorId !== userId && access.role === 'MEMBER')
        throw new ForbiddenException('Нет права удалить задание.');
      await tx.groupTask.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
  async complete(userId: string, groupId: string, id: string, completed: boolean) {
    return this.groups.locked(userId, groupId, async (tx, access) => {
      const task = await this.task(tx, groupId, id, userId);
      if (task.mode === 'SHARED' && task.authorId !== userId && access.role === 'MEMBER')
        throw new ForbiddenException('Общее задание завершает автор, модератор или владелец.');
      const previous = task.mode === 'SHARED' ? task : task.completions[0];
      if (!!previous?.completedAt === completed) return present(task, access);
      const now = new Date();
      const data = {
        completedAt: completed ? now : null,
        deadlineAtCompletion: completed ? task.dueAt : null,
      };
      if (task.mode === 'SHARED')
        await tx.groupTask.update({
          where: { id },
          data: { ...data, completedBy: completed ? userId : null },
        });
      else
        await tx.groupCompletion.upsert({
          where: { taskId_userId: { taskId: id, userId } },
          create: { taskId: id, userId, ...data },
          update: data,
        });
      await tx.groupTaskEvent.create({
        data: {
          taskId: id,
          actorId: userId,
          recipientId: task.mode === 'INDIVIDUAL' ? userId : null,
          kind: completed ? 'COMPLETED' : 'REOPENED',
          createdAt: now,
          deadlineSnapshot: completed ? task.dueAt : previous!.deadlineAtCompletion!,
        },
      });
      return present(await this.task(tx, groupId, id, userId), access);
    });
  }
  async history(userId: string, groupId: string, id: string, query: PaginationDto) {
    await this.groups.access(userId, groupId);
    const task = await this.task(this.db, groupId, id, userId);
    const where = { taskId: id, recipientId: task.mode === 'INDIVIDUAL' ? userId : null };
    const [items, total] = await this.db.$transaction([
      this.db.groupTaskEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.groupTaskEvent.count({ where }),
    ]);
    return {
      items: items.map((e) => ({
        id: e.id,
        kind: e.kind,
        actorId: e.actorId,
        createdAt: e.createdAt.toISOString(),
        deadlineSnapshot: e.deadlineSnapshot.toISOString(),
      })),
      total,
    };
  }
  async statistics(userId: string, groupId: string) {
    await this.groups.access(userId, groupId);
    const [value] = await this.db.$queryRaw<
      Counts[]
    >`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE "completedAt" IS NULL)::int AS open, COUNT(*) FILTER (WHERE "completedAt" <= "deadlineAtCompletion")::int AS "completedOnTime", COUNT(*) FILTER (WHERE "completedAt" > "deadlineAtCompletion")::int AS "completedLate", COUNT(*) FILTER (WHERE "completedAt" IS NULL AND "dueAt" < NOW())::int AS overdue FROM group_tasks WHERE "groupId" = ${groupId}::uuid AND mode = 'SHARED' AND "deletedAt" IS NULL`;
    return {
      ...value!,
      completionRate: value!.total
        ? Math.round(((value!.completedOnTime + value!.completedLate) / value!.total) * 100)
        : 0,
    };
  }
  private eligible(userId: string) {
    return Prisma.sql`FROM group_tasks t JOIN groups g ON g.id = t."groupId" JOIN group_members m ON m."groupId" = g.id AND m."userId" = ${userId}::uuid LEFT JOIN group_completions c ON c."taskId" = t.id AND c."userId" = ${userId}::uuid WHERE m.active AND g."archivedAt" IS NULL AND t."deletedAt" IS NULL`;
  }
  async personalStatistics(userId: string) {
    const [value] = await this.db.$queryRaw<Counts[]>(
      Prisma.sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE c."completedAt" IS NULL)::int AS open, COUNT(*) FILTER (WHERE c."completedAt" <= c."deadlineAtCompletion")::int AS "completedOnTime", COUNT(*) FILTER (WHERE c."completedAt" > c."deadlineAtCompletion")::int AS "completedLate", COUNT(*) FILTER (WHERE c."completedAt" IS NULL AND t."dueAt" < NOW())::int AS overdue ${this.eligible(userId)} AND t.mode = 'INDIVIDUAL' AND (t."dueAt" >= m."joinedAt" OR c.id IS NOT NULL)`,
    );
    return value!;
  }
  async feed(userId: string, query: TasksQueryDto) {
    const cte = Prisma.sql`WITH feed AS (
      SELECT t.id, t.title, t.description, t."dueAt", t."deadlineRevision", t."completedAt", t."deadlineAtCompletion", t."subjectId", s.name AS "subjectName", s.color AS "subjectColor", 'PERSONAL' AS scope, NULL::uuid AS "groupId", NULL::text AS "groupName", NULL::text AS mode, t."userId" AS "authorId", 0 AS version, true AS "canEdit", true AS "canDelete", true AS "canComplete" FROM tasks t LEFT JOIN subjects s ON s.id = t."subjectId" WHERE t."userId" = ${userId}::uuid AND ${query.scope === 'ALL'}
      UNION ALL
      SELECT t.id, t.title, t.description, t."dueAt", t."deadlineRevision", CASE WHEN t.mode = 'SHARED' THEN t."completedAt" ELSE c."completedAt" END, CASE WHEN t.mode = 'SHARED' THEN t."deadlineAtCompletion" ELSE c."deadlineAtCompletion" END, m."subjectId", g."subjectName", NULL::text, 'GROUP', g.id, g.name, t.mode::text, t."authorId", t.version, t."authorId" = ${userId}::uuid, t."authorId" = ${userId}::uuid OR m.role = 'MODERATOR' OR g."ownerId" = ${userId}::uuid, t.mode = 'INDIVIDUAL' OR t."authorId" = ${userId}::uuid OR m.role = 'MODERATOR' OR g."ownerId" = ${userId}::uuid ${this.eligible(userId)} AND (t.mode = 'SHARED' OR t."dueAt" >= m."joinedAt" OR c.id IS NOT NULL)
    )`;
    const where = Prisma.sql`WHERE ${query.subjectId ? Prisma.sql`"subjectId" = ${query.subjectId}::uuid` : Prisma.sql`true`} AND ${query.groupId ? Prisma.sql`"groupId" = ${query.groupId}::uuid` : Prisma.sql`true`} AND ${query.status === 'ALL' ? Prisma.sql`true` : query.status === 'COMPLETED' ? Prisma.sql`"completedAt" IS NOT NULL` : Prisma.sql`"completedAt" IS NULL`} AND ${query.status === 'OVERDUE' ? Prisma.sql`"dueAt" < NOW()` : Prisma.sql`true`}`;
    const [items, counts] = await this.db.$transaction([
      this.db.$queryRaw<FeedRow[]>(
        Prisma.sql`${cte} SELECT * FROM feed ${where} ORDER BY "dueAt", id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      ),
      this.db.$queryRaw<{ total: number }[]>(
        Prisma.sql`${cte} SELECT COUNT(*)::int AS total FROM feed ${where}`,
      ),
    ]);
    return {
      items: items.map((t) => ({
        ...t,
        dueAt: t.dueAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
        deadlineAtCompletion: t.deadlineAtCompletion?.toISOString() ?? null,
        status: taskStatus(t),
      })),
      total: counts[0]!.total,
    };
  }
}
type Counts = {
  total: number;
  open: number;
  completedOnTime: number;
  completedLate: number;
  overdue: number;
};
type FeedRow = Omit<TaskDto, 'dueAt' | 'completedAt' | 'deadlineAtCompletion' | 'status'> & {
  dueAt: Date;
  completedAt: Date | null;
  deadlineAtCompletion: Date | null;
};
