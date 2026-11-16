import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Dialog } from '../../shared/dialog';
import { pageStyles } from '../../shared/empty-state';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { colors } from '../../shared/theme';
import { AttachmentPanel } from './attachments';

type Material = components['schemas']['GroupMaterialDto'];
const pageSize = 20;

export function GroupMaterials({
  groupId,
  viewerId,
  role,
}: {
  groupId: string;
  viewerId: string;
  role: 'OWNER' | 'MODERATOR' | 'MEMBER';
}) {
  const [items, setItems] = useState<Material[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [remove, setRemove] = useState<Material | null>(null);
  const [attachments, setAttachments] = useState<Material | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = resultData(
        await api.GET('/api/v1/groups/{groupId}/materials', {
          params: { path: { groupId }, query: { page, limit: pageSize } },
        }),
      );
      setItems(data.items);
      setTotal(data.total);
      const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
      if (page > lastPage) setPage(lastPage);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [groupId, page]);

  useEffect(() => {
    setError('');
    void reload();
  }, [reload]);

  function edit(material?: Material) {
    setError('');
    setTitle(material?.title ?? '');
    setDescription(material?.description ?? '');
    setEditor({ id: material?.id });
  }

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!editor) return;
    const body = { title, description };
    await mutate(async () => {
      const result = editor.id
        ? await api.PATCH('/api/v1/groups/{groupId}/materials/{id}', {
            params: { path: { groupId, id: editor.id } },
            body,
          })
        : await api.POST('/api/v1/groups/{groupId}/materials', {
            params: { path: { groupId } },
            body,
          });
      const saved = resultData(result);
      setEditor(null);
      if (!editor.id) {
        setAttachments(saved);
        if (page !== 1) {
          setPage(1);
          return;
        }
      }
      await reload();
    });
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={formStyles.row}>
        <Text accessibilityRole="header" style={[pageStyles.heading, { flex: 1, marginBottom: 0 }]}>
          Материалы группы
        </Text>
        <Button title="Добавить материал" onPress={() => edit()} />
      </View>
      {!!error && !editor && !remove && <Notice message={error} />}
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : !items.length ? (
        <Text style={formStyles.muted}>Материалов пока нет.</Text>
      ) : (
        items.map((material) => (
          <View key={material.id} style={formStyles.card}>
            <Text style={pageStyles.heading}>{material.title}</Text>
            {material.authorName && <Text style={formStyles.muted}>{material.authorName}</Text>}
            {!!material.description && (
              <Text style={{ color: colors.ink, lineHeight: 23 }}>{material.description}</Text>
            )}
            <View style={formStyles.row}>
              <Button
                title={`Вложения (${material.attachmentCount})`}
                secondary
                onPress={() => setAttachments(material)}
              />
              {material.authorId === viewerId && (
                <Button title="Изменить материал" secondary onPress={() => edit(material)} />
              )}
              {(material.authorId === viewerId || role !== 'MEMBER') && (
                <Button
                  title="Удалить материал"
                  secondary
                  onPress={() => {
                    setError('');
                    setRemove(material);
                  }}
                />
              )}
            </View>
          </View>
        ))
      )}
      {total > pageSize && (
        <View style={formStyles.row}>
          <Button
            title="← Назад"
            secondary
            disabled={page === 1 || loading}
            onPress={() => setPage(page - 1)}
          />
          <Text style={formStyles.muted}>
            Страница {page} из {Math.ceil(total / pageSize)}
          </Text>
          <Button
            title="Дальше →"
            secondary
            disabled={page * pageSize >= total || loading}
            onPress={() => setPage(page + 1)}
          />
        </View>
      )}
      {editor && (
        <Dialog
          title={editor.id ? 'Изменить материал' : 'Новый материал'}
          visible
          onClose={() => setEditor(null)}
        >
          <Field label="Название материала" value={title} onChangeText={setTitle} maxLength={200} />
          <Field
            label="Описание материала"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={10000}
          />
          {!!error && <Notice message={error} />}
          <Button title="Сохранить материал" busy={busy} onPress={() => void save()} />
        </Dialog>
      )}
      {remove && (
        <Dialog title="Удалить материал?" visible onClose={() => setRemove(null)}>
          <Text style={formStyles.muted}>{remove.title}</Text>
          {!!error && <Notice message={error} />}
          <Button
            title="Подтвердить удаление"
            busy={busy}
            onPress={() =>
              void mutate(async () => {
                ensureSuccess(
                  await api.DELETE('/api/v1/groups/{groupId}/materials/{id}', {
                    params: { path: { groupId, id: remove.id } },
                  }),
                );
                setRemove(null);
                await reload();
              })
            }
          />
        </Dialog>
      )}
      {attachments && (
        <Dialog
          title={`Вложения · ${attachments.title}`}
          visible
          onClose={() => {
            setAttachments(null);
            void reload();
          }}
        >
          <AttachmentPanel
            parent={{ kind: 'material', id: attachments.id }}
            canEdit={attachments.authorId === viewerId}
          />
        </Dialog>
      )}
    </View>
  );
}
