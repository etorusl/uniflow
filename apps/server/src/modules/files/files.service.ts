import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { StorageService } from '../../infrastructure/storage.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { RateLimitService } from '../auth/rate-limit.service.js';
import { pageQuery } from '../../common/pagination.dto.js';
import type { Attachment, Prisma } from '../../generated/prisma/client.js';
import type { FileParentDto, FilesQueryDto } from './files.dto.js';
import { GROUP_QUOTA, inspectFile, MAX_ATTACHMENTS, USER_QUOTA } from './file-policy.js';

const missing = () => new NotFoundException('Файл или публикация недоступны.');
const present = (a: Attachment) => ({
  id: a.id,
  filename: a.filename,
  mimeType: a.mimeType,
  byteSize: a.byteSize,
  createdAt: a.createdAt.toISOString(),
});
function parentOf(a: Attachment): FileParentDto {
  if (a.personalTaskId) return { parentType: 'PERSONAL_TASK', parentId: a.personalTaskId };
  if (a.groupTaskId) return { parentType: 'GROUP_TASK', parentId: a.groupTaskId };
  if (a.materialId) return { parentType: 'MATERIAL', parentId: a.materialId };
  throw missing();
}
@Injectable()
export class FilesService {
  private readonly logger = new Logger('Files');
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}
  private async parent(
    tx: Prisma.TransactionClient,
    userId: string,
    input: FileParentDto,
    right: 'READ' | 'WRITE' | 'DELETE',
    lock = false,
  ) {
    if (input.parentType === 'PERSONAL_TASK') {
      if (lock)
        await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${input.parentId}::uuid FOR UPDATE`;
      if (!(await tx.task.findFirst({ where: { id: input.parentId, userId } }))) throw missing();
      return { link: { personalTaskId: input.parentId }, groupId: null };
    }
    const where = { id: input.parentId, deletedAt: null };
    const find = () =>
      input.parentType === 'GROUP_TASK'
        ? tx.groupTask.findFirst({ where })
        : tx.material.findFirst({ where });
    let value = await find();
    if (!value) throw missing();
    if (lock) {
      await tx.$queryRaw`SELECT id FROM groups WHERE id = ${value.groupId}::uuid FOR UPDATE`;
      value = await find();
      if (!value) throw missing();
    }
    const access = await this.groups.access(userId, value.groupId, tx);
    if (
      (right === 'WRITE' && value.authorId !== userId) ||
      (right === 'DELETE' && value.authorId !== userId && access.role === 'MEMBER')
    )
      throw new ForbiddenException('Нет права менять вложения этой публикации.');
    return {
      link:
        input.parentType === 'GROUP_TASK' ? { groupTaskId: value.id } : { materialId: value.id },
      groupId: value.groupId,
    };
  }
  async list(userId: string, query: FilesQueryDto) {
    const { link } = await this.parent(this.db, userId, query, 'READ');
    const where = { ...link, status: 'READY' as const };
    const [items, total] = await this.db.$transaction([
      this.db.attachment.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.attachment.count({ where }),
    ]);
    return { items: items.map(present), total };
  }
  async upload(userId: string, input: FileParentDto, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Выберите файл.');
    await this.limits.consume(`file-upload:${userId}`, 30, 900);
    const metadata = await inspectFile(file.buffer, file.originalname);
    const value = await this.db.$transaction(async (tx) => {
      // Serialize the per-user quota even when uploading into different publications.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`file-quota:${userId}`}, 0))`;
      const parent = await this.parent(tx, userId, input, 'WRITE', true);
      const [count, userBytes, groupBytes] = await Promise.all([
        tx.attachment.count({ where: parent.link }),
        tx.attachment.aggregate({ where: { uploaderId: userId }, _sum: { byteSize: true } }),
        parent.groupId
          ? tx.attachment.aggregate({
              where: { groupId: parent.groupId },
              _sum: { byteSize: true },
            })
          : null,
      ]);
      if (count >= MAX_ATTACHMENTS)
        throw new BadRequestException('В публикации может быть не больше 10 файлов.');
      if (
        (userBytes._sum.byteSize ?? 0) + file.buffer.length > USER_QUOTA ||
        (groupBytes?._sum.byteSize ?? 0) + file.buffer.length > GROUP_QUOTA
      )
        throw new BadRequestException(
          'Недостаточно места: квота пользователя 200 МБ, группы 500 МБ.',
        );
      return tx.attachment.create({
        data: {
          ...parent.link,
          groupId: parent.groupId,
          uploaderId: userId,
          objectKey: `attachments/${randomUUID()}`,
          ...metadata,
          byteSize: file.buffer.length,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    });
    try {
      await this.storage.client.send(
        new PutObjectCommand({
          Bucket: this.storage.env.S3_BUCKET,
          Key: value.objectKey,
          Body: file.buffer,
          ContentType: value.mimeType,
        }),
        { abortSignal: AbortSignal.timeout(90000) },
      );
      return await this.db.$transaction(async (tx) => {
        await this.parent(tx, userId, input, 'WRITE', true);
        const updated = await tx.attachment.updateMany({
          where: { id: value.id, status: 'PENDING' },
          data: { status: 'READY' },
        });
        if (!updated.count) throw missing();
        return present(await tx.attachment.findUniqueOrThrow({ where: { id: value.id } }));
      });
    } catch (error) {
      await this.db.attachment
        .updateMany({ where: { id: value.id }, data: { status: 'DELETING' } })
        .catch(() => undefined);
      throw error;
    }
  }
  private async accessible(userId: string, id: string) {
    const value = await this.db.attachment.findUnique({ where: { id } });
    if (!value || value.status !== 'READY') throw missing();
    await this.parent(this.db, userId, parentOf(value), 'READ');
    return value;
  }
  async get(userId: string, id: string) {
    return present(await this.accessible(userId, id));
  }
  async content(userId: string, id: string) {
    const value = await this.accessible(userId, id);
    const response = await this.storage.client.send(
      new GetObjectCommand({ Bucket: this.storage.env.S3_BUCKET, Key: value.objectKey }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    if (!response.Body) throw missing();
    return {
      metadata: present(value),
      bytes: Buffer.from(await response.Body.transformToByteArray()),
    };
  }
  async remove(userId: string, id: string) {
    const value = await this.db.attachment.findUnique({ where: { id } });
    if (!value) return; // Repeating a completed removal is harmless and reveals no metadata.
    await this.db.$transaction(async (tx) => {
      await this.parent(tx, userId, parentOf(value), 'DELETE', true);
      await tx.attachment.updateMany({ where: { id }, data: { status: 'DELETING' } });
    });
    await this.erase(value);
  }
  private async erase(value: Attachment) {
    await this.storage.client.send(
      new DeleteObjectCommand({ Bucket: this.storage.env.S3_BUCKET, Key: value.objectKey }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    await this.db.attachment.deleteMany({ where: { id: value.id, status: 'DELETING' } });
  }
  async cleanup() {
    const values = await this.db.attachment.findMany({
      where: {
        OR: [
          { status: 'DELETING' },
          { status: 'PENDING', expiresAt: { lte: new Date() } },
          { personalTaskId: null, groupTaskId: null, materialId: null },
          { groupTask: { is: { deletedAt: { not: null } } } },
          { material: { is: { deletedAt: { not: null } } } },
          { group: { is: { archivedAt: { not: null } } } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    let removed = 0;
    for (const value of values) {
      try {
        await this.db.attachment.updateMany({
          where: { id: value.id },
          data: { status: 'DELETING' },
        });
        await this.erase(value);
        removed++;
      } catch {
        this.logger.error(JSON.stringify({ event: 'file_cleanup_failed', attachmentId: value.id }));
      }
    }
    return { scanned: values.length, removed };
  }
}
