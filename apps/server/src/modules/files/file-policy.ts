import { BadRequestException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const USER_QUOTA = 200 * 1024 * 1024;
export const GROUP_QUOTA = 500 * 1024 * 1024;
const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
export async function inspectFile(buffer: Buffer, originalName: string) {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES)
    throw new BadRequestException('Файл должен быть непустым и не больше 10 МБ.');
  // Multipart filenames use Latin-1 in Busboy; recover UTF-8 names when possible.
  if ([...originalName].every((c) => c.charCodeAt(0) <= 255)) {
    try {
      originalName = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.from(originalName, 'latin1'),
      );
    } catch {
      /* Already a Latin-1 filename. */
    }
  }
  const detected = await fileTypeFromBuffer(buffer).catch(() => undefined);
  let mimeType = detected?.mime;
  if (!mimeType) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new BadRequestException('Неподдерживаемый формат файла.');
    }
    if (
      [...text].some((c) => {
        const n = c.charCodeAt(0);
        return n < 32 && ![9, 10, 13].includes(n);
      }) ||
      /<\s*(?:!doctype|html|svg|script|\?xml)\b/i.test(text) ||
      !/\.txt$/i.test(originalName)
    )
      throw new BadRequestException('Разрешены PDF, JPEG, PNG, WebP и текст UTF-8 (.txt).');
    mimeType = 'text/plain';
  } else if (!allowed.has(mimeType))
    throw new BadRequestException('Разрешены PDF, JPEG, PNG, WebP и текст UTF-8 (.txt).');
  const filename =
    originalName
      .split(/[\\/]/)
      .at(-1)
      ?.split('')
      .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
      .join('')
      .trim()
      .slice(0, 160) || 'file';
  return { mimeType, filename };
}
