import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, errorMessage, resultData } from '../../platform/api';
import { Dialog } from '../../shared/dialog';
import { EmptyState, pageStyles } from '../../shared/empty-state';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { colors } from '../../shared/theme';
import {
  groupPageSize,
  GroupPagination,
  GroupPanel,
  groupRoles,
  type Group,
  type GroupInput,
  useGroupActions,
} from './group-shared';

const defaultGroup = { name: '', subjectName: '', description: '' };

export function GroupEditor({
  group,
  onClose,
  onSave,
  busy,
  error,
}: {
  group?: Group;
  onClose: () => void;
  onSave: (data: GroupInput) => void;
  busy: boolean;
  error: string;
}) {
  const [input, setInput] = useState<GroupInput>(group ?? defaultGroup);
  return (
    <Dialog title={group ? 'Настройки группы' : 'Новая группа'} visible onClose={onClose}>
      <Field
        label="Название группы"
        value={input.name}
        onChangeText={(name) => setInput({ ...input, name })}
        maxLength={100}
      />
      <Field
        label="Название предмета"
        value={input.subjectName}
        onChangeText={(subjectName) => setInput({ ...input, subjectName })}
        maxLength={100}
      />
      <Field
        label="Описание группы"
        value={input.description ?? ''}
        onChangeText={(description) => setInput({ ...input, description })}
        maxLength={1000}
        multiline
      />
      {!!error && <Notice message={error} />}
      <Button
        title={group ? 'Сохранить группу' : 'Создать группу'}
        busy={busy}
        disabled={!input.name.trim() || !input.subjectName.trim()}
        onPress={() =>
          onSave({
            name: input.name,
            subjectName: input.subjectName,
            description: input.description ?? '',
          })
        }
      />
    </Dialog>
  );
}

function inviteCode(input: string) {
  const text = input.trim();
  if (/^[A-Za-z0-9_-]{20}$/.test(text)) return text;
  return /^https?:\/\//i.test(text)
    ? (/[?&]invite=([A-Za-z0-9_-]{20})(?:[&#]|$)/.exec(text)?.[1] ?? text)
    : text;
}

export function GroupDirectory({ invite }: { invite?: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [create, setCreate] = useState(false);
  const [join, setJoin] = useState(!!invite);
  const [code, setCode] = useState(invite ?? '');
  const actions = useGroupActions();
  const reload = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const data = resultData(
        await api.GET('/api/v1/groups', { params: { query: { page, limit: groupPageSize } } }),
      );
      setGroups(data.items);
      setTotal(data.total);
    } catch (error) {
      setListError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    void reload();
  }, [reload]);

  function open(group: Group) {
    router.setParams({ groupId: group.id, invite: undefined, taskId: undefined });
  }
  function createGroup(data: GroupInput) {
    void actions.run(async () => {
      const group = resultData(await api.POST('/api/v1/groups', { body: data }));
      setCreate(false);
      open(group);
    });
  }
  function joinGroup() {
    void actions.run(async () => {
      const group = resultData(
        await api.POST('/api/v1/groups/join', { body: { code: inviteCode(code) } }),
      );
      setJoin(false);
      open(group);
    });
  }
  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Группы
        </Text>
        <Text style={pageStyles.subtitle}>Учебные группы, участники и задания.</Text>
      </View>
      <View style={formStyles.row}>
        <Button
          title="Новая группа"
          onPress={() => {
            actions.clear();
            setCreate(true);
          }}
        />
        <Button
          title="Вступить в группу"
          secondary
          onPress={() => {
            actions.clear();
            setJoin(true);
          }}
        />
      </View>
      {loading && <ActivityIndicator accessibilityLabel="Загрузка групп" color={colors.primary} />}
      {!!listError && (
        <>
          <Notice message={listError} />
          <Button secondary title="Повторить" onPress={() => void reload()} />
        </>
      )}
      {!loading && !listError && !groups.length && (
        <EmptyState
          title="У вас пока нет групп"
          description="Создайте учебную группу или вступите по приглашению."
          symbol="◎"
        />
      )}
      {groups.map((group) => (
        <GroupPanel key={group.id}>
          <Text accessibilityRole="header" style={pageStyles.heading}>
            {group.name}
          </Text>
          <Text style={formStyles.muted}>
            {group.subjectName} · {groupRoles[group.role]}
          </Text>
          <View style={formStyles.row}>
            <Button title={`Открыть ${group.name}`} secondary onPress={() => open(group)} />
          </View>
        </GroupPanel>
      ))}
      <GroupPagination page={page} total={total} onChange={setPage} />
      {create && (
        <GroupEditor
          onClose={() => setCreate(false)}
          onSave={createGroup}
          busy={actions.busy}
          error={actions.error}
        />
      )}
      {join && (
        <Dialog
          title="Вступление в группу"
          visible
          onClose={() => {
            actions.clear();
            setJoin(false);
            router.setParams({ invite: undefined });
          }}
        >
          <Field
            label="Код или ссылка приглашения"
            value={code}
            onChangeText={setCode}
            maxLength={2048}
          />
          {!!actions.error && <Notice message={actions.error} />}
          <Button
            title="Принять приглашение"
            busy={actions.busy}
            disabled={!code.trim()}
            onPress={joinGroup}
          />
        </Dialog>
      )}
    </View>
  );
}
