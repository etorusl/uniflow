import { api, resultData } from '../../platform/api';
import type { components } from '@uniflow/api-client';

export type Subject = components['schemas']['SubjectDto'];
export type Teacher = components['schemas']['TeacherDto'];
export type Semester = components['schemas']['SemesterDto'];
export type Entry = components['schemas']['EntryDto'];
export type Occurrence = components['schemas']['OccurrenceDto'];
async function allPages<T>(load: (page: number) => Promise<{ items: T[]; total: number }>) {
  const values: T[] = [];
  let page = 1;
  for (;;) {
    const data = await load(page++);
    values.push(...data.items);
    if (!data.items.length || values.length >= data.total) return values;
  }
}
export const loadSubjects = () =>
  allPages(async (page) =>
    resultData(await api.GET('/api/v1/subjects', { params: { query: { page, limit: 100 } } })),
  );
export const loadTeachers = () =>
  allPages(async (page) =>
    resultData(await api.GET('/api/v1/teachers', { params: { query: { page, limit: 100 } } })),
  );
export const loadSemesters = () =>
  allPages(async (page) =>
    resultData(await api.GET('/api/v1/semesters', { params: { query: { page, limit: 100 } } })),
  );
export const loadEntries = () =>
  allPages(async (page) =>
    resultData(
      await api.GET('/api/v1/schedule/entries', { params: { query: { page, limit: 100 } } }),
    ),
  );
