import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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

export async function pickAttachment(photo: boolean): Promise<PickedAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: photo ? photoTypes : attachmentTypes,
    copyToCacheDirectory: true,
  });
  const asset = result.assets?.[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  return {
    name: asset.name,
    size: asset.size ?? file.size,
    payload: { uri: asset.uri, mimeType: asset.mimeType ?? 'application/octet-stream' },
    discard: () => {
      if (file.exists) file.delete();
    },
  };
}

export async function uploadAttachment(
  parent: AttachmentParent,
  picked: PickedAttachment,
  { signal, onProgress }: TransferOptions,
) {
  if (!('uri' in picked.payload)) throw new Error('Не удалось прочитать выбранный файл.');
  const headers = await apiRequestHeaders('POST');
  const file = new File(picked.payload.uri);
  const task = file.createUploadTask(uploadUrl(parent), {
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    mimeType: picked.payload.mimeType,
    headers,
    parameters: { name: picked.name.slice(0, 240) },
    signal,
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress(Math.round((bytesSent / totalBytes) * 100));
    },
  });
  const result = await task.uploadAsync();
  if (result.status !== 201) throw responseError(result.body, result.status);
}

export async function downloadAttachment(
  attachment: Attachment,
  { signal, onProgress }: TransferOptions,
) {
  const headers = await apiRequestHeaders('GET');
  const directory = new Directory(Paths.cache, 'uniflow-attachments', attachment.id);
  directory.create({ intermediates: true, idempotent: true });
  const output = new File(directory, attachment.name);
  try {
    const file = await File.downloadFileAsync(downloadUrl(attachment), output, {
      headers,
      signal,
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) onProgress(Math.round((bytesWritten / totalBytes) * 100));
      },
    });
    if (file.size !== attachment.size) throw new Error('Файл скачан не полностью.');
    if (await File.canPreview(file, { mimeType: attachment.mimeType })) {
      await File.preview(file, { mimeType: attachment.mimeType, title: attachment.name });
    } else if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: attachment.mimeType });
    } else {
      throw new Error('На устройстве нет приложения для открытия этого файла.');
    }
  } catch (error) {
    if (output.exists) output.delete();
    throw error;
  }
}
