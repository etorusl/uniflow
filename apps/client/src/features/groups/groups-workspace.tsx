import { Pager } from '../../shared/pager';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { Dialog } from '../../shared/dialog';
import { SelectField } from '../../shared/select-field';
import { EmptyState, pageStyles } from '../../shared/empty-state';
import { MaterialsWorkspace } from '../materials/materials-workspace';
import { TasksWorkspace } from '../tasks/tasks-workspace';
import { useAuth } from '../auth/auth-context';
import { loadSubjects, type Subject } from '../study/data';

type Group = components['schemas']['GroupDto'];
type Member = components['schemas']['MemberDto'];
type Invitation = components['schemas']['InvitationDto'];
type Secret = components['schemas']['InvitationSecretDto'];
const roles = { OWNER: 'Владелец', MODERATOR: 'Модератор', MEMBER: 'Участник' };

export function GroupsWorkspace() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ group?: string; invite?: string }>();
  const groupId = typeof params.group === 'string' ? params.group : '';
  const [groups, setGroups] = useState<Group[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Group | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [membersTotal, setMembersTotal] = useState(0),
    [membersPage, setMembersPage] = useState(1);
  const [subjects, setSubjects] = useState<Subject[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [invitationPage, setInvitationPage] = useState(1),
    [invitationTotal, setInvitationTotal] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [editor, setEditor] = useState<'create' | 'edit' | null>(null),
    [name, setName] = useState(''),
    [subjectName, setSubjectName] = useState(''),
    [description, setDescription] = useState('');
  const [code, setCode] = useState(params.invite ?? ''),
    [secret, setSecret] = useState<Secret | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    run: () => Promise<void>;
  } | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = resultData(
        await api.GET('/api/v1/groups', { params: { query: { page, limit: 10 } } }),
      );
      setGroups(list.items);
      setTotal(list.total);
      if (groupId) {
        const path = { groupId };
        const group = resultData(await api.GET('/api/v1/groups/{groupId}', { params: { path } }));
        setSelected(group);
        const [people, catalog] = await Promise.all([
          api
            .GET('/api/v1/groups/{groupId}/members', {
              params: { path, query: { page: membersPage, limit: 20 } },
            })
            .then(resultData),
          loadSubjects(),
        ]);
        setMembers(people.items);
        setMembersTotal(people.total);
        setSubjects(catalog);
        if (group.role !== 'MEMBER') {
          const inv = resultData(
            await api.GET('/api/v1/groups/{groupId}/invitations', {
              params: { path, query: { page: invitationPage, limit: 10 } },
            }),
          );
          setInvitations(inv.items);
          setInvitationTotal(inv.total);
        } else {
          setInvitations([]);
          setInvitationTotal(0);
        }
      } else {
        setSelected(null);
        setMembers([]);
        setSecret(null);
      }
    } catch (e) {
      setError(errorMessage(e));
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [groupId, page, membersPage, invitationPage]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (params.invite) setCode(params.invite);
  }, [params.invite]);
  async function mutate(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await reload();
      if (success) setMessage(success);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function open(group?: Group) {
    setName(group?.name ?? '');
    setSubjectName(group?.subjectName ?? '');
    setDescription(group?.description ?? '');
    setEditor(group ? 'edit' : 'create');
  }
  async function save() {
    const body = { name, subjectName, description };
    if (editor === 'edit')
      resultData(
        await api.PATCH('/api/v1/groups/{groupId}', { params: { path: { groupId } }, body }),
      );
    else {
      const group = resultData(await api.POST('/api/v1/groups', { body }));
      router.setParams({ group: group.id });
    }
    setEditor(null);
  }
  function confirmation(title: string, description: string, run: () => Promise<void>) {
    setConfirm({ title, description, run });
  }
  const path = { groupId };
  return (
    <>
      {!!error && <Notice message={error} />}
      {!!message && <Notice message={message} success />}
      <View style={formStyles.row}>
        <Button title="Создать группу" onPress={() => open()} disabled={busy} />
        {groupId && (
          <Button
            title="Все группы"
            secondary
            onPress={() => router.setParams({ group: undefined })}
          />
        )}
      </View>
      {!groupId && (
        <View style={formStyles.card}>
          <Text style={pageStyles.heading}>Вступить по приглашению</Text>
          <Field
            label="Код приглашения"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            maxLength={24}
          />
          <Text style={formStyles.muted}>
            Вы вступите в группу после нажатия кнопки. Код действует ограниченное время.
          </Text>
          <Button
            title="Вступить в группу"
            busy={busy}
            onPress={() =>
              void mutate(async () => {
                const g = resultData(
                  await api.POST('/api/v1/groups/join', { body: { code: code.trim() } }),
                );
                setCode('');
                router.setParams({ group: g.id, invite: undefined });
              })
            }
          />
        </View>
      )}
      {loading ? (
        <ActivityIndicator accessibilityLabel="Загрузка групп" />
      ) : selected ? (
        <>
          <View style={formStyles.card}>
            <Text accessibilityRole="header" style={pageStyles.heading}>
              {selected.name}
            </Text>
            <Text>
              {selected.subjectName} · {roles[selected.role]}
            </Text>
            {!!selected.description && <Text>{selected.description}</Text>}
            <SelectField
              label="Связать с моим предметом"
              value={selected.subjectId ?? ''}
              options={[
                { label: 'Без привязки', value: '' },
                ...subjects.map((s) => ({ label: s.name, value: s.id })),
              ]}
              onChange={(value) =>
                void mutate(async () => {
                  resultData(
                    await api.PATCH('/api/v1/groups/{groupId}/me/subject', {
                      params: { path },
                      body: { subjectId: value || null },
                    }),
                  );
                })
              }
            />
            <Text style={formStyles.muted}>Ваши предметы и преподаватели остаются личными.</Text>
            <View style={formStyles.row}>
              {selected.role === 'OWNER' ? (
                <>
                  <Button
                    title="Настройки группы"
                    secondary
                    onPress={() => open(selected)}
                    disabled={busy}
                  />
                  <Button
                    title="Архивировать группу"
                    secondary
                    disabled={busy}
                    onPress={() =>
                      confirmation(
                        'Архивировать группу?',
                        'Группа и её публикации станут недоступны всем участникам. Восстановление через приложение не предусмотрено.',
                        async () => {
                          ensureSuccess(
                            await api.DELETE('/api/v1/groups/{groupId}', { params: { path } }),
                          );
                          router.setParams({ group: undefined });
                        },
                      )
                    }
                  />
                </>
              ) : (
                <Button
                  title="Выйти из группы"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    confirmation(
                      'Выйти из группы?',
                      'Доступ к заданиям, материалам и файлам закроется.',
                      async () => {
                        ensureSuccess(
                          await api.POST('/api/v1/groups/{groupId}/leave', { params: { path } }),
                        );
                        router.setParams({ group: undefined });
                      },
                    )
                  }
                />
              )}
            </View>
          </View>
          <View style={formStyles.card}>
            <Text style={pageStyles.heading}>Участники ({membersTotal})</Text>
            {members.map((m) => (
              <View key={m.userId} style={{ gap: 8 }}>
                <Text>
                  {m.displayName} · {roles[m.role]}
                  {m.userId === user?.id ? ' · это вы' : ''}
                </Text>
                <View style={formStyles.row}>
                  {selected.role === 'OWNER' && m.role !== 'OWNER' && (
                    <>
                      <Button
                        secondary
                        disabled={busy}
                        title={
                          m.role === 'MODERATOR' ? 'Снять модератора' : 'Назначить модератором'
                        }
                        onPress={() =>
                          void mutate(async () => {
                            ensureSuccess(
                              await api.PATCH('/api/v1/groups/{groupId}/members/{userId}', {
                                params: { path: { groupId, userId: m.userId } },
                                body: { role: m.role === 'MODERATOR' ? 'MEMBER' : 'MODERATOR' },
                              }),
                            );
                          })
                        }
                      />
                      <Button
                        title="Передать владение"
                        secondary
                        disabled={busy}
                        onPress={() =>
                          confirmation(
                            'Передать владение?',
                            `${m.displayName} станет владельцем. Вы останетесь обычным участником.`,
                            async () => {
                              ensureSuccess(
                                await api.POST('/api/v1/groups/{groupId}/transfer-ownership', {
                                  params: { path },
                                  body: { userId: m.userId },
                                }),
                              );
                            },
                          )
                        }
                      />
                    </>
                  )}
                  {m.userId !== user?.id &&
                    m.role !== 'OWNER' &&
                    (selected.role === 'OWNER' ||
                      (selected.role === 'MODERATOR' && m.role === 'MEMBER')) && (
                      <Button
                        title="Исключить участника"
                        secondary
                        disabled={busy}
                        onPress={() =>
                          confirmation(
                            'Исключить участника?',
                            `${m.displayName} потеряет доступ и не сможет вернуться по приглашению.`,
                            async () => {
                              ensureSuccess(
                                await api.DELETE('/api/v1/groups/{groupId}/members/{userId}', {
                                  params: { path: { groupId, userId: m.userId } },
                                }),
                              );
                            },
                          )
                        }
                      />
                    )}
                </View>
              </View>
            ))}
            <Pager page={membersPage} total={membersTotal} limit={20} setPage={setMembersPage} />
          </View>
          <TasksWorkspace group={selected} />
          <MaterialsWorkspace groupId={selected.id} />
          {selected.role !== 'MEMBER' && (
            <View style={formStyles.card}>
              <Text style={pageStyles.heading}>Приглашения</Text>
              <Text style={formStyles.muted}>
                Новое приглашение действует 7 дней, до 20 вступлений. Код и ссылка показываются один
                раз.
              </Text>
              <Button
                title="Создать приглашение"
                busy={busy}
                onPress={() =>
                  void mutate(async () => {
                    setSecret(
                      resultData(
                        await api.POST('/api/v1/groups/{groupId}/invitations', {
                          params: { path },
                          body: { expiresInDays: 7, maxUses: 20 },
                        }),
                      ),
                    );
                  })
                }
              />
              {secret && (
                <View style={{ gap: 8 }}>
                  <Text selectable accessibilityLabel="Новый код приглашения">
                    {secret.code}
                  </Text>
                  <Text selectable accessibilityLabel="Ссылка приглашения">
                    {secret.url}
                  </Text>
                </View>
              )}
              {invitations.map((i) => (
                <View key={i.id} style={{ gap: 8 }}>
                  <Text>
                    {i.uses}/{i.maxUses} · до {new Date(i.expiresAt).toLocaleDateString()} ·{' '}
                    {i.revokedAt
                      ? 'Отозвано'
                      : new Date(i.expiresAt) <= new Date()
                        ? 'Истекло'
                        : 'Действует'}
                  </Text>
                  {!i.revokedAt && (
                    <Button
                      title="Отозвать приглашение"
                      secondary
                      disabled={busy}
                      onPress={() =>
                        void mutate(async () => {
                          ensureSuccess(
                            await api.DELETE('/api/v1/groups/{groupId}/invitations/{id}', {
                              params: { path: { groupId, id: i.id } },
                            }),
                          );
                          if (secret?.id === i.id) setSecret(null);
                        })
                      }
                    />
                  )}
                </View>
              ))}
              <Pager
                page={invitationPage}
                total={invitationTotal}
                limit={10}
                setPage={setInvitationPage}
              />
            </View>
          )}
        </>
      ) : (
        !groupId && (
          <>
            {!groups.length && (
              <EmptyState
                title="Пока нет групп"
                description="Создайте группу по предмету или вступите по приглашению."
                symbol="◎"
              />
            )}
            {groups.map((g) => (
              <View style={formStyles.card} key={g.id}>
                <Text style={pageStyles.heading}>{g.name}</Text>
                <Text>
                  {g.subjectName} · {roles[g.role]}
                </Text>
                <Button
                  title={`Открыть ${g.name}`}
                  secondary
                  onPress={() => {
                    setMembersPage(1);
                    setInvitationPage(1);
                    router.setParams({ group: g.id });
                  }}
                />
              </View>
            ))}
            <Pager page={page} total={total} limit={10} setPage={setPage} />
          </>
        )
      )}
      <Dialog
        title={editor === 'edit' ? 'Настройки группы' : 'Новая группа'}
        visible={!!editor}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
      >
        <Field label="Название группы" value={name} onChangeText={setName} maxLength={120} />
        <Field
          label="Предмет группы"
          value={subjectName}
          onChangeText={setSubjectName}
          maxLength={100}
        />
        <Field
          label="Описание группы"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={3000}
        />
        <Button title="Сохранить группу" busy={busy} onPress={() => void mutate(save)} />
      </Dialog>
      <Dialog
        title={confirm?.title ?? ''}
        visible={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
      >
        <Text>{confirm?.description}</Text>
        <Button
          title="Подтвердить"
          busy={busy}
          onPress={() => {
            if (confirm)
              void mutate(async () => {
                await confirm.run();
                setConfirm(null);
              });
          }}
        />
      </Dialog>
    </>
  );
}
