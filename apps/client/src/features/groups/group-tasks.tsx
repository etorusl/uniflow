import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { DateTime } from 'luxon';
import { router } from 'expo-router';
import type { components } from '@uniflow/api-client';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Dialog } from '../../shared/dialog';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { pageStyles } from '../../shared/empty-state';
import { colors } from '../../shared/theme';
import { AttachmentPanel } from '../files/attachments';
import { StatisticsCards, type Statistics } from '../tasks/statistics-cards';
import {
  groupDate,
  groupPageSize,
  GroupPagination,
  GroupPanel,
  groupTaskModes,
  groupTaskStatuses,
  type Group,
  type GroupTask,
  useGroupActions,
} from './group-shared';

type Filter = 'ALL' | 'OPEN' | 'COMPLETED' | 'OVERDUE';
type HistoryEvent = components['schemas']['GroupTaskEventDto'];
const filters: { value: Filter; label: string }[] = [
  { value: 'OPEN', label: 'В работе' },
  { value: 'COMPLETED', label: 'Завершено' },
  { value: 'OVERDUE', label: 'Просрочено' },
  { value: 'ALL', label: 'Все' },
];
type EditorData = components['schemas']['NewGroupTaskInputDto'];

function TaskEditor({
  task,
  zone,
  busy,
  error,
  onSave,
  onClose,
}: {
  task?: GroupTask;
  zone: string;
  busy: boolean;
  error: string;
  onSave: (input: EditorData) => void;
  onClose: () => void;
}) {
  const initial = task
    ? DateTime.fromISO(task.dueAt).setZone(zone)
    : DateTime.now().setZone(zone).plus({ days: 1 }).set({ hour: 18, minute: 0 });
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [mode, setMode] = useState<GroupTask['mode']>(task?.mode ?? 'INDIVIDUAL');
  const [date, setDate] = useState(initial.toISODate() ?? '');
  const [time, setTime] = useState(initial.toFormat('HH:mm'));
  const [validation, setValidation] = useState('');

  function save() {
    setValidation('');
    const parsed = DateTime.fromISO(`${date}T${time}`, { zone });
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      !parsed.isValid ||
      parsed.toISODate() !== date ||
      parsed.toFormat('HH:mm') !== time
    ) {
      setValidation('Укажите существующую дату и время в вашем часовом поясе.');
      return;
    }
    const deadline = parsed.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0]!;
    onSave({ title: title.trim(), description, mode, dueAt: deadline.toUTC().toISO()! });
  }

  return (
    <Dialog
      title={task ? 'Изменить задание группы' : 'Новое задание группы'}
      visible
      onClose={onClose}
    >
      <Field
        label="Название задания группы"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <Field
        label="Описание задания группы"
        value={description}
        onChangeText={setDescription}
        maxLength={5000}
        multiline
      />
      <Field label="Дата дедлайна (ГГГГ-ММ-ДД)" value={date} onChangeText={setDate} />
      <Field label="Время дедлайна (ЧЧ:ММ)" value={time} onChangeText={setTime} />
      <Text style={formStyles.muted}>Часовой пояс {zone}</Text>
      <View style={formStyles.row}>
        {task ? (
          <Text style={formStyles.muted}>{groupTaskModes[mode]}</Text>
        ) : (
          (['INDIVIDUAL', 'SHARED'] as const).map((option) => (
            <Button
              key={option}
              title={groupTaskModes[option]}
              secondary={mode !== option}
              onPress={() => setMode(option)}
            />
          ))
        )}
      </View>
      <Text style={formStyles.muted}>
        {mode === 'INDIVIDUAL'
          ? 'У каждого участника своя отметка.'
          : 'У всей группы одна отметка.'}
      </Text>
      {!!(validation || error) && <Notice message={validation || error} />}
      <Button title="Сохранить задание" busy={busy} disabled={!title.trim()} onPress={save} />
    </Dialog>
  );
}

function TaskHistory({
  task,
  zone,
  onClose,
}: {
  task: GroupTask;
  zone: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HistoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = resultData(
        await api.GET('/api/v1/groups/{groupId}/tasks/{id}/history', {
          params: {
            path: { groupId: task.groupId, id: task.id },
            query: { page, limit: groupPageSize },
          },
        }),
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [page, task.id, task.groupId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <Dialog title={`История: ${task.title}`} visible onClose={onClose}>
      {loading && (
        <ActivityIndicator accessibilityLabel="Загрузка истории" color={colors.primary} />
      )}
      {!!error && (
        <>
          <Notice message={error} />
          <Button title="Повторить" secondary onPress={() => void reload()} />
        </>
      )}
      {!loading && !error && !items.length && (
        <Text style={formStyles.muted}>Изменений статуса пока нет.</Text>
      )}
      {items.map((item) => (
        <View key={item.id} style={{ gap: 5 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>
            {item.kind === 'COMPLETED' ? 'Выполнено' : 'Возвращено в работу'}
          </Text>
          <Text style={formStyles.muted}>
            {item.actorName ?? 'Пользователь удалён'} · {groupDate(item.createdAt, zone)}
          </Text>
          <Text style={formStyles.muted}>
            Срок на момент действия: {groupDate(item.deadlineSnapshot, zone)}
          </Text>
        </View>
      ))}
      <GroupPagination page={page} total={total} onChange={setPage} />
    </Dialog>
  );
}

export function GroupTasks({
  group,
  zone,
  taskId,
}: {
  group: Group;
  zone: string;
  taskId?: string;
}) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [tasks, setTasks] = useState<GroupTask[]>([]);
  const [focused, setFocused] = useState<GroupTask>();
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Statistics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusError, setFocusError] = useState('');
  const [editor, setEditor] = useState<{ task?: GroupTask }>();
  const [history, setHistory] = useState<GroupTask>();
  const [attachments, setAttachments] = useState<GroupTask>();
  const [confirm, setConfirm] = useState<GroupTask>();
  const actions = useGroupActions();
  const groupId = group.id;
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setFocusError('');
    try {
      const [list, progress] = await Promise.all([
        api
          .GET('/api/v1/groups/{groupId}/tasks', {
            params: { path: { groupId }, query: { status: filter, page, limit: groupPageSize } },
          })
          .then(resultData),
        api
          .GET('/api/v1/groups/{groupId}/statistics', { params: { path: { groupId } } })
          .then(resultData),
      ]);
      if (!list.items.length && page > 1) {
        setPage(page - 1);
        return;
      }
      setTasks(list.items);
      setTotal(list.total);
      setStats(progress);
      if (taskId) {
        try {
          const target =
            list.items.find((item) => item.id === taskId) ??
            resultData(
              await api.GET('/api/v1/groups/{groupId}/tasks/{id}', {
                params: { path: { groupId, id: taskId } },
              }),
            );
          setFocused(target);
        } catch (caught) {
          setFocused(undefined);
          setFocusError(errorMessage(caught));
        }
      } else setFocused(undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [filter, groupId, page, taskId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  function selectFilter(value: Filter) {
    setPage(1);
    setFilter(value);
  }

  function save(input: EditorData) {
    void actions.run(async () => {
      const task = editor?.task;
      if (task) {
        const body = { title: input.title, description: input.description, dueAt: input.dueAt };
        resultData(
          await api.PATCH('/api/v1/groups/{groupId}/tasks/{id}', {
            params: { path: { groupId, id: task.id } },
            body,
          }),
        );
        await reload();
      } else {
        const created = resultData(
          await api.POST('/api/v1/groups/{groupId}/tasks', {
            params: { path: { groupId } },
            body: input,
          }),
        );
        router.setParams({ taskId: created.id });
      }
      setEditor(undefined);
    });
  }
  function toggle(task: GroupTask) {
    void actions.run(async () => {
      const params = { path: { groupId, id: task.id } };
      resultData(
        task.completedAt
          ? await api.POST('/api/v1/groups/{groupId}/tasks/{id}/reopen', { params })
          : await api.POST('/api/v1/groups/{groupId}/tasks/{id}/complete', { params }),
      );
      await reload();
    });
  }
  function remove(task: GroupTask) {
    void actions.run(async () => {
      ensureSuccess(
        await api.DELETE('/api/v1/groups/{groupId}/tasks/{id}', {
          params: { path: { groupId, id: task.id } },
        }),
      );
      setConfirm(undefined);
      if (task.id === taskId) router.setParams({ taskId: undefined });
      else await reload();
    });
  }
  const visibleTasks = focused
    ? [focused, ...tasks.filter((task) => task.id !== focused.id)]
    : tasks;
  return (
    <View style={{ gap: 18 }}>
      {stats && (
        <GroupPanel>
          <Text accessibilityRole="header" style={pageStyles.heading}>
            Прогресс по общим заданиям
          </Text>
          <StatisticsCards value={stats} />
        </GroupPanel>
      )}
      <View style={formStyles.row}>
        <Button
          title="Добавить задание группы"
          onPress={() => {
            actions.clear();
            setEditor({});
          }}
        />
      </View>
      <View style={formStyles.row}>
        {filters.map((item) => (
          <Button
            key={item.value}
            title={item.label}
            secondary={filter !== item.value}
            onPress={() => selectFilter(item.value)}
          />
        ))}
      </View>
      {loading && (
        <ActivityIndicator accessibilityLabel="Загрузка заданий группы" color={colors.primary} />
      )}
      {!!error && (
        <>
          <Notice message={error} />
          <Button title="Повторить" secondary onPress={() => void reload()} />
        </>
      )}
      {!!focusError && (
        <View style={{ gap: 8 }}>
          <Notice message={focusError} />
          <Button
            title="Закрыть ссылку на задание"
            secondary
            onPress={() => router.setParams({ taskId: undefined })}
          />
        </View>
      )}
      {!!actions.error && !editor && !confirm && <Notice message={actions.error} />}
      {!loading && !error && !visibleTasks.length && (
        <Text style={formStyles.muted}>Заданий по выбранному фильтру пока нет.</Text>
      )}
      {visibleTasks.map((task) => (
        <GroupPanel key={task.id}>
          <Text accessibilityRole="header" style={pageStyles.heading}>
            {task.title}
          </Text>
          <Text style={formStyles.muted}>
            {groupTaskModes[task.mode]} · {groupTaskStatuses[task.status]}
          </Text>
          <Text style={formStyles.muted}>
            Срок {groupDate(task.dueAt, zone)} · {task.authorName ?? 'Автор удалён'}
          </Text>
          {task.description ? <Text style={formStyles.muted}>{task.description}</Text> : null}
          <View style={formStyles.row}>
            {task.canComplete && (
              <Button
                title={task.completedAt ? 'Вернуть в работу' : 'Отметить выполненным'}
                disabled={actions.busy}
                onPress={() => toggle(task)}
              />
            )}
            <Button title="История" secondary onPress={() => setHistory(task)} />
            <Button title="Вложения" secondary onPress={() => setAttachments(task)} />
            {task.canEdit && (
              <Button
                title="Изменить"
                secondary
                disabled={actions.busy}
                onPress={() => {
                  actions.clear();
                  setEditor({ task });
                }}
              />
            )}
            {task.canDelete && (
              <Button
                title="Удалить"
                secondary
                disabled={actions.busy}
                onPress={() => {
                  actions.clear();
                  setConfirm(task);
                }}
              />
            )}
          </View>
        </GroupPanel>
      ))}
      <GroupPagination page={page} total={total} onChange={setPage} />
      {editor && (
        <TaskEditor
          task={editor.task}
          zone={zone}
          onClose={() => setEditor(undefined)}
          onSave={save}
          busy={actions.busy}
          error={actions.error}
        />
      )}
      {history && <TaskHistory task={history} zone={zone} onClose={() => setHistory(undefined)} />}
      {attachments && (
        <Dialog
          title={`Вложения: ${attachments.title}`}
          visible
          onClose={() => setAttachments(undefined)}
        >
          <AttachmentPanel
            parent={{ kind: 'group-task', id: attachments.id }}
            canEdit={attachments.canEdit}
          />
        </Dialog>
      )}
      {confirm && (
        <Dialog title="Удалить задание группы?" visible onClose={() => setConfirm(undefined)}>
          <Text style={formStyles.muted}>{confirm.title}</Text>
          {!!actions.error && <Notice message={actions.error} />}
          <Button title="Удалить задание" busy={actions.busy} onPress={() => remove(confirm)} />
        </Dialog>
      )}
    </View>
  );
}
