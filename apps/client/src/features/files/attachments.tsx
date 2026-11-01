import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { api, uploadApi, resultData, ensureSuccess, errorMessage } from '../../platform/api';
import { pickFile, saveFile } from '../../platform/files';
import { Button, Notice, formStyles } from '../../shared/forms';
import { Dialog } from '../../shared/dialog';

type Attachment = components['schemas']['AttachmentDto'];
type Parent = { parentType: 'PERSONAL_TASK' | 'GROUP_TASK' | 'MATERIAL'; parentId: string };
export function Attachments({
  parentType,
  parentId,
  canUpload,
  canDelete,
}: Parent & { canUpload: boolean; canDelete: boolean }) {
  const [expanded, setExpanded] = useState(false),
    [files, setFiles] = useState<Attachment[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [remove, setRemove] = useState<Attachment | null>(null);
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      setFiles(
        resultData(
          await api.GET('/api/v1/files', {
            params: { query: { parentType, parentId, limit: 100, page: 1 } },
          }),
        ).items,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [parentType, parentId]);
  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);
  useEffect(() => () => pending.current?.abort(), []);
  async function upload() {
    let cleanup: (() => void) | undefined;
    setError('');
    try {
      const selected = await pickFile();
      if (!selected) return;
      cleanup = selected.cleanup;
      if (selected.size <= 0 || selected.size > 10 * 1024 * 1024)
        throw new Error('Файл должен быть непустым и не больше 10 МБ.');
      setBusy(true);
      const controller = new AbortController();
      pending.current = controller;
      const form = new FormData();
      form.append('parentType', parentType);
      form.append('parentId', parentId);
      form.append('file', selected.blob, selected.filename);
      resultData(
        await uploadApi.POST('/api/v1/files', {
          body: { parentType, parentId, file: '' },
          bodySerializer: () => form,
          signal: controller.signal,
        }),
      );
      await load();
    } catch (e) {
      setError(
        pending.current?.signal.aborted
          ? 'Загрузка отменена. Обновите список перед повторной попыткой: сервер мог уже сохранить файл.'
          : errorMessage(e),
      );
    } finally {
      cleanup?.();
      pending.current = null;
      setBusy(false);
    }
  }
  async function download(file: Attachment) {
    setBusy(true);
    setError('');
    try {
      const bytes = resultData(
        await api.GET('/api/v1/files/{id}/content', {
          params: { path: { id: file.id } },
          parseAs: 'arrayBuffer',
        }),
      );
      await saveFile(bytes, file.filename, file.mimeType);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirmRemove() {
    if (!remove) return;
    setBusy(true);
    setError('');
    try {
      ensureSuccess(
        await api.DELETE('/api/v1/files/{id}', { params: { path: { id: remove.id } } }),
      );
      setRemove(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      <Button
        title={expanded ? 'Скрыть файлы' : 'Файлы и фотографии'}
        secondary
        onPress={() => setExpanded(!expanded)}
        disabled={busy}
      />
      {expanded && (
        <>
          <Text style={formStyles.muted}>
            PDF, JPEG, PNG, WebP и UTF-8 .txt · до 10 МБ · до 10 файлов. Квота: 200 МБ на
            пользователя, 500 МБ на группу.
          </Text>
          {files.map((f) => (
            <View key={f.id} style={{ gap: 8 }}>
              <Text>
                {f.filename} · {Math.ceil(f.byteSize / 1024)} КБ
              </Text>
              <View style={formStyles.row}>
                <Button
                  title={`Скачать ${f.filename}`}
                  secondary
                  disabled={busy}
                  onPress={() => void download(f)}
                />
                {canDelete && (
                  <Button
                    title={`Удалить ${f.filename}`}
                    secondary
                    disabled={busy}
                    onPress={() => setRemove(f)}
                  />
                )}
              </View>
            </View>
          ))}
          {!files.length && <Text style={formStyles.muted}>Файлов пока нет.</Text>}
          {canUpload && (
            <Button
              title="Прикрепить файл или фото"
              busy={busy}
              disabled={files.length >= 10}
              onPress={() => void upload()}
            />
          )}
          {!!pending.current && busy && (
            <Button title="Отменить загрузку" secondary onPress={() => pending.current?.abort()} />
          )}
          <Button title="Обновить файлы" secondary disabled={busy} onPress={() => void load()} />
          {!!error && <Notice message={error} />}
        </>
      )}
      <Dialog
        title="Удалить файл?"
        visible={!!remove}
        onClose={() => {
          if (!busy) setRemove(null);
        }}
      >
        <Text>{remove?.filename}. Файл станет недоступен участникам публикации.</Text>
        {!!error && <Notice message={error} />}
        <Button title="Удалить файл" busy={busy} onPress={() => void confirmRemove()} />
      </Dialog>
    </View>
  );
}
