import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Attachment, Prisma } from '../../generated/prisma/client.js';
import { GroupsService } from '../groups/groups.service.js';
import type { TargetKind } from './file-validation.js';

export type AttachmentTarget = { kind: TargetKind; id: string };

export function attachmentTarget(
  file: Pick<Attachment, 'taskId' | 'groupTaskId' | 'materialId'>,
): AttachmentTarget {
  if (file.taskId) return { kind: 'task', id: file.taskId };
  if (file.groupTaskId) return { kind: 'group-task', id: file.groupTaskId };
  if (file.materialId) return { kind: 'material', id: file.materialId };
  throw new NotFoundException('Вложение не найдено.');
}

export function targetColumns(target: AttachmentTarget) {
  if (target.kind === 'task') return { taskId: target.id };
  if (target.kind === 'group-task') return { groupTaskId: target.id };
  return { materialId: target.id };
}

@Injectable()
export class AttachmentAccessService {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  async require(
    client: Prisma.TransactionClient,
    target: AttachmentTarget,
    userId: string,
    edit = false,
    lock = edit,
  ) {
    if (target.kind === 'task') {
      if (lock) {
        const rows = await client.$queryRaw<{ id: string }[]>`
          SELECT id FROM tasks WHERE id = ${target.id}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
        if (!rows.length) throw new NotFoundException('Задание не найдено.');
      } else {
        const task = await client.task.findFirst({
          where: { id: target.id, userId },
          select: { id: true },
        });
        if (!task) throw new NotFoundException('Задание не найдено.');
      }
      return;
    }

    const findParent = () =>
      target.kind === 'group-task'
        ? client.groupTask.findFirst({
            where: { id: target.id, deletedAt: null },
            select: { groupId: true, authorId: true },
          })
        : client.groupMaterial.findUnique({
            where: { id: target.id },
            select: { groupId: true, authorId: true },
          });
    const parent = await findParent();
    if (!parent) throw new NotFoundException('Публикация не найдена.');
    if (lock) await this.groups.lock(client, parent.groupId);
    await this.groups.requireMember(parent.groupId, userId, client);
    if (edit) {
      const locked = lock ? await findParent() : parent;
      if (!locked) throw new NotFoundException('Публикация не найдена.');
      if (locked.authorId !== userId)
        throw new ForbiddenException('Вложения может изменить автор публикации.');
    }
  }
}
