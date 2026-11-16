import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_TARGET = 10;
export const MAX_UPLOAD_BYTES_PER_USER = 100 * 1024 * 1024;

export const targetKinds = ['task', 'group-task', 'material'] as const;
export type TargetKind = (typeof targetKinds)[number];

const formats = [
  { mime: 'image/png', extension: 'png', prefix: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
  { mime: 'image/jpeg', extension: 'jpg', prefix: Buffer.from([255, 216, 255]) },
  { mime: 'application/pdf', extension: 'pdf', prefix: Buffer.from('%PDF-', 'ascii') },
] as const;

export type UploadedAttachment = { originalname: string; buffer: Buffer };

function detectFormat(content: Buffer): { mime: string; extension: string } {
  for (const format of formats) {
    if (content.subarray(0, format.prefix.length).equals(format.prefix)) return format;
  }

  if (
    content.length >= 20 &&
    content.toString('ascii', 0, 4) === 'RIFF' &&
    content.toString('ascii', 8, 12) === 'WEBP' &&
    content.readUInt32LE(4) + 8 === content.length &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(content.toString('ascii', 12, 16))
  ) {
    return { mime: 'image/webp', extension: 'webp' };
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(content);
    if (!/\p{Cc}/u.test(decoded.replace(/[\t\r\n]/g, ''))) {
      return { mime: 'text/plain', extension: 'txt' };
    }
  } catch {
    // A binary file outside the supported formats cannot be published as text.
  }
  throw new UnsupportedMediaTypeException('Поддерживаются PDF, TXT, JPEG, PNG и WebP.');
}

function safeFilename(originalName: string, extension: string) {
  const lastSegment = originalName.normalize('NFKC').split(/[\\/]/u).at(-1) ?? '';
  const stem = lastSegment
    .replace(/\.[^.]*$/u, '')
    .replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, '')
    .replace(/^\.+/u, '')
    .trim();
  return `${Array.from(stem).slice(0, 120).join('') || 'Файл'}.${extension}`;
}

export function validateAttachment(upload: UploadedAttachment | undefined, originalName?: string) {
  if (!upload?.buffer.length) throw new BadRequestException('Выберите непустой файл.');
  if (upload.buffer.length > MAX_FILE_BYTES)
    throw new PayloadTooLargeException('Максимальный размер файла — 10 МиБ.');
  const format = detectFormat(upload.buffer);
  const name = safeFilename(originalName ?? upload.originalname, format.extension);
  return { name, mimeType: format.mime, size: upload.buffer.length };
}

export function attachmentDisposition(name: string) {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const extension = name.match(/\.[a-z]+$/u)?.[0] ?? '.bin';
  return `attachment; filename="uniflow${extension}"; filename*=UTF-8''${encoded}`;
}
