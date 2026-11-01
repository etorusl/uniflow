import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectFile, MAX_FILE_BYTES } from '../../dist/modules/files/file-policy.js';

test('file types use content, bounded size and safe filenames', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZQAAAABJRU5ErkJggg==',
    'base64',
  );
  assert.deepEqual(await inspectFile(png, '../../photo.png'), {
    mimeType: 'image/png',
    filename: 'photo.png',
  });
  assert.equal(
    (await inspectFile(Buffer.from('Конспект\nПервая глава'), 'конспект.txt')).mimeType,
    'text/plain',
  );
  for (const [bytes, name] of [
    [Buffer.alloc(0), 'empty.txt'],
    [Buffer.alloc(MAX_FILE_BYTES + 1), 'huge.pdf'],
    [Buffer.from('<html>script</html>'), 'bad.txt'],
    [Buffer.from('fake image'), 'fake.jpg'],
    [Buffer.from([0, 1, 2]), 'bad.txt'],
  ])
    await assert.rejects(inspectFile(bytes, name));
});
