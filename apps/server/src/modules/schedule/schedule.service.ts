import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { DatabaseService } from '../../infrastructure/database.service.js';
import { pageQuery, type PaginationDto } from '../../common/pagination.dto.js';
import { assertTimeZone } from '../auth/auth.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import type { Semester, ScheduleEntry } from '../../generated/prisma/client.js';
import type {
  EntryDto,
  EntryInputDto,
  ExceptionInputDto,
  OccurrenceDto,
  OccurrencesQueryDto,
  SemesterDto,
  SemesterInputDto,
} from './schedule.dto.js';
import {
  calendarDate,
  dateString,
  localInstant,
  matchesWeek,
  validateTimes,
  weekNumber,
} from './calendar.js';

function semesterDto(value: Semester): SemesterDto {
  return {
    id: value.id,
    name: value.name,
    startDate: dateString(value.startDate),
    endDate: dateString(value.endDate),
    weekStartDate: dateString(value.weekStartDate),
    timeZone: value.timeZone,
  };
}
function entryDto(value: ScheduleEntry): EntryDto {
  return {
    id: value.id,
    semesterId: value.semesterId,
    subjectId: value.subjectId,
    teacherId: value.teacherId,
    dayOfWeek: value.dayOfWeek,
    startTime: value.startTime,
    endTime: value.endTime,
    parity: value.parity,
    room: value.room,
  };
}
@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  async semester(userId: string, id: string) {
    const value = await this.db.semester.findFirst({ where: { userId, id } });
    if (!value) throw new NotFoundException('Семестр не найден.');
    return value;
  }
  async entry(userId: string, id: string) {
    const value = await this.db.scheduleEntry.findFirst({
      where: { userId, id },
      include: { semester: true },
    });
    if (!value) throw new NotFoundException('Занятие не найдено.');
    return value;
  }
  async semesters(userId: string, query: PaginationDto) {
    const [values, total] = await this.db.$transaction([
      this.db.semester.findMany({
        where: { userId },
        orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.semester.count({ where: { userId } }),
    ]);
    return { items: values.map(semesterDto), total };
  }
  private semesterData(input: SemesterInputDto) {
    assertTimeZone(input.timeZone);
    const start = calendarDate(input.startDate),
      end = calendarDate(input.endDate),
      week = calendarDate(input.weekStartDate);
    if (end < start || end.diff(start, 'days').days > 366)
      throw new BadRequestException('Семестр должен длиться от одного дня до 367 дней.');
    if (week.weekday !== 1 || week > start)
      throw new BadRequestException(
        'Начало первой учебной недели — понедельник не позже начала семестра.',
      );
    return {
      name: input.name,
      startDate: start.toJSDate(),
      endDate: end.toJSDate(),
      weekStartDate: week.toJSDate(),
      timeZone: input.timeZone,
    };
  }
  async createSemester(userId: string, input: SemesterInputDto) {
    return semesterDto(
      await this.db.semester.create({ data: { userId, ...this.semesterData(input) } }),
    );
  }
  async updateSemester(userId: string, id: string, input: SemesterInputDto) {
    const existing = await this.semester(userId, id),
      data = this.semesterData(input);
    const entries = await this.db.scheduleEntry.findMany({ where: { userId, semesterId: id } });
    for (const entry of entries) this.validateSeries({ ...existing, ...data }, entry);
    return semesterDto(await this.db.semester.update({ where: { id, userId }, data }));
  }
  async deleteSemester(userId: string, id: string) {
    const result = await this.db.semester.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Семестр не найден.');
  }
  async entries(userId: string, query: PaginationDto) {
    const [values, total] = await this.db.$transaction([
      this.db.scheduleEntry.findMany({
        where: { userId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
        ...pageQuery(query),
      }),
      this.db.scheduleEntry.count({ where: { userId } }),
    ]);
    return { items: values.map(entryDto), total };
  }
  private validateSeries(
    semester: Semester,
    input: Pick<EntryInputDto, 'dayOfWeek' | 'parity' | 'startTime' | 'endTime'>,
  ) {
    // Reject a template that would contain a nonexistent wall-clock time.
    for (
      let date = calendarDate(dateString(semester.startDate));
      date <= calendarDate(dateString(semester.endDate));
      date = date.plus({ days: 1 })
    ) {
      const day = date.toISODate()!;
      if (matchesWeek(day, input.dayOfWeek, input.parity, dateString(semester.weekStartDate))) {
        localInstant(day, input.startTime, semester.timeZone);
        localInstant(day, input.endTime, semester.timeZone);
      }
    }
  }
  private async entryData(userId: string, input: EntryInputDto) {
    const semester = await this.semester(userId, input.semesterId);
    await this.catalog.subject(userId, input.subjectId);
    if (input.teacherId) await this.catalog.teacher(userId, input.teacherId);
    validateTimes(input.startTime, input.endTime);
    this.validateSeries(semester, input);
    return {
      semesterId: input.semesterId,
      subjectId: input.subjectId,
      teacherId: input.teacherId ?? null,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      parity: input.parity,
      room: input.room?.trim() || null,
    };
  }
  async createEntry(userId: string, input: EntryInputDto) {
    return entryDto(
      await this.db.scheduleEntry.create({
        data: { userId, ...(await this.entryData(userId, input)) },
      }),
    );
  }
  async updateEntry(userId: string, id: string, input: EntryInputDto) {
    await this.entry(userId, id);
    const data = await this.entryData(userId, input);
    return this.db.$transaction(async (tx) => {
      const value = await tx.scheduleEntry.update({ where: { id, userId }, data });
      await tx.scheduleException.deleteMany({ where: { entryId: id } });
      return entryDto(value);
    });
  }
  async deleteEntry(userId: string, id: string) {
    const result = await this.db.scheduleEntry.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Занятие не найдено.');
  }
  async setException(
    userId: string,
    entryId: string,
    originalDate: string,
    input: ExceptionInputDto,
  ) {
    const entry = await this.entry(userId, entryId),
      semester = entry.semester;
    const date = calendarDate(originalDate);
    if (
      date < calendarDate(dateString(semester.startDate)) ||
      date > calendarDate(dateString(semester.endDate)) ||
      !matchesWeek(originalDate, entry.dayOfWeek, entry.parity, dateString(semester.weekStartDate))
    )
      throw new BadRequestException('На эту дату нет занятия по данному шаблону.');
    if (!input.cancelled) {
      const replacement = calendarDate(input.replacementDate!);
      if (
        replacement < calendarDate(dateString(semester.startDate)) ||
        replacement > calendarDate(dateString(semester.endDate))
      )
        throw new BadRequestException('Дата переноса должна входить в семестр.');
      validateTimes(input.startTime!, input.endTime!);
      localInstant(input.replacementDate!, input.startTime!, semester.timeZone);
      localInstant(input.replacementDate!, input.endTime!, semester.timeZone);
    }
    const data = {
      cancelled: input.cancelled,
      replacementDate: input.cancelled ? null : calendarDate(input.replacementDate!).toJSDate(),
      startTime: input.cancelled ? null : input.startTime!,
      endTime: input.cancelled ? null : input.endTime!,
    };
    await this.db.scheduleException.upsert({
      where: { entryId_originalDate: { entryId, originalDate: date.toJSDate() } },
      create: { entryId, originalDate: date.toJSDate(), ...data },
      update: data,
    });
  }
  async removeException(userId: string, entryId: string, originalDate: string) {
    await this.entry(userId, entryId);
    await this.db.scheduleException.deleteMany({
      where: { entryId, originalDate: calendarDate(originalDate).toJSDate() },
    });
  }
  async occurrences(userId: string, viewerZone: string, query: OccurrencesQueryDto) {
    const from = calendarDate(query.from),
      to = calendarDate(query.to);
    if (to < from || to.diff(from, 'days').days > 61)
      throw new BadRequestException('Выберите период не более 62 дней.');
    const windowStart = DateTime.fromISO(query.from, { zone: viewerZone }).startOf('day');
    const windowEnd = DateTime.fromISO(query.to, { zone: viewerZone })
      .plus({ days: 1 })
      .startOf('day');
    const values = await this.db.scheduleEntry.findMany({
      where: {
        userId,
        semester: {
          startDate: { lte: to.plus({ days: 2 }).toJSDate() },
          endDate: { gte: from.minus({ days: 2 }).toJSDate() },
        },
      },
      include: { semester: true, subject: true, teacher: true, exceptions: true },
    });
    const items: OccurrenceDto[] = [];
    for (const entry of values) {
      const semester = entry.semester;
      const exceptions = new Map(
        entry.exceptions.map((value) => [dateString(value.originalDate), value]),
      );
      for (
        let date = calendarDate(dateString(semester.startDate));
        date <= calendarDate(dateString(semester.endDate));
        date = date.plus({ days: 1 })
      ) {
        const originalDate = date.toISODate()!;
        if (
          !matchesWeek(
            originalDate,
            entry.dayOfWeek,
            entry.parity,
            dateString(semester.weekStartDate),
          )
        )
          continue;
        const exception = exceptions.get(originalDate);
        const actualDate = exception?.replacementDate
          ? dateString(exception.replacementDate)
          : originalDate;
        if (
          actualDate < from.minus({ days: 2 }).toISODate()! ||
          actualDate > to.plus({ days: 2 }).toISODate()!
        )
          continue;
        const start = localInstant(
          actualDate,
          exception?.startTime ?? entry.startTime,
          semester.timeZone,
        );
        const end = localInstant(
          actualDate,
          exception?.endTime ?? entry.endTime,
          semester.timeZone,
        );
        if (start < windowStart || start >= windowEnd) continue;
        items.push({
          id: `${entry.id}:${originalDate}`,
          entryId: entry.id,
          semesterId: semester.id,
          subjectName: entry.subject.name,
          color: entry.subject.color,
          teacherName: entry.teacher?.name ?? null,
          room: entry.room,
          originalDate,
          date: start.setZone(viewerZone).toISODate()!,
          startsAt: start.toISO()!,
          endsAt: end.toISO()!,
          cancelled: exception?.cancelled ?? false,
          moved: !!exception?.replacementDate,
          weekNumber: weekNumber(originalDate, dateString(semester.weekStartDate)),
        });
      }
    }
    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
    return { items };
  }
}
