import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function pickFile(): Promise<{
  blob: Blob;
  filename: string;
  size: number;
  cleanup?: () => void;
} | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'],
  });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  const source = new File(asset.uri);
  const directory = new Directory(
    Paths.cache,
    `uniflow-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  directory.create();
  // Native FormData uses File.name, even when append receives a third filename argument.
  const file = new File(directory, asset.name.replace(/[\\/]/g, '_'));
  try {
    await source.copy(file);
  } catch {
    directory.delete();
    throw new Error('Не удалось подготовить выбранный файл. Попробуйте ещё раз.');
  }
  return {
    blob: file,
    filename: asset.name,
    size: file.size,
    cleanup: () => {
      try {
        directory.delete();
      } catch {
        /* Already removed. */
      }
      if (source.uri.startsWith(Paths.cache.uri)) {
        try {
          source.delete();
        } catch {
          /* Picker cache may already be gone. */
        }
      }
    },
  };
}
export async function saveFile(blob: Blob, filename: string, mimeType: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('На устройстве недоступно открытие файлов.');
  const safe = filename.replace(/[\\/]/g, '_');
  const file = new File(Paths.cache, `uniflow-${Date.now()}-${safe}`);
  await file.write(new Uint8Array(await blob.arrayBuffer()));
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
