import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import type { SubjectInputDto, TeacherInputDto } from './catalog.dto.js';

const subjectSelect = { id: true, name: true, color: true } as const;
const teacherSelect = { id: true, name: true, email: true, phone: true, notes: true } as const;
@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async subject(userId: string, id: string) {
    const value = await this.db.subject.findFirst({ where: { id, userId } });
    if (!value) throw new NotFoundException('Предмет не найден.');
    return value;
  }
  async teacher(userId: string, id: string) {
    const value = await this.db.teacher.findFirst({ where: { id, userId } });
    if (!value) throw new NotFoundException('Преподаватель не найден.');
    return value;
  }
  async subjects(userId: string, query: PaginationDto) {
    const [items, total] = await this.db.$transaction([
      this.db.subject.findMany({
        where: { userId },
        select: subjectSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.subject.count({ where: { userId } }),
    ]);
    return { items, total };
  }
  async teachers(userId: string, query: PaginationDto) {
    const [items, total] = await this.db.$transaction([
      this.db.teacher.findMany({
        where: { userId },
        select: teacherSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.teacher.count({ where: { userId } }),
    ]);
    return { items, total };
  }
  createSubject(userId: string, input: SubjectInputDto) {
    return this.db.subject.create({ data: { userId, ...input }, select: subjectSelect });
  }
  async updateSubject(userId: string, id: string, input: SubjectInputDto) {
    await this.subject(userId, id);
    return this.db.subject.update({ where: { id, userId }, data: input, select: subjectSelect });
  }
  async deleteSubject(userId: string, id: string) {
    const result = await this.db.subject.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Предмет не найден.');
  }
  createTeacher(userId: string, input: TeacherInputDto) {
    return this.db.teacher.create({
      data: {
        userId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
      select: teacherSelect,
    });
  }
  async updateTeacher(userId: string, id: string, input: TeacherInputDto) {
    await this.teacher(userId, id);
    return this.db.teacher.update({
      where: { id, userId },
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
      },
      select: teacherSelect,
    });
  }
  async deleteTeacher(userId: string, id: string) {
    const result = await this.db.teacher.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Преподаватель не найден.');
  }
}
