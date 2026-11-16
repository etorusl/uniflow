import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Dialog } from '../../shared/dialog';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { colors } from '../../shared/theme';
import {
  groupDate,
  groupPageSize,
  GroupPagination,
  GroupPanel,
  groupRoles,
  type Group,
  type GroupMember,
  type Invitation,
  type NewInvitation,
  useGroupActions,
} from './group-shared';

export function GroupMembers({
  group,
  viewerId,
  onChanged,
}: {
  group: Group;
  viewerId: string;
  onChanged: () => void;
}) {
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [total, setTotal] = useState(0);
  const [showBlocked, setShowBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    member: GroupMember;
    kind: 'remove' | 'transfer';
  }>();
  const actions = useGroupActions();
  const path = { groupId: group.id };
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = resultData(
        await api.GET('/api/v1/groups/{groupId}/members', {
          params: {
            path: { groupId: group.id },
            query: { page, limit: groupPageSize, status: showBlocked ? 'BLOCKED' : 'ACTIVE' },
          },
        }),
      );
      if (!data.items.length && page > 1) {
        setPage(page - 1);
        return;
      }
      setMembers(data.items);
      setTotal(data.total);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [group.id, page, showBlocked]);
  useEffect(() => {
    void reload();
  }, [reload]);

  function prompt(member: GroupMember, kind: 'remove' | 'transfer') {
    actions.clear();
    setConfirmation({ member, kind });
  }
  function confirm() {
    if (!confirmation) return;
    const { member, kind } = confirmation;
    void actions.run(async () => {
      if (kind === 'remove') {
        ensureSuccess(
          await api.DELETE('/api/v1/groups/{groupId}/members/{userId}', {
            params: { path: { ...path, userId: member.userId } },
          }),
        );
      } else {
        resultData(
          await api.POST('/api/v1/groups/{groupId}/transfer-ownership', {
            params: { path },
            body: { userId: member.userId },
          }),
        );
        onChanged();
      }
      setConfirmation(undefined);
      await reload();
    });
  }
  function toggleRole(member: GroupMember) {
    void actions.run(async () => {
      ensureSuccess(
        await api.PATCH('/api/v1/groups/{groupId}/members/{userId}', {
          params: { path: { ...path, userId: member.userId } },
          body: { role: member.role === 'MODERATOR' ? 'MEMBER' : 'MODERATOR' },
        }),
      );
      await reload();
    });
  }
  function unblock(member: GroupMember) {
    void actions.run(async () => {
      ensureSuccess(
        await api.POST('/api/v1/groups/{groupId}/members/{userId}/unblock', {
          params: { path: { ...path, userId: member.userId } },
        }),
      );
      await reload();
    });
  }
  const owner = group.role === 'OWNER';
  return (
    <View style={{ gap: 16 }}>
      {owner && (
        <View style={formStyles.row}>
          <Button
            title="Действующие"
            secondary={showBlocked}
            onPress={() => {
              setPage(1);
              setShowBlocked(false);
            }}
          />
          <Button
            title="Исключённые"
            secondary={!showBlocked}
            onPress={() => {
              setPage(1);
              setShowBlocked(true);
            }}
          />
        </View>
      )}
      {loading && (
        <ActivityIndicator accessibilityLabel="Загрузка участников" color={colors.primary} />
      )}
      {!!error && (
        <>
          <Notice message={error} />
          <Button title="Повторить" secondary onPress={() => void reload()} />
        </>
      )}
      {!!actions.error && !confirmation && <Notice message={actions.error} />}
      {!loading && !error && !members.length && (
        <Text style={formStyles.muted}>В этом списке пока никого нет.</Text>
      )}
      {members.map((member) => {
        const another = member.userId !== viewerId && member.role !== 'OWNER';
        const canRemove =
          another && (owner || (group.role === 'MODERATOR' && member.role === 'MEMBER'));
        return (
          <GroupPanel key={member.userId}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>
              {member.displayName}
              {member.userId === viewerId ? ' (вы)' : ''}
            </Text>
            <Text style={formStyles.muted}>
              {member.blocked ? 'Исключён' : groupRoles[member.role]}
            </Text>
            <View style={formStyles.row}>
              {owner && member.blocked ? (
                <Button
                  secondary
                  title="Разрешить вступление"
                  disabled={actions.busy}
                  onPress={() => unblock(member)}
                />
              ) : (
                <>
                  {owner && another && (
                    <>
                      <Button
                        secondary
                        title={
                          member.role === 'MODERATOR'
                            ? 'Снять роль модератора'
                            : 'Назначить модератором'
                        }
                        disabled={actions.busy}
                        onPress={() => toggleRole(member)}
                      />
                      <Button
                        secondary
                        title="Передать владение"
                        disabled={actions.busy}
                        onPress={() => prompt(member, 'transfer')}
                      />
                    </>
                  )}
                  {canRemove && (
                    <Button
                      title="Исключить"
                      secondary
                      disabled={actions.busy}
                      onPress={() => prompt(member, 'remove')}
                    />
                  )}
                </>
              )}
            </View>
          </GroupPanel>
        );
      })}
      <GroupPagination page={page} total={total} onChange={setPage} />
      {confirmation && (
        <Dialog
          title={confirmation.kind === 'remove' ? 'Исключить участника?' : 'Передать владение?'}
          visible
          onClose={() => setConfirmation(undefined)}
        >
          <Text style={formStyles.muted}>{confirmation.member.displayName}</Text>
          {confirmation.kind === 'transfer' && (
            <Text style={formStyles.muted}>Ваша роль изменится на «Модератор».</Text>
          )}
          {!!actions.error && <Notice message={actions.error} />}
          <Button title="Подтвердить" busy={actions.busy} onPress={confirm} />
        </Dialog>
      )}
    </View>
  );
}

export function GroupInvitations({ groupId, zone }: { groupId: string; zone: string }) {
  const [rows, setRows] = useState<Invitation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(false);
  const [created, setCreated] = useState<NewInvitation>();
  const [hours, setHours] = useState('168');
  const [maxUses, setMaxUses] = useState('25');
  const actions = useGroupActions();
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = resultData(
        await api.GET('/api/v1/groups/{groupId}/invitations', {
          params: { path: { groupId }, query: { page, limit: groupPageSize } },
        }),
      );
      if (!data.items.length && page > 1) {
        setPage(page - 1);
        return;
      }
      setRows(data.items);
      setTotal(data.total);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [groupId, page]);
  useEffect(() => {
    void reload();
  }, [reload]);

  function createInvite() {
    void actions.run(async () => {
      const invite = resultData(
        await api.POST('/api/v1/groups/{groupId}/invitations', {
          params: { path: { groupId } },
          body: { expiresInHours: Number(hours), maxUses: Number(maxUses) },
        }),
      );
      setEditor(false);
      setCreated(invite);
      if (page !== 1) setPage(1);
      else await reload();
    });
  }
  const valid =
    /^\d+$/.test(hours) &&
    Number(hours) >= 1 &&
    Number(hours) <= 720 &&
    /^\d+$/.test(maxUses) &&
    Number(maxUses) >= 1 &&
    Number(maxUses) <= 250;
  return (
    <View style={{ gap: 16 }}>
      <View style={formStyles.row}>
        <Button
          title="Создать приглашение"
          onPress={() => {
            actions.clear();
            setEditor(true);
          }}
        />
      </View>
      {loading && (
        <ActivityIndicator accessibilityLabel="Загрузка приглашений" color={colors.primary} />
      )}
      {!!error && (
        <>
          <Notice message={error} />
          <Button title="Повторить" secondary onPress={() => void reload()} />
        </>
      )}
      {!!actions.error && !editor && !created && <Notice message={actions.error} />}
      {!loading && !error && !rows.length && (
        <Text style={formStyles.muted}>Активных приглашений пока нет.</Text>
      )}
      {rows.map((item) => (
        <GroupPanel key={item.id}>
          <Text style={formStyles.muted}>Действует до {groupDate(item.expiresAt, zone)}</Text>
          <Text style={formStyles.muted}>
            Использований {item.uses} из {item.maxUses}
          </Text>
          {item.canRevoke && (
            <View style={formStyles.row}>
              <Button
                title="Отозвать"
                secondary
                disabled={actions.busy}
                onPress={() =>
                  void actions.run(async () => {
                    ensureSuccess(
                      await api.DELETE('/api/v1/groups/{groupId}/invitations/{id}', {
                        params: { path: { groupId, id: item.id } },
                      }),
                    );
                    await reload();
                  })
                }
              />
            </View>
          )}
        </GroupPanel>
      ))}
      <GroupPagination page={page} total={total} onChange={setPage} />
      {editor && (
        <Dialog title="Новое приглашение" visible onClose={() => setEditor(false)}>
          <Field
            label="Срок действия, часов (1–720)"
            value={hours}
            onChangeText={setHours}
            keyboardType="number-pad"
          />
          <Field
            label="Максимум вступлений (1–250)"
            value={maxUses}
            onChangeText={setMaxUses}
            keyboardType="number-pad"
          />
          {!!actions.error && <Notice message={actions.error} />}
          <Button
            title="Выпустить приглашение"
            busy={actions.busy}
            disabled={!valid}
            onPress={createInvite}
          />
        </Dialog>
      )}
      {created && (
        <Dialog title="Приглашение готово" visible onClose={() => setCreated(undefined)}>
          <Text style={formStyles.muted}>
            Сохраните код или ссылку. Они доступны только сейчас.
          </Text>
          <Field label="Код приглашения" value={created.code} editable={false} />
          <Field label="Ссылка приглашения" value={created.url} editable={false} />
          {!!actions.error && <Notice message={actions.error} />}
          <Button
            secondary
            title="Поделиться приглашением"
            onPress={() =>
              void actions.run(async () => {
                const content = `Присоединяйтесь к группе UniFlow. Код: ${created.code}\n${created.url}`;
                if (
                  typeof navigator !== 'undefined' &&
                  navigator.clipboard &&
                  typeof document !== 'undefined'
                )
                  await navigator.clipboard.writeText(content);
                else await Share.share({ message: content });
              })
            }
          />
        </Dialog>
      )}
    </View>
  );
}
