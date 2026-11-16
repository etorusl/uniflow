import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { GroupsService } from '../groups/groups.service.js';
import type { GroupMaterialInputDto } from './files.dto.js';

const details = {
  author: { select: { displayName: true } },
  _count: { select: { attachments: { where: { state: 'READY' } } } },
} satisfies Prisma.GroupMaterialInclude;

function present(material: Prisma.GroupMaterialGetPayload<{ include: typeof details }>) {
  return {
    id: material.id,
    authorId: material.authorId,
    groupId: material.groupId,
    title: material.title,
    description: material.description,
    authorName: material.author?.displayName ?? null,
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString(),
    attachmentCount: material._count.attachments,
  };
}

@Injectable()
export class GroupMaterialsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(GroupsService) private readonly groups: GroupsService,
  ) {}

  async list(groupId: string, userId: string, query: PaginationDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.groups.requireMember(groupId, userId, tx);
        const items = await tx.groupMaterial.findMany({
          where: { groupId },
          include: details,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...pageQuery(query),
        });
        const total = await tx.groupMaterial.count({ where: { groupId } });
        return { items: items.map(present), total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async create(groupId: string, userId: string, input: GroupMaterialInputDto) {
    return this.db.$transaction(async (tx) => {
      await this.groups.lock(tx, groupId);
      await this.groups.requireMember(groupId, userId, tx);
      return present(
        await tx.groupMaterial.create({
          data: { ...input, groupId, authorId: userId },
          include: details,
        }),
      );
    });
  }

  async update(groupId: string, id: string, userId: string, input: GroupMaterialInputDto) {
    return this.db.$transaction(async (tx) => {
      await this.groups.lock(tx, groupId);
      await this.groups.requireMember(groupId, userId, tx);
      const material = await tx.groupMaterial.findUnique({ where: { id, groupId } });
      if (!material) throw new NotFoundException('Материал не найден.');
      if (material.authorId !== userId)
        throw new ForbiddenException('Материал может изменить его автор.');
      return present(
        await tx.groupMaterial.update({ where: { id }, data: input, include: details }),
      );
    });
  }

  async remove(groupId: string, id: string, userId: string) {
    await this.db.$transaction(async (tx) => {
      await this.groups.lock(tx, groupId);
      const { role } = await this.groups.requireMember(groupId, userId, tx);
      const material = await tx.groupMaterial.findUnique({ where: { id, groupId } });
      if (!material) throw new NotFoundException('Материал не найден.');
      if (material.authorId !== userId && role === 'MEMBER')
        throw new ForbiddenException('Вы не можете удалить этот материал.');
      await tx.groupMaterial.delete({ where: { id } });
    });
  }
}
