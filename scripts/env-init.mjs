import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../.env', import.meta.url);
const replacements = {
  'replace-local-database-password': randomBytes(24).toString('hex'),
  'replace-local-access-key': randomBytes(12).toString('hex'),
  'replace-local-secret-key': randomBytes(24).toString('hex'),
};
let content = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
for (const [placeholder, value] of Object.entries(replacements))
  content = content.replaceAll(placeholder, value);
try {
  await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with unique local credentials.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; existing settings were preserved.');
}
