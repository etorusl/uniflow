import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { JobsService } from '../../infrastructure/jobs.service.js';
import type {
  NotificationInboxDto,
  NotificationNoticeDto,
  PushTransportValue,
  RegisterPushDto,
  ReminderSettingsDto,
  ReminderSettingsInputDto,
} from './notifications.dto.js';
import {
  PushTransports,
  normalizeWebEndpoint,
  validAndroidToken,
  validWebKeys,
} from './push-transports.js';
import { enqueueReminderChange } from './reminder-changes.js';
import { ReminderWorker } from './reminder-worker.js';

const initialSettings = { enabled: false, minutesBefore: 60 };

function visibility(userId: string) {
  return Prisma.sql`
    n."userId" = ${userId}::uuid AND n."createdAt" IS NOT NULL AND (
      (n.kind = 'PERSONAL' AND EXISTS (
        SELECT 1 FROM tasks t WHERE t.id = n."taskId" AND t."userId" = n."userId"
      )) OR
      (n.kind = 'GROUP' AND EXISTS (
        SELECT 1 FROM group_tasks t
        JOIN study_groups g ON g.id = t."groupId"
        JOIN group_members m ON m."groupId" = g.id AND m."userId" = n."userId"
        WHERE t.id = n."taskId" AND g.id = n."groupId" AND t."deletedAt" IS NULL
          AND g."archivedAt" IS NULL AND m."leftAt" IS NULL AND m."blockedAt" IS NULL
      ))
    )`;
}

type VisibleNotice = Omit<NotificationNoticeDto, 'scheduledAt' | 'createdAt' | 'readAt'> & {
  scheduledAt: Date;
  createdAt: Date;
  readAt: Date | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PushTransports) private readonly push: PushTransports,
    @Inject(ReminderWorker) private readonly worker: ReminderWorker,
  ) {}

  registerWorkers() {
    return this.worker.register();
  }

  async settings(userId: string, sessionId: string): Promise<ReminderSettingsDto> {
    const [preference, subscriptions] = await this.db.$transaction([
      this.db.reminderPreference.findUnique({
        where: { userId },
        select: { enabled: true, minutesBefore: true },
      }),
      this.db.pushSubscription.findMany({
        where: { userId, sessionId, revokedAt: null },
        distinct: ['transport'],
        select: { transport: true },
      }),
    ]);
    return {
      ...(preference ?? initialSettings),
      ...this.push.capabilities(),
      subscribed: subscriptions.map(({ transport }) => transport),
    };
  }

  async changeSettings(userId: string, sessionId: string, input: ReminderSettingsInputDto) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const previous =
        (await tx.reminderPreference.findUnique({ where: { userId } })) ?? initialSettings;
      if (input.enabled === previous.enabled && input.minutesBefore === previous.minutesBefore)
        return;
      await tx.reminderPreference.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
      await enqueueReminderChange(tx, this.jobs, { type: 'USER', userId });
    });
    return this.settings(userId, sessionId);
  }

  async register(userId: string, sessionId: string, input: RegisterPushDto) {
    if (!this.push.available(input.transport))
      throw new ServiceUnavailableException(
        'Системные уведомления для этой платформы пока не настроены.',
      );

    const web = input.transport === 'WEB';
    const address = web ? normalizeWebEndpoint(input.address) : input.address;
    if (
      !address ||
      (web && (!input.p256dh || !input.auth || !validWebKeys(input.p256dh, input.auth))) ||
      (!web && (!validAndroidToken(address) || input.p256dh || input.auth))
    )
      throw new BadRequestException('Получена недействительная подписка на уведомления.');

    const fingerprint = createHash('sha256').update(`${input.transport}:${address}`).digest('hex');
    await this.db.$transaction(async (tx) => {
      await this.getActiveSession(tx, userId, sessionId);
      const current = { userId, sessionId, transport: input.transport, revokedAt: null };
      if (input.refreshOnly && !(await tx.pushSubscription.count({ where: current }))) return;
      await tx.pushSubscription.updateMany({
        where: {
          ...current,
          fingerprint: { not: fingerprint },
        },
        data: { revokedAt: new Date() },
      });
      const data = {
        userId,
        sessionId,
        transport: input.transport,
        address,
        p256dh: input.p256dh ?? null,
        authSecret: input.auth ?? null,
        revokedAt: null,
      };
      await tx.pushSubscription.upsert({
        where: { fingerprint },
        create: { fingerprint, ...data },
        update: data,
      });
    });
  }

  async unsubscribe(userId: string, sessionId: string, transport: PushTransportValue) {
    await this.db.$transaction(async (tx) => {
      await this.getActiveSession(tx, userId, sessionId);
      await tx.pushSubscription.updateMany({
        where: { userId, sessionId, transport, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async inbox(userId: string): Promise<NotificationInboxDto> {
    const items = await this.db.$queryRaw<VisibleNotice[]>`
        SELECT n.id, n.kind, n."taskId", n."groupId", n."scheduledAt", n."createdAt", n."readAt"
        FROM reminder_notices n WHERE ${visibility(userId)}
        ORDER BY n."createdAt" DESC, n.id DESC LIMIT 30`;
    return {
      items: items.map((item) => ({
        ...item,
        scheduledAt: item.scheduledAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt?.toISOString() ?? null,
      })),
      unreadCount: items.filter((item) => !item.readAt).length,
    };
  }

  async read(userId: string, id: string) {
    const count = await this.db.$executeRaw`
      UPDATE reminder_notices n SET "readAt" = COALESCE(n."readAt", now())
      WHERE n.id = ${id}::uuid AND ${visibility(userId)}`;
    if (!count) throw new NotFoundException('Напоминание не найдено.');
  }

  private async getActiveSession(tx: Prisma.TransactionClient, userId: string, sessionId: string) {
    const session = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM sessions WHERE id = ${sessionId}::uuid AND "userId" = ${userId}::uuid
      AND "expiresAt" > now() FOR UPDATE`;
    if (!session.length) throw new UnauthorizedException('Сессия истекла. Войдите снова.');
  }
}
