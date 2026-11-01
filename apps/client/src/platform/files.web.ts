import * as DocumentPicker from 'expo-document-picker';

export async function pickFile(): Promise<{ blob: Blob; filename: string; size: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: false,
    type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'],
  });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  if (!asset.file) throw new Error('Не удалось прочитать выбранный файл.');
  return { blob: asset.file, filename: asset.name, size: asset.file.size };
}
export async function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
