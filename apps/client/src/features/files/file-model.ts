import type { components } from '@uniflow/api-client';
import { apiBaseUrl } from '../../platform/api';

export type Attachment = components['schemas']['AttachmentDto'];
export type AttachmentParent = { kind: 'task' | 'group-task' | 'material'; id: string };

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const attachmentTypes = [...photoTypes, 'application/pdf', 'text/plain'];

export type PickedAttachment = {
  name: string;
  size: number;
  payload: File | { uri: string; mimeType: string };
  discard?: () => void;
};

export type TransferOptions = { signal: AbortSignal; onProgress: (percent: number) => void };

export function uploadUrl(parent: AttachmentParent) {
  return `${apiBaseUrl}/api/v1/files/targets/${parent.kind}/${encodeURIComponent(parent.id)}`;
}

export function downloadUrl(attachment: Attachment) {
  return `${apiBaseUrl}/api/v1/files/${encodeURIComponent(attachment.id)}/content`;
}

export function responseError(body: string, status: number) {
  try {
    const error = JSON.parse(body) as { error?: { message?: unknown } };
    if (typeof error.error?.message === 'string') return new Error(error.error.message);
  } catch {
    // A proxy or offline page may return non-JSON content.
  }
  if (status === 413) return new Error('Максимальный размер файла — 10 МиБ.');
  return new Error('Файл не удалось передать. Проверьте соединение и повторите попытку.');
}
