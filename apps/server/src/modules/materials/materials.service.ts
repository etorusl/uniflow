import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import { GroupsService, type GroupAccess } from '../groups/groups.service.js';
import type { Material, Prisma } from '../../generated/prisma/client.js';
import type { MaterialInputDto, MaterialUpdateDto } from './materials.dto.js';
function present(m: Material, access: GroupAccess) {
  return {
    id: m.id,
    groupId: m.groupId,
    authorId: m.authorId,
    title: m.title,
    body: m.body,
    version: m.version,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    canEdit: m.authorId === access.member.userId,
    canDelete: m.authorId === access.member.userId || access.role !== 'MEMBER',
  };
}
@Injectable()
export class MaterialsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(GroupsService) private readonly groups: GroupsService,
  ) {}
  async material(tx: Prisma.TransactionClient, groupId: string, id: string) {
    const m = await tx.material.findFirst({ where: { id, groupId, deletedAt: null } });
    if (!m) throw new NotFoundException('Материал не найден.');
    return m;
  }
  async list(userId: string, groupId: string, query: PaginationDto) {
    const access = await this.groups.access(userId, groupId);
    const where = { groupId, deletedAt: null };
    const [items, total] = await this.db.$transaction([
      this.db.material.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.material.count({ where }),
    ]);
    return { items: items.map((m) => present(m, access)), total };
  }
  async get(userId: string, groupId: string, id: string) {
    const access = await this.groups.access(userId, groupId);
    return present(await this.material(this.db, groupId, id), access);
  }
  async create(userId: string, groupId: string, input: MaterialInputDto) {
    return this.groups.locked(userId, groupId, async (tx, access) =>
      present(await tx.material.create({ data: { ...input, groupId, authorId: userId } }), access),
    );
  }
  async update(userId: string, groupId: string, id: string, input: MaterialUpdateDto) {
    return this.groups.locked(userId, groupId, async (tx, access) => {
      const m = await this.material(tx, groupId, id);
      if (m.authorId !== userId)
        throw new ForbiddenException('Редактировать материал может только автор.');
      if (m.version !== input.version)
        throw new ConflictException(
          'Материал изменён на другом устройстве. Обновите список и повторите правку.',
        );
      return present(
        await tx.material.update({
          where: { id },
          data: { title: input.title, body: input.body, version: { increment: 1 } },
        }),
        access,
      );
    });
  }
  async remove(userId: string, groupId: string, id: string) {
    await this.groups.locked(userId, groupId, async (tx, access) => {
      const m = await this.material(tx, groupId, id);
      if (m.authorId !== userId && access.role === 'MEMBER')
        throw new ForbiddenException('Нет права удалить материал.');
      await tx.material.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
