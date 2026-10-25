import { useCallback, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { Link } from 'expo-router';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { useAuth } from '../auth/auth-context';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { Dialog } from '../../shared/dialog';
import { SelectField } from '../../shared/select-field';
import { EmptyState, pageStyles } from '../../shared/empty-state';
import { colors } from '../../shared/theme';
import {
  loadEntries,
  loadSemesters,
  loadSubjects,
  loadTeachers,
  type Entry,
  type Occurrence,
  type Semester,
  type Subject,
  type Teacher,
} from './data';

const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const shortDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const parities = [
  { value: 'ALL', label: 'Каждую неделю' },
  { value: 'EVEN', label: 'Чётные недели' },
  { value: 'ODD', label: 'Нечётные недели' },
];
type Mode = 'semester' | 'entry' | 'semesters' | 'entries' | 'move';
export function ScheduleWorkspace() {
  const { user } = useAuth();
  const zone = user?.timeZone ?? 'UTC';
  const width = useWindowDimensions().width;
  const wide = width >= 1700;
  const [view, setView] = useState<'day' | 'week'>(width >= 900 ? 'week' : 'day');
  const [week, setWeek] = useState(() => DateTime.now().setZone(zone).startOf('week').toISODate()!);
  const [day, setDay] = useState(() => DateTime.now().setZone(zone).weekday - 1);
  const [subjects, setSubjects] = useState<Subject[]>([]),
    [teachers, setTeachers] = useState<Teacher[]>([]),
    [semesters, setSemesters] = useState<Semester[]>([]),
    [entries, setEntries] = useState<Entry[]>([]),
    [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [mode, setMode] = useState<Mode | null>(null),
    [editId, setEditId] = useState<string | null>(null);
  const [remove, setRemove] = useState<{ kind: 'semester' | 'entry'; id: string } | null>(null);
  const [name, setName] = useState(''),
    [startDate, setStartDate] = useState(''),
    [endDate, setEndDate] = useState(''),
    [weekStartDate, setWeekStartDate] = useState(''),
    [semesterZone, setSemesterZone] = useState(zone);
  const [semesterId, setSemesterId] = useState(''),
    [subjectId, setSubjectId] = useState(''),
    [teacherId, setTeacherId] = useState(''),
    [dayOfWeek, setDayOfWeek] = useState('1'),
    [startTime, setStartTime] = useState('09:00'),
    [endTime, setEndTime] = useState('10:30'),
    [parity, setParity] = useState('ALL'),
    [room, setRoom] = useState('');
  const [moving, setMoving] = useState<Occurrence | null>(null),
    [moveDate, setMoveDate] = useState(''),
    [moveStart, setMoveStart] = useState(''),
    [moveEnd, setMoveEnd] = useState('');
  const reload = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [a, b, c, d, e] = await Promise.all([
        loadSubjects(),
        loadTeachers(),
        loadSemesters(),
        loadEntries(),
        api
          .GET('/api/v1/schedule/occurrences', {
            params: {
              query: { from: week, to: DateTime.fromISO(week).plus({ days: 6 }).toISODate()! },
            },
          })
          .then(resultData),
      ]);
      setSubjects(a);
      setTeachers(b);
      setSemesters(c);
      setEntries(d);
      setItems(e.items);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [week]);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function editSemester(value?: Semester) {
    const now = DateTime.now().setZone(zone),
      year = now.year;
    const start = now.month >= 8 ? `${year}-09-01` : `${year}-02-01`;
    setEditId(value?.id ?? null);
    setName(
      value?.name ?? (now.month >= 8 ? `Осенний семестр ${year}` : `Весенний семестр ${year}`),
    );
    setStartDate(value?.startDate ?? start);
    setEndDate(value?.endDate ?? (now.month >= 8 ? `${year + 1}-01-31` : `${year}-06-30`));
    setWeekStartDate(value?.weekStartDate ?? DateTime.fromISO(start).startOf('week').toISODate()!);
    setSemesterZone(value?.timeZone ?? zone);
    setError('');
    setMode('semester');
  }
  function editEntry(value?: Entry) {
    setEditId(value?.id ?? null);
    setSemesterId(value?.semesterId ?? semesters[0]?.id ?? '');
    setSubjectId(value?.subjectId ?? subjects[0]?.id ?? '');
    setTeacherId(value?.teacherId ?? '');
    setDayOfWeek(String(value?.dayOfWeek ?? 1));
    setStartTime(value?.startTime ?? '09:00');
    setEndTime(value?.endTime ?? '10:30');
    setParity(value?.parity ?? 'ALL');
    setRoom(value?.room ?? '');
    setError('');
    setMode('entry');
  }
  async function saveSemester() {
    const body = { name, startDate, endDate, weekStartDate, timeZone: semesterZone };
    if (
      await mutate(async () =>
        ensureSuccess(
          editId
            ? await api.PATCH('/api/v1/semesters/{id}', { params: { path: { id: editId } }, body })
            : await api.POST('/api/v1/semesters', { body }),
        ),
      )
    )
      setMode(null);
  }
  async function saveEntry() {
    const body = {
      semesterId,
      subjectId,
      teacherId: teacherId || null,
      dayOfWeek: Number(dayOfWeek),
      startTime,
      endTime,
      parity: parity as Entry['parity'],
      room: room || null,
    };
    if (
      await mutate(async () =>
        ensureSuccess(
          editId
            ? await api.PATCH('/api/v1/schedule/entries/{id}', {
                params: { path: { id: editId } },
                body,
              })
            : await api.POST('/api/v1/schedule/entries', { body }),
        ),
      )
    )
      setMode(null);
  }
  async function cancel(value: Occurrence) {
    await mutate(async () =>
      ensureSuccess(
        await api.PUT('/api/v1/schedule/entries/{id}/exceptions/{date}', {
          params: { path: { id: value.entryId, date: value.originalDate } },
          body: { cancelled: true },
        }),
      ),
    );
  }
  async function restore(value: Occurrence) {
    await mutate(async () =>
      ensureSuccess(
        await api.DELETE('/api/v1/schedule/entries/{id}/exceptions/{date}', {
          params: { path: { id: value.entryId, date: value.originalDate } },
        }),
      ),
    );
  }
  function beginMove(value: Occurrence) {
    const studyZone = semesters.find((item) => item.id === value.semesterId)?.timeZone ?? zone;
    setMoving(value);
    setMoveDate(DateTime.fromISO(value.startsAt).setZone(studyZone).toISODate()!);
    setMoveStart(DateTime.fromISO(value.startsAt).setZone(studyZone).toFormat('HH:mm'));
    setMoveEnd(DateTime.fromISO(value.endsAt).setZone(studyZone).toFormat('HH:mm'));
    setError('');
    setMode('move');
  }
  async function saveMove() {
    if (!moving) return;
    if (
      await mutate(async () =>
        ensureSuccess(
          await api.PUT('/api/v1/schedule/entries/{id}/exceptions/{date}', {
            params: { path: { id: moving.entryId, date: moving.originalDate } },
            body: {
              cancelled: false,
              replacementDate: moveDate,
              startTime: moveStart,
              endTime: moveEnd,
            },
          }),
        ),
      )
    )
      setMode(null);
  }
  async function confirmDelete() {
    if (!remove) return;
    if (
      await mutate(async () =>
        ensureSuccess(
          remove.kind === 'semester'
            ? await api.DELETE('/api/v1/semesters/{id}', { params: { path: { id: remove.id } } })
            : await api.DELETE('/api/v1/schedule/entries/{id}', {
                params: { path: { id: remove.id } },
              }),
        ),
      )
    )
      setRemove(null);
  }
  const weekDate = DateTime.fromISO(week, { zone });
  const visibleDays = view === 'day' ? [day] : [0, 1, 2, 3, 4, 5, 6];
  return (
    <>
      <View style={formStyles.row}>
        <Button
          title="Добавить пару"
          disabled={!subjects.length || !semesters.length}
          onPress={() => editEntry()}
        />
        <Button secondary title="Добавить семестр" onPress={() => editSemester()} />
        <Link href="/subjects" style={formStyles.link}>
          Предметы и преподаватели →
        </Link>
      </View>
      <View style={formStyles.row}>
        <Button
          secondary
          title="Семестры"
          onPress={() => {
            setError('');
            setMode('semesters');
          }}
        />
        <Button
          secondary
          title="Шаблоны пар"
          onPress={() => {
            setError('');
            setMode('entries');
          }}
        />
      </View>
      {!!error && !mode && !remove && <Notice message={error} />}
      {(!subjects.length || !semesters.length) && !loading && (
        <Notice
          success
          message="Для начала добавьте предмет и семестр. Затем можно составить расписание пар."
        />
      )}
      <View style={formStyles.row}>
        <Button
          secondary
          title="← Неделя"
          onPress={() => setWeek(weekDate.minus({ weeks: 1 }).toISODate()!)}
        />
        <Text style={pageStyles.heading}>
          {weekDate.toFormat('dd.MM')} — {weekDate.plus({ days: 6 }).toFormat('dd.MM.yyyy')}
        </Text>
        <Button
          secondary
          title="Неделя →"
          onPress={() => setWeek(weekDate.plus({ weeks: 1 }).toISODate()!)}
        />
        <Button
          secondary
          title="Сегодня"
          onPress={() => {
            setWeek(DateTime.now().setZone(zone).startOf('week').toISODate()!);
            setDay(DateTime.now().setZone(zone).weekday - 1);
          }}
        />
        <Button title="День" secondary={view !== 'day'} onPress={() => setView('day')} />
        <Button title="Неделя" secondary={view !== 'week'} onPress={() => setView('week')} />
      </View>
      <Text style={formStyles.muted}>Время отображается в {zone}.</Text>
      {view === 'day' && (
        <View style={formStyles.row}>
          {days.map((label, index) => (
            <Button
              key={label}
              title={shortDays[index]!}
              secondary={day !== index}
              onPress={() => setDay(index)}
            />
          ))}
        </View>
      )}
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={{ flexDirection: view === 'week' && wide ? 'row' : 'column', gap: 12 }}>
          {visibleDays.map((index) => {
            const date = weekDate.plus({ days: index }).toISODate()!,
              lessons = items.filter((item) => item.date === date);
            return (
              <View
                key={date}
                style={{ flex: view === 'week' && wide ? 1 : undefined, gap: 10, minWidth: 0 }}
              >
                <Text style={pageStyles.heading}>
                  {days[index]} · {weekDate.plus({ days: index }).toFormat('dd.MM')}
                </Text>
                {lessons.length === 0 ? (
                  <Text
                    style={[
                      formStyles.muted,
                      { padding: 16, backgroundColor: colors.surface, borderRadius: 12 },
                    ]}
                  >
                    Пар нет
                  </Text>
                ) : (
                  lessons.map((lesson) => (
                    <View
                      key={lesson.id}
                      style={[
                        formStyles.card,
                        {
                          padding: 16,
                          borderLeftWidth: 4,
                          borderLeftColor: lesson.color,
                          gap: 10,
                          opacity: lesson.cancelled ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>
                        {DateTime.fromISO(lesson.startsAt).setZone(zone).toFormat('HH:mm')}–
                        {DateTime.fromISO(lesson.endsAt).setZone(zone).toFormat('HH:mm')}
                      </Text>
                      <Text
                        style={{
                          color: colors.ink,
                          fontWeight: '700',
                          fontSize: 16,
                          textDecorationLine: lesson.cancelled ? 'line-through' : 'none',
                        }}
                      >
                        {lesson.subjectName}
                      </Text>
                      <Text style={formStyles.muted}>
                        {[lesson.teacherName, lesson.room && `Ауд. ${lesson.room}`]
                          .filter(Boolean)
                          .join(' · ') || 'Без преподавателя и аудитории'}
                      </Text>
                      <Text style={formStyles.muted}>
                        {lesson.cancelled
                          ? 'Отменено'
                          : lesson.moved
                            ? 'Перенесено'
                            : `Учебная неделя ${lesson.weekNumber}`}
                      </Text>
                      <View style={formStyles.row}>
                        {lesson.cancelled || lesson.moved ? (
                          <Button
                            title="Восстановить"
                            secondary
                            busy={busy}
                            onPress={() => void restore(lesson)}
                          />
                        ) : null}
                        {!lesson.cancelled && (
                          <>
                            <Button
                              title="Перенести"
                              secondary
                              disabled={busy}
                              onPress={() => beginMove(lesson)}
                            />
                            <Button
                              title="Отменить"
                              secondary
                              disabled={busy}
                              onPress={() => void cancel(lesson)}
                            />
                          </>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>
      )}
      <Dialog
        visible={mode === 'semester'}
        title={editId ? 'Изменить семестр' : 'Новый семестр'}
        onClose={() => setMode(null)}
      >
        <Field label="Название семестра" value={name} onChangeText={setName} />
        <Field
          label="Начало семестра (ГГГГ-ММ-ДД)"
          value={startDate}
          onChangeText={(value) => {
            setStartDate(value);
            const date = DateTime.fromISO(value);
            if (date.isValid) setWeekStartDate(date.startOf('week').toISODate()!);
          }}
        />
        <Field label="Конец семестра (ГГГГ-ММ-ДД)" value={endDate} onChangeText={setEndDate} />
        <Field
          label="Понедельник первой учебной недели"
          value={weekStartDate}
          onChangeText={setWeekStartDate}
        />
        <Field
          label="Часовой пояс расписания"
          value={semesterZone}
          onChangeText={setSemesterZone}
        />
        {!!error && <Notice message={error} />}
        <Button title="Сохранить семестр" busy={busy} onPress={() => void saveSemester()} />
      </Dialog>
      <Dialog
        visible={mode === 'entry'}
        title={editId ? 'Изменить шаблон пары' : 'Новая пара'}
        onClose={() => setMode(null)}
      >
        <SelectField
          label="Семестр"
          value={semesterId}
          options={semesters.map((value) => ({ value: value.id, label: value.name }))}
          onChange={setSemesterId}
        />
        <SelectField
          label="Предмет"
          value={subjectId}
          options={subjects.map((value) => ({ value: value.id, label: value.name }))}
          onChange={setSubjectId}
        />
        <SelectField
          label="Преподаватель"
          value={teacherId}
          options={[
            { value: '', label: 'Не указан' },
            ...teachers.map((value) => ({ value: value.id, label: value.name })),
          ]}
          onChange={setTeacherId}
        />
        <SelectField
          label="День недели"
          value={dayOfWeek}
          options={days.map((label, index) => ({ value: String(index + 1), label }))}
          onChange={setDayOfWeek}
        />
        <View style={formStyles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Начало (ЧЧ:ММ)" value={startTime} onChangeText={setStartTime} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Окончание (ЧЧ:ММ)" value={endTime} onChangeText={setEndTime} />
          </View>
        </View>
        <SelectField label="Повторение" value={parity} options={parities} onChange={setParity} />
        <Field label="Аудитория" value={room} onChangeText={setRoom} />
        <Text style={formStyles.muted}>
          Время пары задаётся в{' '}
          {semesters.find((value) => value.id === semesterId)?.timeZone ?? zone}.
        </Text>
        {editId && (
          <Notice message="Изменение шаблона обновит все его пары и сбросит их отмены и переносы." />
        )}
        {!!error && <Notice message={error} />}
        <Button title="Сохранить пару" busy={busy} onPress={() => void saveEntry()} />
      </Dialog>
      <Dialog visible={mode === 'semesters'} title="Ваши семестры" onClose={() => setMode(null)}>
        {semesters.length ? (
          semesters.map((value) => (
            <View key={value.id} style={{ gap: 10 }}>
              <Text style={pageStyles.heading}>{value.name}</Text>
              <Text style={formStyles.muted}>
                {value.startDate} — {value.endDate} · {value.timeZone}
              </Text>
              <View style={formStyles.row}>
                <Button secondary title="Изменить" onPress={() => editSemester(value)} />
                <Button
                  secondary
                  title="Удалить"
                  onPress={() => {
                    setMode(null);
                    setRemove({ kind: 'semester', id: value.id });
                  }}
                />
              </View>
            </View>
          ))
        ) : (
          <Text style={formStyles.muted}>Семестров пока нет.</Text>
        )}
      </Dialog>
      <Dialog visible={mode === 'entries'} title="Шаблоны пар" onClose={() => setMode(null)}>
        {entries.length ? (
          entries.map((value) => (
            <View key={value.id} style={{ gap: 10 }}>
              <Text style={pageStyles.heading}>
                {subjects.find((subject) => subject.id === value.subjectId)?.name}
              </Text>
              <Text style={formStyles.muted}>
                {days[value.dayOfWeek - 1]} · {value.startTime}–{value.endTime} ·{' '}
                {parities.find((item) => item.value === value.parity)?.label}
              </Text>
              <View style={formStyles.row}>
                <Button secondary title="Изменить" onPress={() => editEntry(value)} />
                <Button
                  secondary
                  title="Удалить шаблон"
                  onPress={() => {
                    setMode(null);
                    setRemove({ kind: 'entry', id: value.id });
                  }}
                />
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            title="Пары пока не добавлены"
            description="Создайте первый шаблон расписания."
          />
        )}
      </Dialog>
      <Dialog visible={mode === 'move'} title="Перенести пару" onClose={() => setMode(null)}>
        <Text style={formStyles.muted}>
          {moving?.subjectName}. Перенос изменит только одно занятие. Время:{' '}
          {semesters.find((value) => value.id === moving?.semesterId)?.timeZone ?? zone}.
        </Text>
        <Field label="Новая дата (ГГГГ-ММ-ДД)" value={moveDate} onChangeText={setMoveDate} />
        <Field label="Новое начало (ЧЧ:ММ)" value={moveStart} onChangeText={setMoveStart} />
        <Field label="Новое окончание (ЧЧ:ММ)" value={moveEnd} onChangeText={setMoveEnd} />
        {!!error && <Notice message={error} />}
        <Button title="Сохранить перенос" busy={busy} onPress={() => void saveMove()} />
      </Dialog>
      <Dialog visible={!!remove} title="Удалить расписание?" onClose={() => setRemove(null)}>
        <Text style={formStyles.muted}>
          {remove?.kind === 'semester'
            ? 'Семестр и все его пары будут удалены. Предметы сохранятся.'
            : 'Все занятия этого шаблона, их отмены и переносы будут удалены.'}
        </Text>
        {!!error && <Notice message={error} />}
        <Button
          title="Подтвердить удаление"
          busy={busy}
          style={{ backgroundColor: colors.danger }}
          onPress={() => void confirmDelete()}
        />
      </Dialog>
    </>
  );
}
