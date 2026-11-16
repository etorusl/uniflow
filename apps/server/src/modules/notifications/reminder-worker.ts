import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { fromPrisma } from 'pg-boss/dist/adapters/prisma.js';
import type { Prisma, ReminderNotice } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import {
  JobsService,
  REMINDER_DELIVERY_QUEUE,
  REMINDER_RECONCILE_QUEUE,
} from '../../infrastructure/jobs.service.js';
import { PushTransports } from './push-transports.js';
import { reminderKey, type ReminderChange, type ReminderChangeJob } from './reminder-changes.js';

interface ReminderTarget {
  userId: string;
  kind: 'PERSONAL' | 'GROUP';
  taskId: string;
}

type DeliveryJob = { noticeId: string } | { deliveryId: string; noticeId: string };
const PAGE_SIZE = 100;
const MAX_SEND_ATTEMPTS = 4;
const RETRY_OPTIONS = { retryLimit: 6, retryDelay: 10, retryBackoff: true };
const NOTICE_TITLE = 'Дедлайн · UniFlow';
const NOTICE_BODY = 'Скоро дедлайн. Откройте UniFlow, чтобы посмотреть задание.';

async function activeTarget(db: Prisma.TransactionClient, target: ReminderTarget, now: Date) {
  const preference = await db.reminderPreference.findUnique({ where: { userId: target.userId } });
  if (!preference?.enabled) return;
  let dueAt: Date;
  let deadlineRevision: number;
  let groupId: string | null = null;
  const changes: ReminderChange[] = [{ type: 'USER', userId: target.userId }];
  if (target.kind === 'PERSONAL') {
    const task = await db.task.findFirst({
      where: { id: target.taskId, userId: target.userId, completedAt: null, dueAt: { gt: now } },
      select: { dueAt: true, deadlineRevision: true },
    });
    if (!task) return;
    ({ dueAt, deadlineRevision } = task);
    changes.push({ type: 'TASK', taskId: target.taskId });
  } else {
    const task = await db.groupTask.findFirst({
      where: {
        id: target.taskId,
        deletedAt: null,
        dueAt: { gt: now },
        group: {
          archivedAt: null,
          members: { some: { userId: target.userId, leftAt: null, blockedAt: null } },
        },
        OR: [
          { mode: 'SHARED', completedAt: null },
          { mode: 'INDIVIDUAL', completions: { none: { userId: target.userId } } },
        ],
      },
      select: { dueAt: true, deadlineRevision: true, groupId: true },
    });
    if (!task) return;
    ({ dueAt, deadlineRevision, groupId } = task);
    changes.push(
      { type: 'GROUP', groupId },
      { type: 'GROUP_USER', groupId, userId: target.userId },
      { type: 'GROUP_TASK', taskId: target.taskId },
      { type: 'GROUP_TASK_USER', taskId: target.taskId, userId: target.userId },
    );
  }
  const keys = changes.map(reminderKey);
  const revisions = new Map(
    (await db.reminderRevision.findMany({ where: { key: { in: keys } } })).map(
      ({ key, version }) => [key, version],
    ),
  );
  const generation = createHash('sha256')
    .update(
      JSON.stringify([
        dueAt.toISOString(),
        deadlineRevision,
        preference.minutesBefore,
        ...keys.map((key) => revisions.get(key) ?? 0),
      ]),
    )
    .digest('hex');
  return {
    ...target,
    groupId,
    generation,
    dueAt,
    nominalAt: new Date(dueAt.getTime() - preference.minutesBefore * 60_000),
  };
}

async function eachId(
  list: (after?: string) => Promise<{ id: string }[]>,
  visit: (id: string) => Promise<void>,
) {
  let after: string | undefined;
  for (;;) {
    const page = await list(after);
    for (const row of page) await visit(row.id);
    if (page.length < PAGE_SIZE) return;
    after = page.at(-1)!.id;
  }
}

@Injectable()
export class ReminderWorker {
  private readonly logger = new Logger(ReminderWorker.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PushTransports) private readonly push: PushTransports,
  ) {}

  async register() {
    await this.jobs.boss.work<ReminderChangeJob | { cleanup: true }>(
      REMINDER_RECONCILE_QUEUE,
      { pollingIntervalSeconds: 1 },
      async (jobs) => {
        for (const { data } of jobs) {
          if ('cleanup' in data) await this.cleanup();
          else await this.reconcile(data);
        }
      },
    );
    await this.jobs.boss.work<DeliveryJob>(
      REMINDER_DELIVERY_QUEUE,
      { pollingIntervalSeconds: 1 },
      async (jobs) => {
        for (const { data } of jobs) {
          if ('deliveryId' in data) await this.sendPush(data.deliveryId, data.noticeId);
          else await this.publishNotice(data.noticeId);
        }
      },
    );
    await this.jobs.boss.schedule(REMINDER_RECONCILE_QUEUE, '20 3 * * *', { cleanup: true });
  }

  async reconcile({ change, version }: ReminderChangeJob) {
    const revision = await this.db.reminderRevision.findUnique({
      where: { key: reminderKey(change) },
    });
    if (revision?.version !== version) return;
    if (change.type === 'TASK') {
      const task = await this.db.task.findUnique({
        where: { id: change.taskId },
        select: { userId: true },
      });
      if (task) await this.plan({ kind: 'PERSONAL', taskId: change.taskId, userId: task.userId });
    } else if (change.type === 'GROUP_TASK') {
      const task = await this.db.groupTask.findFirst({
        where: {
          id: change.taskId,
          deletedAt: null,
          completedAt: null,
          group: { archivedAt: null },
        },
        select: { groupId: true },
      });
      if (!task) return;
      await eachId(
        async (after) =>
          (
            await this.db.groupMember.findMany({
              where: {
                groupId: task.groupId,
                userId: { gt: after },
                leftAt: null,
                blockedAt: null,
                user: { reminderPreference: { enabled: true } },
              },
              orderBy: { userId: 'asc' },
              select: { userId: true },
              take: PAGE_SIZE,
            })
          ).map(({ userId }) => ({ id: userId })),
        (userId) => this.plan({ kind: 'GROUP', taskId: change.taskId, userId }),
      );
    } else if (change.type === 'GROUP_TASK_USER') {
      await this.plan({ kind: 'GROUP', taskId: change.taskId, userId: change.userId });
    } else if (change.type === 'GROUP_USER') {
      await this.planGroupTasks(change.userId, change.groupId);
    } else if (change.type === 'USER') {
      if (
        !(await this.db.reminderPreference.findUnique({ where: { userId: change.userId } }))
          ?.enabled
      )
        return;
      await eachId(
        (after) =>
          this.db.task.findMany({
            where: {
              id: { gt: after },
              userId: change.userId,
              completedAt: null,
              dueAt: { gt: new Date() },
            },
            orderBy: { id: 'asc' },
            select: { id: true },
            take: PAGE_SIZE,
          }),
        (taskId) => this.plan({ kind: 'PERSONAL', taskId, userId: change.userId }),
      );
      await this.planGroupTasks(change.userId);
    }
    // Archive notifications only invalidate the old generation. No plans remain eligible.
  }

  private planGroupTasks(userId: string, groupId?: string) {
    return eachId(
      (after) =>
        this.db.groupTask.findMany({
          where: {
            id: { gt: after },
            groupId,
            deletedAt: null,
            completedAt: null,
            dueAt: { gt: new Date() },
            completions: { none: { userId } },
            group: {
              archivedAt: null,
              members: { some: { userId, leftAt: null, blockedAt: null } },
            },
          },
          orderBy: { id: 'asc' },
          select: { id: true },
          take: PAGE_SIZE,
        }),
      (taskId) => this.plan({ kind: 'GROUP', taskId, userId }),
    );
  }

  private async plan(target: ReminderTarget) {
    await this.db.$transaction(async (tx) => {
      const now = new Date();
      const active = await activeTarget(tx, target, now);
      if (!active) return;
      const scheduledAt = active.nominalAt > now ? active.nominalAt : now;
      const created = await tx.reminderNotice.createManyAndReturn({
        data: {
          ...target,
          groupId: active.groupId,
          generation: active.generation,
          scheduledAt,
        },
        skipDuplicates: true,
        select: { id: true },
      });
      if (created[0]) await this.queueDelivery(tx, { noticeId: created[0].id }, scheduledAt);
    });
  }

  async publishNotice(noticeId: string) {
    await this.db.$transaction(async (tx) => {
      const notice = await tx.reminderNotice.findUnique({ where: { id: noticeId } });
      const now = new Date();
      if (!notice || notice.createdAt || notice.scheduledAt > now) return;
      const active = await activeTarget(tx, notice, now);
      if (!active || active.generation !== notice.generation) return;
      const published = await tx.reminderNotice.updateMany({
        where: { id: notice.id, createdAt: null },
        data: { createdAt: now },
      });
      if (!published.count) return;
      const subscriptions = await tx.pushSubscription.findMany({
        where: { userId: notice.userId, revokedAt: null, session: { expiresAt: { gt: now } } },
        select: { id: true, transport: true },
      });
      for (const sub of subscriptions) {
        if (!this.push.available(sub.transport)) continue;
        const deliveries = await tx.reminderDelivery.createManyAndReturn({
          data: {
            subscriptionId: sub.id,
            userId: notice.userId,
            kind: notice.kind,
            taskId: notice.taskId,
            generation: notice.generation,
            scheduledAt: notice.scheduledAt,
          },
          skipDuplicates: true,
          select: { id: true },
        });
        if (deliveries[0]) await this.queueDelivery(tx, { deliveryId: deliveries[0].id, noticeId });
      }
    });
  }

  async sendPush(deliveryId: string, noticeId: string) {
    const claim = await this.db.reminderDelivery.updateMany({
      where: { id: deliveryId, status: 'PENDING' },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    });
    if (!claim.count) {
      // A restarted worker cannot tell whether an expired claim reached the provider.
      await this.db.reminderDelivery.updateMany({
        where: {
          id: deliveryId,
          status: 'SENDING',
          updatedAt: { lt: new Date(Date.now() - 45_000) },
        },
        data: { status: 'FAILED', lastResult: 'claim_outcome_unknown' },
      });
      return;
    }
    const delivery = await this.db.reminderDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: { subscription: { include: { session: true } } },
    });
    const now = new Date();
    const active = await activeTarget(this.db, delivery, now);
    const sub = delivery.subscription;
    if (
      !active ||
      active.generation !== delivery.generation ||
      sub.userId !== delivery.userId ||
      sub.revokedAt ||
      !sub.session ||
      sub.session.userId !== delivery.userId ||
      sub.session.expiresAt <= now
    ) {
      await this.setStatus(deliveryId, 'SKIPPED', 'no_longer_eligible');
      return;
    }
    const ttlSeconds = Math.max(
      1,
      Math.min(300, Math.ceil((active.dueAt.getTime() - now.getTime()) / 1000)),
    );
    const result = await this.push.send(sub, {
      title: NOTICE_TITLE,
      body: NOTICE_BODY,
      tag: noticeId,
      ttlSeconds,
      path: noticePath(active),
      kind: active.kind,
      taskId: active.taskId,
      groupId: active.groupId,
    });
    if (result.status === 'sent') {
      await this.setStatus(deliveryId, 'SENT', 'provider_accepted');
      return;
    }
    if (result.status === 'invalid') {
      await this.db.$transaction([
        this.db.pushSubscription.updateMany({
          where: { id: sub.id, userId: sub.userId, updatedAt: sub.updatedAt, revokedAt: null },
          data: { revokedAt: now },
        }),
        this.db.reminderDelivery.updateMany({
          where: { id: deliveryId, status: 'SENDING' },
          data: { status: 'SKIPPED', lastResult: result.reason },
        }),
      ]);
      return;
    }
    if (result.status === 'retry' && delivery.attempts < MAX_SEND_ATTEMPTS) {
      await this.setStatus(deliveryId, 'PENDING', result.reason);
      throw new Error('Push provider temporarily unavailable');
    }
    await this.setStatus(
      deliveryId,
      result.status === 'disabled' ? 'SKIPPED' : 'FAILED',
      result.reason,
    );
    if (result.status !== 'disabled')
      this.logger.warn(`Push delivery ${deliveryId} ended: ${result.reason}`);
  }

  private setStatus(
    id: string,
    status: 'PENDING' | 'SENT' | 'SKIPPED' | 'FAILED',
    lastResult: string,
  ) {
    return this.db.reminderDelivery.updateMany({
      where: { id, status: 'SENDING' },
      data: { status, lastResult },
    });
  }

  private async queueDelivery(tx: Prisma.TransactionClient, data: DeliveryJob, startAfter?: Date) {
    const job = await this.jobs.boss.send(REMINDER_DELIVERY_QUEUE, data, {
      ...RETRY_OPTIONS,
      db: fromPrisma(tx),
      startAfter,
      expireInSeconds: 120,
    });
    if (!job) throw new Error('Reminder delivery was not queued.');
  }

  private async cleanup() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
    await this.db.$transaction([
      this.db.reminderDelivery.deleteMany({ where: { updatedAt: { lt: cutoff } } }),
      this.db.reminderNotice.deleteMany({ where: { scheduledAt: { lt: cutoff } } }),
      this.db.pushSubscription.deleteMany({
        where: {
          updatedAt: { lt: cutoff },
          OR: [{ revokedAt: { not: null } }, { sessionId: null }],
        },
      }),
    ]);
  }
}

function noticePath(notice: Pick<ReminderNotice, 'kind' | 'taskId' | 'groupId'>) {
  return notice.kind === 'GROUP'
    ? `/groups?groupId=${notice.groupId}&taskId=${notice.taskId}`
    : `/tasks?taskId=${notice.taskId}`;
}
