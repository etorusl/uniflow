import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { Dialog } from '../../shared/dialog';
import { Pager } from '../../shared/pager';
import { pageStyles } from '../../shared/empty-state';
import { Attachments } from '../files/attachments';

type Material = components['schemas']['MaterialDto'];
export function MaterialsWorkspace({ groupId }: { groupId: string }) {
  const [items, setItems] = useState<Material[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [editor, setEditor] = useState<{ material?: Material } | null>(null),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [remove, setRemove] = useState<Material | null>(null);
  const load = useCallback(async () => {
    try {
      const data = resultData(
        await api.GET('/api/v1/groups/{groupId}/materials', {
          params: { path: { groupId }, query: { page, limit: 10 } },
        }),
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [groupId, page]);
  useEffect(() => {
    void load();
  }, [load]);
  function edit(material?: Material) {
    setEditor({ material });
    setTitle(material?.title ?? '');
    setBody(material?.body ?? '');
    setError('');
  }
  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const m = editor?.material;
    if (m)
      resultData(
        await api.PATCH('/api/v1/groups/{groupId}/materials/{id}', {
          params: { path: { groupId, id: m.id } },
          body: { title, body, version: m.version },
        }),
      );
    else
      resultData(
        await api.POST('/api/v1/groups/{groupId}/materials', {
          params: { path: { groupId } },
          body: { title, body },
        }),
      );
    setEditor(null);
  }
  return (
    <View style={{ gap: 16 }}>
      <Text style={pageStyles.heading}>Материалы группы</Text>
      <Text style={formStyles.muted}>
        Конспекты и полезные файлы. Публикации не считаются заданиями.
      </Text>
      <Button title="Опубликовать материал" onPress={() => edit()} disabled={busy} />
      {!!error && !editor && !remove && <Notice message={error} />}
      {!items.length && <Text style={formStyles.muted}>Материалов пока нет.</Text>}
      {items.map((m) => (
        <View key={m.id} testID={`material-${m.id}`} style={formStyles.card}>
          <Text style={pageStyles.heading}>{m.title}</Text>
          <Text>{m.body}</Text>
          <Attachments
            parentType="MATERIAL"
            parentId={m.id}
            canUpload={m.canEdit}
            canDelete={m.canDelete}
          />
          <View style={formStyles.row}>
            {m.canEdit && (
              <Button title="Изменить материал" secondary disabled={busy} onPress={() => edit(m)} />
            )}
            {m.canDelete && (
              <Button
                title="Удалить материал"
                secondary
                disabled={busy}
                onPress={() => setRemove(m)}
              />
            )}
          </View>
        </View>
      ))}
      <Pager page={page} total={total} limit={10} setPage={setPage} />
      <Dialog
        title={editor?.material ? 'Изменить материал' : 'Новый материал'}
        visible={!!editor}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
      >
        <Field label="Название материала" value={title} onChangeText={setTitle} maxLength={200} />
        <Field
          label="Текст материала"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={10000}
        />
        {!!error && <Notice message={error} />}
        <Button title="Сохранить материал" busy={busy} onPress={() => void mutate(save)} />
      </Dialog>
      <Dialog
        title="Удалить материал?"
        visible={!!remove}
        onClose={() => {
          if (!busy) setRemove(null);
        }}
      >
        <Text>{remove?.title}. Публикация и вложения станут недоступны.</Text>
        {!!error && <Notice message={error} />}
        <Button
          title="Подтвердить удаление материала"
          busy={busy}
          onPress={() => {
            if (remove)
              void mutate(async () => {
                ensureSuccess(
                  await api.DELETE('/api/v1/groups/{groupId}/materials/{id}', {
                    params: { path: { groupId, id: remove.id } },
                  }),
                );
                setRemove(null);
              });
          }}
        />
      </Dialog>
    </View>
  );
}
