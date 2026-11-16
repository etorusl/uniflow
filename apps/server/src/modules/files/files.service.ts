import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Attachment } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { StorageService } from '../../infrastructure/storage.service.js';
import {
  AttachmentAccessService,
  attachmentTarget,
  targetColumns,
  type AttachmentTarget,
} from './attachment-access.service.js';
import {
  MAX_FILES_PER_TARGET,
  MAX_UPLOAD_BYTES_PER_USER,
  validateAttachment,
  type UploadedAttachment,
} from './file-validation.js';

function present(file: Attachment) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt.toISOString(),
  };
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(AttachmentAccessService) private readonly access: AttachmentAccessService,
  ) {}

  async list(userId: string, target: AttachmentTarget) {
    return this.db.$transaction(
      async (tx) => {
        await this.access.require(tx, target, userId);
        const files = await tx.attachment.findMany({
          where: { ...targetColumns(target), state: 'READY' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return { items: files.map(present) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async upload(
    userId: string,
    target: AttachmentTarget,
    file: UploadedAttachment,
    originalName?: string,
  ) {
    const metadata = validateAttachment(file, originalName);
    const targetData = targetColumns(target);
    const pending = await this.db.$transaction(async (tx) => {
      await this.access.require(tx, target, userId, true);
      // Lock the uploader so concurrent requests to different targets share one quota.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const count = await tx.attachment.count({
        where: { ...targetData, state: { not: 'DELETING' } },
      });
      if (count >= MAX_FILES_PER_TARGET)
        throw new BadRequestException('К одной публикации можно прикрепить до 10 файлов.');
      const { _sum } = await tx.attachment.aggregate({
        where: { uploaderId: userId },
        _sum: { size: true },
      });
      if ((_sum.size ?? 0) + metadata.size > MAX_UPLOAD_BYTES_PER_USER)
        throw new BadRequestException('Достигнут лимит хранилища — 100 МиБ на пользователя.');
      return tx.attachment.create({
        data: {
          ...targetData,
          ...metadata,
          uploaderId: userId,
          objectKey: `attachments/${randomUUID()}`,
        },
      });
    });

    try {
      await this.storage.client.send(
        new PutObjectCommand({
          Bucket: this.storage.env.S3_BUCKET,
          Key: pending.objectKey,
          Body: file.buffer,
          ContentLength: metadata.size,
          ContentType: metadata.mimeType,
        }),
        { abortSignal: AbortSignal.timeout(20_000) },
      );
    } catch {
      // Expire the reservation asynchronously. A timed-out S3 request can still finish remotely.
      throw new ServiceUnavailableException();
    }

    return this.db.$transaction(async (tx) => {
      await this.access.require(tx, target, userId, true);
      const updated = await tx.attachment.updateMany({
        where: { id: pending.id, state: 'PENDING', ...targetData },
        data: { state: 'READY' },
      });
      if (!updated.count) throw new NotFoundException('Загрузка уже завершена или истекла.');
      return present(pending);
    });
  }

  async content(userId: string, id: string) {
    const file = await this.db.attachment.findUnique({ where: { id, state: 'READY' } });
    if (!file) throw new NotFoundException('Вложение не найдено.');
    await this.access.require(this.db, attachmentTarget(file), userId);
    try {
      const result = await this.storage.client.send(
        new GetObjectCommand({
          Bucket: this.storage.env.S3_BUCKET,
          Key: file.objectKey,
        }),
        { abortSignal: AbortSignal.timeout(20_000) },
      );
      if (!(result.Body instanceof Readable)) throw new ServiceUnavailableException();
      if (result.ContentLength !== file.size) {
        result.Body.destroy();
        throw new ServiceUnavailableException();
      }
      return { file, stream: result.Body };
    } catch {
      throw new ServiceUnavailableException();
    }
  }

  async remove(userId: string, id: string) {
    await this.db.$transaction(async (tx) => {
      const file = await tx.attachment.findUnique({
        where: { id, state: { in: ['READY', 'DELETING'] } },
      });
      if (!file) throw new NotFoundException('Вложение не найдено.');
      await this.access.require(tx, attachmentTarget(file), userId, true);
      await tx.attachment.updateMany({
        where: { id, state: 'READY' },
        data: { state: 'DELETING' },
      });
    });
  }
}
