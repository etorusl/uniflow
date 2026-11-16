import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { StorageService } from '../../infrastructure/storage.service.js';

export const FILES_CLEANUP_QUEUE = 'files.cleanup';
const ABANDONED_AFTER_MS = 30 * 60 * 1000;

@Injectable()
export class FilesCleanupService {
  private readonly logger = new Logger(FilesCleanupService.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async cleanup(now = new Date()) {
    const eligible: Prisma.AttachmentWhereInput = {
      OR: [
        { state: 'DELETING' },
        { state: 'PENDING', createdAt: { lte: new Date(now.getTime() - ABANDONED_AFTER_MS) } },
        {
          state: 'READY',
          OR: [
            { taskId: null, groupTaskId: null, materialId: null },
            { groupTask: { is: { deletedAt: { not: null } } } },
            { groupTask: { is: { group: { archivedAt: { not: null } } } } },
            { material: { is: { group: { archivedAt: { not: null } } } } },
          ],
        },
      ],
    };
    const candidates = await this.db.attachment.findMany({
      where: eligible,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, objectKey: true },
    });
    for (const candidate of candidates) {
      const result = await this.db.attachment.updateMany({
        where: { id: candidate.id, ...eligible },
        data: { state: 'DELETING' },
      });
      if (!result.count) continue;
      try {
        await this.storage.client.send(
          new DeleteObjectCommand({
            Bucket: this.storage.env.S3_BUCKET,
            Key: candidate.objectKey,
          }),
          { abortSignal: AbortSignal.timeout(4000) },
        );
        await this.db.attachment.deleteMany({ where: { id: candidate.id, state: 'DELETING' } });
      } catch {
        this.logger.warn(
          JSON.stringify({ event: 'attachment_cleanup_failed', attachmentId: candidate.id }),
        );
      }
    }
  }
}
