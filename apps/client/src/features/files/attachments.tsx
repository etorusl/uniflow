import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Button, Notice, formStyles } from '../../shared/forms';
import { colors } from '../../shared/theme';
import {
  MAX_FILE_BYTES,
  type Attachment,
  type AttachmentParent,
  type PickedAttachment,
} from './file-model';
import { downloadAttachment, pickAttachment, uploadAttachment } from './file-transfer';

const transferTimeoutMs = 90_000;

function formatSize(size: number) {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} КиБ`;
  return `${(size / 1024 / 1024).toLocaleString('ru', { maximumFractionDigits: 1 })} МиБ`;
}

function discard(file?: PickedAttachment | null) {
  try {
    file?.discard?.();
  } catch {
    /* The platform also manages its temporary picker files. */
  }
}

export function AttachmentPanel({
  parent,
  canEdit,
}: {
  parent: AttachmentParent;
  canEdit: boolean;
}) {
  const { kind, id } = parent;
  const [items, setItems] = useState<Attachment[]>([]);
  const [retry, setRetry] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [removeFile, setRemoveFile] = useState<Attachment | null>(null);
  const mounted = useRef(false);
  const selected = useRef<PickedAttachment | null>(null);
  const transfer = useRef<AbortController | null>(null);
  const operating = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = resultData(
        await api.GET('/api/v1/files/targets/{kind}/{parentId}', {
          params: { path: { kind, parentId: id } },
        }),
      );
      if (mounted.current) setItems(data.items);
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [kind, id]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      transfer.current?.abort();
      discard(selected.current);
      selected.current = null;
    };
  }, [reload]);

  async function operate(action: () => Promise<void>) {
    if (operating.current) return;
    operating.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      operating.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function transferFile(
    action: (signal: AbortSignal, onProgress: (value: number) => void) => Promise<void>,
  ) {
    const controller = new AbortController();
    transfer.current = controller;
    setProgress(0);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, transferTimeoutMs);
    try {
      await action(controller.signal, (value) => {
        if (mounted.current) setProgress(Math.min(100, value));
      });
    } catch (error) {
      if (timedOut)
        throw new Error('Передача заняла слишком много времени. Попробуйте ещё раз.', {
          cause: error,
        });
      if (!controller.signal.aborted) throw error;
    } finally {
      clearTimeout(timer);
      transfer.current = null;
      if (mounted.current) setProgress(null);
    }
  }

  async function send(file: PickedAttachment) {
    selected.current = file;
    setRetry(false);
    try {
      await transferFile((signal, onProgress) =>
        uploadAttachment({ kind, id }, file, { signal, onProgress }),
      );
      discard(file);
      selected.current = null;
    } catch (error) {
      if (mounted.current) setRetry(true);
      throw error;
    } finally {
      if (mounted.current) await reload();
    }
  }

  async function choose(photo: boolean) {
    await operate(async () => {
      const file = await pickAttachment(photo);
      if (!file) return;
      if (!mounted.current) {
        discard(file);
        return;
      }
      discard(selected.current);
      selected.current = null;
      setRetry(false);
      if (!file.size || file.size > MAX_FILE_BYTES) {
        discard(file);
        throw new Error('Выберите непустой файл размером до 10 МиБ.');
      }
      await send(file);
    });
  }

  return (
    <View style={{ gap: 12 }}>
      {canEdit && (
        <>
          <Text style={formStyles.muted}>PDF, TXT, JPEG, PNG или WebP. До 10 МиБ на файл.</Text>
          <View style={formStyles.row}>
            <Button title="Добавить файл" disabled={busy} onPress={() => void choose(false)} />
            <Button
              title="Добавить фото"
              secondary
              disabled={busy}
              onPress={() => void choose(true)}
            />
          </View>
        </>
      )}
      {progress !== null && (
        <View style={formStyles.row}>
          <Text
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: progress }}
            style={formStyles.muted}
          >
            {progress < 100 ? `Передача ${progress}%` : 'Ожидание завершения'}
          </Text>
          <Button title="Отменить передачу" secondary onPress={() => transfer.current?.abort()} />
        </View>
      )}
      {!!error && <Notice message={error} />}
      {retry && canEdit && selected.current && (
        <Button
          title="Повторить загрузку"
          secondary
          disabled={busy}
          onPress={() => {
            const file = selected.current;
            if (file) void operate(() => send(file));
          }}
        />
      )}
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length ? (
        items.map((file) => (
          <View
            key={file.id}
            style={{ gap: 8, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 }}
          >
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{file.name}</Text>
            <Text style={formStyles.muted}>{formatSize(file.size)}</Text>
            <View style={formStyles.row}>
              <Button
                title={Platform.OS === 'web' ? 'Скачать' : 'Открыть файл'}
                secondary
                disabled={busy}
                onPress={() =>
                  void operate(() =>
                    transferFile((signal, onProgress) =>
                      downloadAttachment(file, { signal, onProgress }),
                    ),
                  )
                }
              />
              {canEdit && (
                <Button
                  title="Удалить файл"
                  secondary
                  disabled={busy}
                  onPress={() => setRemoveFile(file)}
                />
              )}
            </View>
            {removeFile?.id === file.id && (
              <View style={formStyles.row}>
                <Text style={formStyles.muted}>Удалить вложение?</Text>
                <Button
                  title="Подтвердить удаление"
                  disabled={busy}
                  onPress={() =>
                    void operate(async () => {
                      ensureSuccess(
                        await api.DELETE('/api/v1/files/{id}', {
                          params: { path: { id: file.id } },
                        }),
                      );
                      setRemoveFile(null);
                      await reload();
                    })
                  }
                />
                <Button
                  title="Отмена"
                  secondary
                  disabled={busy}
                  onPress={() => setRemoveFile(null)}
                />
              </View>
            )}
          </View>
        ))
      ) : (
        <Text style={formStyles.muted}>Вложений пока нет.</Text>
      )}
    </View>
  );
}
