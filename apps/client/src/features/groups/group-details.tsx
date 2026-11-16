import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Dialog } from '../../shared/dialog';
import { pageStyles } from '../../shared/empty-state';
import { Button, Notice, formStyles } from '../../shared/forms';
import { SelectField } from '../../shared/select-field';
import { colors } from '../../shared/theme';
import { GroupMaterials } from '../files/group-materials';
import { loadSubjects, type Subject } from '../study/data';
import { GroupEditor } from './group-directory';
import { GroupInvitations, GroupMembers } from './group-members';
import { groupRoles, type Group, type GroupInput, useGroupActions } from './group-shared';
import { GroupTasks } from './group-tasks';

type Tab = 'tasks' | 'materials' | 'members' | 'invites';
const tabs: { id: Tab; label: string }[] = [
  { id: 'tasks', label: 'Задания' },
  { id: 'materials', label: 'Материалы' },
  { id: 'members', label: 'Участники' },
  { id: 'invites', label: 'Приглашения' },
];
export function GroupDetails({
  groupId,
  viewerId,
  zone,
  taskId,
}: {
  groupId: string;
  viewerId: string;
  zone: string;
  taskId?: string;
}) {
  const [group, setGroup] = useState<Group>();
  const [tab, setTab] = useState<Tab>('tasks');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editor, setEditor] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'archive'>();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [linkEditor, setLinkEditor] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const actions = useGroupActions();
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setGroup(
        resultData(await api.GET('/api/v1/groups/{groupId}', { params: { path: { groupId } } })),
      );
    } catch (caught) {
      setGroup(undefined);
      setLoadError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [groupId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (taskId) setTab('tasks');
  }, [taskId]);

  function back() {
    router.setParams({ groupId: undefined, taskId: undefined });
  }
  function save(input: GroupInput) {
    void actions.run(async () => {
      setGroup(
        resultData(
          await api.PATCH('/api/v1/groups/{groupId}', {
            params: { path: { groupId } },
            body: input,
          }),
        ),
      );
      setEditor(false);
    });
  }
  function openLinkEditor() {
    actions.clear();
    setSubjectId(group?.linkedSubjectId ?? '');
    setLinkEditor(true);
    if (!subjects) void actions.run(async () => setSubjects(await loadSubjects()));
  }
  function saveLink() {
    void actions.run(async () => {
      const result = resultData(
        await api.PUT('/api/v1/groups/{groupId}/subject', {
          params: { path: { groupId } },
          body: { subjectId: subjectId || null },
        }),
      );
      setGroup(result);
      setLinkEditor(false);
    });
  }
  function removeOrLeave() {
    void actions.run(async () => {
      const params = { path: { groupId } };
      ensureSuccess(
        confirm === 'archive'
          ? await api.DELETE('/api/v1/groups/{groupId}', { params })
          : await api.POST('/api/v1/groups/{groupId}/leave', { params }),
      );
      back();
    });
  }
  function changeTab(id: Tab) {
    if (id !== 'tasks' && taskId) router.setParams({ taskId: undefined });
    setTab(id);
  }

  return (
    <View style={{ gap: 20 }}>
      <View style={formStyles.row}>
        <Button title="К списку групп" secondary onPress={back} />
      </View>
      {loading && <ActivityIndicator accessibilityLabel="Загрузка группы" color={colors.primary} />}
      {!!loadError && (
        <>
          <Notice message={loadError} />
          <Button title="Повторить" secondary onPress={() => void reload()} />
        </>
      )}
      {group && (
        <>
          <View>
            <Text accessibilityRole="header" style={pageStyles.title}>
              {group.name}
            </Text>
            <Text style={pageStyles.subtitle}>
              {group.subjectName} · {groupRoles[group.role]}
            </Text>
            {group.description ? <Text style={formStyles.muted}>{group.description}</Text> : null}
          </View>
          <View style={formStyles.row}>
            <Button
              title={
                group.linkedSubjectId ? 'Изменить личный предмет' : 'Связать с личным предметом'
              }
              secondary
              onPress={openLinkEditor}
            />
            {group.role === 'OWNER' ? (
              <>
                <Button
                  title="Настройки группы"
                  secondary
                  onPress={() => {
                    actions.clear();
                    setEditor(true);
                  }}
                />
                <Button
                  title="Архивировать группу"
                  secondary
                  onPress={() => {
                    actions.clear();
                    setConfirm('archive');
                  }}
                />
              </>
            ) : (
              <Button
                title="Выйти из группы"
                secondary
                onPress={() => {
                  actions.clear();
                  setConfirm('leave');
                }}
              />
            )}
          </View>
          <View style={formStyles.row}>
            {tabs
              .filter((entry) => entry.id !== 'invites' || group.role !== 'MEMBER')
              .map((entry) => (
                <Button
                  key={entry.id}
                  title={entry.label}
                  secondary={tab !== entry.id}
                  onPress={() => changeTab(entry.id)}
                />
              ))}
          </View>
          {tab === 'tasks' && <GroupTasks group={group} zone={zone} taskId={taskId} />}
          {tab === 'materials' && (
            <GroupMaterials groupId={groupId} role={group.role} viewerId={viewerId} />
          )}
          {tab === 'members' && (
            <GroupMembers group={group} viewerId={viewerId} onChanged={() => void reload()} />
          )}
          {tab === 'invites' && group.role !== 'MEMBER' && (
            <GroupInvitations groupId={groupId} zone={zone} />
          )}
          {editor && (
            <GroupEditor
              group={group}
              onClose={() => setEditor(false)}
              onSave={save}
              busy={actions.busy}
              error={actions.error}
            />
          )}
          {linkEditor && (
            <Dialog title="Личный предмет группы" visible onClose={() => setLinkEditor(false)}>
              <Text style={formStyles.muted}>Эта связь видна только вам.</Text>
              <SelectField
                label="Личный предмет"
                value={subjectId}
                options={[
                  { value: '', label: 'Без связи' },
                  ...(subjects ?? []).map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  })),
                ]}
                onChange={setSubjectId}
              />
              {!!actions.error && <Notice message={actions.error} />}
              <Button
                title="Сохранить связь"
                busy={actions.busy}
                disabled={subjects === null}
                onPress={saveLink}
              />
            </Dialog>
          )}
          {confirm && (
            <Dialog
              title={confirm === 'archive' ? 'Архивировать группу?' : 'Выйти из группы?'}
              visible
              onClose={() => setConfirm(undefined)}
            >
              <Text style={formStyles.muted}>
                {confirm === 'archive'
                  ? 'Группа исчезнет у всех участников, а приглашения перестанут работать.'
                  : 'Доступ к закрытым заданиям и материалам будет прекращён.'}
              </Text>
              {!!actions.error && <Notice message={actions.error} />}
              <Button title="Подтвердить" busy={actions.busy} onPress={removeOrLeave} />
            </Dialog>
          )}
        </>
      )}
    </View>
  );
}
