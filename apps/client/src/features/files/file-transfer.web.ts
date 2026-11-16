import { apiRequestHeaders } from '../../platform/api';
import {
  attachmentTypes,
  downloadUrl,
  photoTypes,
  responseError,
  uploadUrl,
  type Attachment,
  type AttachmentParent,
  type PickedAttachment,
  type TransferOptions,
} from './file-model';

export function pickAttachment(photo: boolean): Promise<PickedAttachment | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = (photo ? photoTypes : attachmentTypes).join(',');
    input.hidden = true;
    function close(file?: File) {
      input.remove();
      resolve(file ? { payload: file, name: file.name, size: file.size } : null);
    }
    input.addEventListener('change', () => close(input.files?.[0]), { once: true });
    input.addEventListener('cancel', () => close(), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export async function uploadAttachment(
  parent: AttachmentParent,
  picked: PickedAttachment,
  { signal, onProgress }: TransferOptions,
) {
  if (!(picked.payload instanceof File)) throw new Error('Не удалось прочитать выбранный файл.');
  const body = new FormData();
  body.append('file', picked.payload);
  const headers = await apiRequestHeaders('POST');
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const cancel = () => request.abort();
    request.open('POST', uploadUrl(parent));
    request.withCredentials = true;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = ({ lengthComputable, loaded, total }) => {
      if (lengthComputable && total) onProgress(Math.round((loaded / total) * 100));
    };
    request.onload = () =>
      request.status === 201
        ? resolve()
        : reject(responseError(request.responseText, request.status));
    request.onerror = () => reject(responseError('', 0));
    request.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    request.onloadend = () => signal.removeEventListener('abort', cancel);
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
    try {
      request.send(body);
    } catch (error) {
      signal.removeEventListener('abort', cancel);
      reject(error);
    }
  });
}

export async function downloadAttachment(
  attachment: Attachment,
  { signal, onProgress }: TransferOptions,
) {
  const response = await fetch(downloadUrl(attachment), {
    headers: await apiRequestHeaders('GET'),
    credentials: 'include',
    signal,
  });
  if (!response.ok) throw responseError(await response.text(), response.status);
  const blob = await response.blob();
  if (blob.size !== attachment.size) throw new Error('Файл скачан не полностью.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  onProgress(100);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
