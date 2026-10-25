import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { pageQuery } from '../../common/pagination.dto.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { Prisma, Subject, Task } from '../../generated/prisma/client.js';
import type { StatisticsDto, TaskDto, TaskInputDto, TasksQueryDto } from './tasks.dto.js';

export function taskStatus(
  task: Pick<Task, 'completedAt' | 'deadlineAtCompletion' | 'dueAt'>,
  now = new Date(),
): TaskDto['status'] {
  if (task.completedAt)
    return task.completedAt <= (task.deadlineAtCompletion ?? task.dueAt)
      ? 'COMPLETED_ON_TIME'
      : 'COMPLETED_LATE';
  return task.dueAt < now ? 'OVERDUE' : 'OPEN';
}
function present(task: Task & { subject: Subject | null }): TaskDto {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt.toISOString(),
    deadlineRevision: task.deadlineRevision,
    subjectId: task.subjectId,
    subjectName: task.subject?.name ?? null,
    subjectColor: task.subject?.color ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    deadlineAtCompletion: task.deadlineAtCompletion?.toISOString() ?? null,
    status: taskStatus(task),
  };
}
@Injectable()
export class TasksService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  async task(userId: string, id: string) {
    const value = await this.db.task.findFirst({
      where: { userId, id },
      include: { subject: true },
    });
    if (!value) throw new NotFoundException('Задание не найдено.');
    return value;
  }
  async list(userId: string, query: TasksQueryDto) {
    const where: Prisma.TaskWhereInput = {
      userId,
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.status === 'COMPLETED'
        ? { completedAt: { not: null } }
        : query.status === 'ALL'
          ? {}
          : { completedAt: null }),
      ...(query.status === 'OVERDUE' ? { dueAt: { lt: new Date() } } : {}),
    };
    const [values, total] = await this.db.$transaction([
      this.db.task.findMany({
        where,
        include: { subject: true },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.task.count({ where }),
    ]);
    return { items: values.map(present), total };
  }
  private async data(userId: string, input: TaskInputDto) {
    if (input.subjectId) await this.catalog.subject(userId, input.subjectId);
    const dueAt = DateTime.fromISO(input.dueAt, { setZone: true });
    if (!dueAt.isValid)
      throw new BadRequestException('Укажите корректный дедлайн с часовым поясом.');
    return {
      title: input.title,
      description: input.description,
      dueAt: dueAt.toJSDate(),
      subjectId: input.subjectId ?? null,
    };
  }
  async create(userId: string, input: TaskInputDto) {
    return present(
      await this.db.task.create({
        data: { userId, ...(await this.data(userId, input)) },
        include: { subject: true },
      }),
    );
  }
  async update(userId: string, id: string, input: TaskInputDto) {
    await this.task(userId, id);
    const data = await this.data(userId, input);
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM tasks WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Задание не найдено.');
      const previous = await tx.task.findUniqueOrThrow({ where: { id } });
      return present(
        await tx.task.update({
          where: { id },
          data: {
            ...data,
            ...(previous.dueAt.getTime() !== data.dueAt.getTime()
              ? { deadlineRevision: { increment: 1 } }
              : {}),
          },
          include: { subject: true },
        }),
      );
    });
  }
  async remove(userId: string, id: string) {
    const result = await this.db.task.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Задание не найдено.');
  }
  async complete(userId: string, id: string, completed: boolean) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM tasks WHERE id = ${id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Задание не найдено.');
      const task = await tx.task.findUniqueOrThrow({ where: { id }, include: { subject: true } });
      if (!!task.completedAt === completed) return present(task);
      const now = new Date();
      const result = await tx.task.update({
        where: { id },
        data: {
          completedAt: completed ? now : null,
          deadlineAtCompletion: completed ? task.dueAt : null,
        },
        include: { subject: true },
      });
      await tx.taskEvent.create({
        data: {
          taskId: id,
          kind: completed ? 'COMPLETED' : 'REOPENED',
          createdAt: now,
          deadlineSnapshot: completed ? task.dueAt : task.deadlineAtCompletion!,
        },
      });
      return present(result);
    });
  }
  async history(userId: string, id: string) {
    await this.task(userId, id);
    const values = await this.db.taskEvent.findMany({
      where: { taskId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      items: values.map((value) => ({
        id: value.id,
        kind: value.kind,
        createdAt: value.createdAt.toISOString(),
        deadlineSnapshot: value.deadlineSnapshot.toISOString(),
      })),
    };
  }
  async statistics(userId: string): Promise<StatisticsDto> {
    const [value] = await this.db.$queryRaw<Omit<StatisticsDto, 'completionRate'>[]>`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "completedAt" IS NULL)::int AS open,
        COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL AND "completedAt" <= "deadlineAtCompletion")::int AS "completedOnTime",
        COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL AND "completedAt" > "deadlineAtCompletion")::int AS "completedLate",
        COUNT(*) FILTER (WHERE "completedAt" IS NULL AND "dueAt" < NOW())::int AS overdue
      FROM tasks WHERE "userId" = ${userId}::uuid`;
    const counts = value!;
    return {
      ...counts,
      completionRate: counts.total
        ? Math.round(((counts.completedOnTime + counts.completedLate) / counts.total) * 100)
        : 0,
    };
  }
}
