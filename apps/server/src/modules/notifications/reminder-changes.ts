import { fromPrisma } from 'pg-boss/dist/adapters/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { REMINDER_RECONCILE_QUEUE, type JobsService } from '../../infrastructure/jobs.service.js';

export type ReminderChange =
  | { type: 'TASK' | 'GROUP_TASK'; taskId: string }
  | { type: 'GROUP_TASK_USER'; taskId: string; userId: string }
  | { type: 'GROUP'; groupId: string }
  | { type: 'GROUP_USER'; groupId: string; userId: string }
  | { type: 'USER'; userId: string };

export function reminderKey(change: ReminderChange): string {
  switch (change.type) {
    case 'TASK':
    case 'GROUP_TASK':
      return `${change.type}:${change.taskId}`;
    case 'GROUP_TASK_USER':
      return `${change.type}:${change.taskId}:${change.userId}`;
    case 'GROUP':
      return `${change.type}:${change.groupId}`;
    case 'GROUP_USER':
      return `${change.type}:${change.groupId}:${change.userId}`;
    case 'USER':
      return `${change.type}:${change.userId}`;
  }
}

export async function enqueueReminderChange(
  tx: Prisma.TransactionClient,
  jobs: JobsService,
  change: ReminderChange,
) {
  const key = reminderKey(change);
  const { version } = await tx.reminderRevision.upsert({
    where: { key },
    create: { key },
    update: { version: { increment: 1 } },
    select: { version: true },
  });
  const id = await jobs.boss.send(
    REMINDER_RECONCILE_QUEUE,
    { change, version } satisfies ReminderChangeJob,
    { db: fromPrisma(tx), retryLimit: 10, retryDelay: 2, retryBackoff: true },
  );
  if (!id) throw new Error('Reminder reconciliation was not queued.');
}

export interface ReminderChangeJob {
  change: ReminderChange;
  version: number;
}
