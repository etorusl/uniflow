import { useCallback, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { useAuth } from '../auth/auth-context';
import { loadSubjects, type Subject } from '../study/data';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { Dialog } from '../../shared/dialog';
import { SelectField } from '../../shared/select-field';
import { EmptyState, pageStyles } from '../../shared/empty-state';
import { colors } from '../../shared/theme';
import { StatisticsCards, type Statistics } from './statistics-cards';

export type Task = components['schemas']['TaskDto'];
type Event = components['schemas']['TaskEventDto'];
type Filter = 'ALL' | 'OPEN' | 'COMPLETED' | 'OVERDUE';
const statusLabels: Record<Task['status'], string> = {
  OPEN: 'В работе',
  OVERDUE: 'Просрочено',
  COMPLETED_ON_TIME: 'Выполнено вовремя',
  COMPLETED_LATE: 'Выполнено с опозданием',
};
export function TasksWorkspace() {
  const { user } = useAuth();
  const zone = user?.timeZone ?? 'UTC';
  const params = useLocalSearchParams<{ create?: string }>();
  const [items, setItems] = useState<Task[]>([]),
    [subjects, setSubjects] = useState<Subject[]>([]),
    [statistics, setStatistics] = useState<Statistics | null>(null),
    [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>('OPEN'),
    [subjectFilter, setSubjectFilter] = useState(''),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [editor, setEditor] = useState<{ id?: string } | null>(null),
    [remove, setRemove] = useState<Task | null>(null),
    [history, setHistory] = useState<{ title: string; items: Event[] } | null>(null);
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [subjectId, setSubjectId] = useState(''),
    [dueDate, setDueDate] = useState(''),
    [dueTime, setDueTime] = useState('18:00');
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [a, b, c] = await Promise.all([
        loadSubjects(),
        api
          .GET('/api/v1/tasks', {
            params: {
              query: { status: filter, subjectId: subjectFilter || undefined, page, limit: 20 },
            },
          })
          .then(resultData),
        api.GET('/api/v1/statistics/me').then(resultData),
      ]);
      setSubjects(a);
      setItems(b.items);
      setTotal(b.total);
      setStatistics(c);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [filter, subjectFilter, page]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const edit = useCallback(
    (task?: Task) => {
      const due = task
        ? DateTime.fromISO(task.dueAt).setZone(zone)
        : DateTime.now().setZone(zone).plus({ days: 1 }).set({ hour: 18, minute: 0 });
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setSubjectId(task?.subjectId ?? '');
      setDueDate(due.toISODate()!);
      setDueTime(due.toFormat('HH:mm'));
      setEditor({ id: task?.id });
      setError('');
      setMessage('');
    },
    [zone],
  );
  useEffect(() => {
    if (params.create === '1') {
      edit();
      router.setParams({ create: undefined });
    }
  }, [params.create, edit]);
  async function mutate(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await reload();
      if (success) setMessage(success);
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editor) return;
    try {
      const date = DateTime.fromISO(`${dueDate}T${dueTime}`, { zone });
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime) ||
        !date.isValid ||
        date.toFormat('HH:mm') !== dueTime
      )
        throw new Error('Укажите существующую дату и время в вашем часовом поясе.');
      const deadline =
        date.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0] ?? date;
      const body = {
        title,
        description,
        subjectId: subjectId || null,
        dueAt: deadline.toUTC().toISO()!,
      };
      if (
        await mutate(
          async () =>
            ensureSuccess(
              editor.id
                ? await api.PATCH('/api/v1/tasks/{id}', {
                    params: { path: { id: editor.id } },
                    body,
                  })
                : await api.POST('/api/v1/tasks', { body }),
            ),
          'Задание сохранено.',
        )
      )
        setEditor(null);
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function toggle(task: Task) {
    const path = task.completedAt ? '/api/v1/tasks/{id}/reopen' : '/api/v1/tasks/{id}/complete';
    await mutate(
      async () => ensureSuccess(await api.POST(path, { params: { path: { id: task.id } } })),
      task.completedAt ? 'Задание возвращено в работу.' : 'Задание выполнено.',
    );
  }
  async function showHistory(task: Task) {
    setBusy(true);
    setError('');
    try {
      const data = resultData(
        await api.GET('/api/v1/tasks/{id}/history', { params: { path: { id: task.id } } }),
      );
      setHistory({ title: task.title, items: data.items });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (
      remove &&
      (await mutate(
        async () =>
          ensureSuccess(
            await api.DELETE('/api/v1/tasks/{id}', { params: { path: { id: remove.id } } }),
          ),
        'Задание удалено.',
      ))
    )
      setRemove(null);
  }
  return (
    <>
      {statistics && <StatisticsCards value={statistics} />}
      <View style={formStyles.row}>
        <Button title="Добавить задание" onPress={() => edit()} />
        {(
          [
            { value: 'OPEN', label: 'В работе' },
            { value: 'ALL', label: 'Все' },
            { value: 'COMPLETED', label: 'Выполненные' },
            { value: 'OVERDUE', label: 'Просроченные' },
          ] as const
        ).map((item) => (
          <Button
            key={item.value}
            title={item.label}
            secondary={filter !== item.value}
            onPress={() => {
              setPage(1);
              setFilter(item.value);
            }}
          />
        ))}
      </View>
      <SelectField
        label="Фильтр по предмету"
        value={subjectFilter}
        onChange={(value) => {
          setPage(1);
          setSubjectFilter(value);
        }}
        options={[
          { value: '', label: 'Все предметы' },
          ...subjects.map((value) => ({ value: value.id, label: value.name })),
        ]}
      />
      {!!error && !editor && !remove && <Notice message={error} />}
      {!!message && <Notice message={message} success />}
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Здесь пока нет заданий"
          description="Добавьте первое задание или выберите другой фильтр."
          symbol="☑"
        />
      ) : (
        items.map((task) => (
          <View
            key={task.id}
            testID={`task-${task.id}`}
            style={[
              formStyles.card,
              { borderLeftWidth: 4, borderLeftColor: task.subjectColor ?? colors.primary },
            ]}
          >
            <View style={formStyles.row}>
              <Text style={[pageStyles.heading, { flex: 1, minWidth: 150, marginBottom: 0 }]}>
                {task.title}
              </Text>
              <Text
                style={{
                  color:
                    task.status === 'OVERDUE'
                      ? colors.danger
                      : task.completedAt
                        ? colors.green
                        : colors.primary,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {statusLabels[task.status]}
              </Text>
            </View>
            <Text style={formStyles.muted}>
              {task.subjectName ?? 'Без предмета'} · до{' '}
              {DateTime.fromISO(task.dueAt)
                .setZone(zone)
                .setLocale('ru')
                .toFormat('d LLL yyyy, HH:mm')}
            </Text>
            {!!task.description && (
              <Text style={{ color: colors.ink, lineHeight: 23 }}>{task.description}</Text>
            )}
            {task.completedAt && (
              <Text style={formStyles.muted}>
                Завершено{' '}
                {DateTime.fromISO(task.completedAt)
                  .setZone(zone)
                  .setLocale('ru')
                  .toFormat('d LLL, HH:mm')}
              </Text>
            )}
            <View style={formStyles.row}>
              <Button
                title={task.completedAt ? 'Вернуть в работу' : 'Выполнить'}
                busy={busy}
                onPress={() => void toggle(task)}
              />
              <Button secondary title="Изменить" disabled={busy} onPress={() => edit(task)} />
              <Button
                secondary
                title="История"
                disabled={busy}
                onPress={() => void showHistory(task)}
              />
              <Button
                secondary
                title="Удалить"
                disabled={busy}
                onPress={() => {
                  setRemove(task);
                  setError('');
                }}
              />
            </View>
          </View>
        ))
      )}
      {total > 20 && (
        <View style={formStyles.row}>
          <Button
            secondary
            title="← Назад"
            disabled={page === 1 || loading}
            onPress={() => setPage(page - 1)}
          />
          <Text style={formStyles.muted}>
            Страница {page} из {Math.ceil(total / 20)}
          </Text>
          <Button
            secondary
            title="Дальше →"
            disabled={page * 20 >= total || loading}
            onPress={() => setPage(page + 1)}
          />
        </View>
      )}
      <Dialog
        visible={!!editor}
        title={editor?.id ? 'Изменить задание' : 'Новое задание'}
        onClose={() => setEditor(null)}
      >
        <Field
          label="Название задания"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
          autoCapitalize="sentences"
        />
        <Field
          label="Описание"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={5000}
        />
        <SelectField
          label="Предмет задания"
          value={subjectId}
          onChange={setSubjectId}
          options={[
            { value: '', label: 'Без предмета' },
            ...subjects.map((value) => ({ value: value.id, label: value.name })),
          ]}
        />
        <Field label="Дата дедлайна (ГГГГ-ММ-ДД)" value={dueDate} onChangeText={setDueDate} />
        <Field label="Время дедлайна (ЧЧ:ММ)" value={dueTime} onChangeText={setDueTime} />
        <Text style={formStyles.muted}>Часовой пояс: {zone}. Изменить его можно в профиле.</Text>
        {!!error && <Notice message={error} />}
        <Button title="Сохранить задание" busy={busy} onPress={() => void save()} />
      </Dialog>
      <Dialog visible={!!remove} title="Удалить задание?" onClose={() => setRemove(null)}>
        <Text style={formStyles.muted}>
          {remove?.title}. Задание и его история будут удалены, статистика пересчитается.
        </Text>
        {!!error && <Notice message={error} />}
        <Button
          title="Подтвердить удаление"
          busy={busy}
          style={{ backgroundColor: colors.danger }}
          onPress={() => void confirmDelete()}
        />
      </Dialog>
      <Dialog visible={!!history} title="История выполнения" onClose={() => setHistory(null)}>
        <Text style={pageStyles.heading}>{history?.title}</Text>
        {history?.items.length ? (
          history.items.map((event) => (
            <View key={event.id} style={{ gap: 5 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>
                {event.kind === 'COMPLETED' ? 'Выполнено' : 'Возвращено в работу'}
              </Text>
              <Text style={formStyles.muted}>
                {DateTime.fromISO(event.createdAt)
                  .setZone(zone)
                  .setLocale('ru')
                  .toFormat('d LLL yyyy, HH:mm')}
              </Text>
              <Text style={formStyles.muted}>
                Дедлайн на тот момент:{' '}
                {DateTime.fromISO(event.deadlineSnapshot)
                  .setZone(zone)
                  .setLocale('ru')
                  .toFormat('d LLL yyyy, HH:mm')}
              </Text>
            </View>
          ))
        ) : (
          <Text style={formStyles.muted}>Отметок выполнения пока нет.</Text>
        )}
      </Dialog>
    </>
  );
}
