import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('attach and download real files for a personal task, group task and material', async ({
  page,
}) => {
  const email = `files-${randomUUID()}@uniflow.local`;
  const notes = Buffer.from('Lecture notes: chapter one.');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZQAAAABJRU5ErkJggg==',
    'base64',
  );
  async function attach(
    card: ReturnType<typeof page.getByTestId>,
    name: string,
    bytes = notes,
    mimeType = 'text/plain',
  ) {
    await card.getByRole('button', { name: 'Файлы и фотографии', exact: true }).click();
    const choosing = page.waitForEvent('filechooser');
    await card.getByRole('button', { name: 'Прикрепить файл или фото', exact: true }).click();
    await (await choosing).setFiles({ name, mimeType, buffer: bytes });
    await expect(card.getByRole('button', { name: `Скачать ${name}`, exact: true })).toBeVisible();
  }
  try {
    await page.goto('/register');
    await page.getByLabel('Ваше имя', { exact: true }).fill('Студент файлов');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль — не менее 12 символов').fill('Files-browser-password!');
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ваш день, Студент файлов' })).toBeVisible();
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'Добавить задание', exact: true }).click();
    await page.getByLabel('Название задания', { exact: true }).fill('Личный конспект');
    await page.getByRole('button', { name: 'Сохранить задание', exact: true }).click();
    const personal = page
      .getByTestId(/^task-/)
      .filter({ has: page.getByText('Личный конспект', { exact: true }) });
    await attach(personal, 'notes.txt');
    const downloading = page.waitForEvent('download');
    await personal.getByRole('button', { name: 'Скачать notes.txt', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('notes.txt');
    expect(await readFile((await download.path())!)).toEqual(notes);
    await page.reload();
    await personal.getByRole('button', { name: 'Файлы и фотографии', exact: true }).click();
    await expect(
      personal.getByRole('button', { name: 'Скачать notes.txt', exact: true }),
    ).toBeVisible();
    await personal.getByRole('button', { name: 'Удалить notes.txt', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить файл', exact: true }).click();
    await expect(
      personal.getByRole('button', { name: 'Скачать notes.txt', exact: true }),
    ).toHaveCount(0);
    const session = await page.request
      .get('http://localhost:3000/api/v1/auth/session')
      .then((r) => r.json());
    const headers = { origin: 'http://localhost:8081', 'x-csrf-token': session.csrfToken };
    const group = await page.request
      .post('http://localhost:3000/api/v1/groups', {
        headers,
        data: { name: 'Файловая группа', subjectName: 'История', description: '' },
      })
      .then((r) => r.json());
    await page.request.post(`http://localhost:3000/api/v1/groups/${group.id}/tasks`, {
      headers,
      data: {
        title: 'Доклад с фото',
        description: '',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        mode: 'SHARED',
      },
    });
    await page.goto(`/groups?group=${group.id}`);
    const shared = page
      .getByTestId(/^task-/)
      .filter({ has: page.getByText('Доклад с фото', { exact: true }) });
    await attach(shared, 'photo.png', png, 'image/png');
    await page.getByRole('button', { name: 'Опубликовать материал', exact: true }).click();
    await page.getByLabel('Название материала', { exact: true }).fill('Лекция');
    await page.getByLabel('Текст материала', { exact: true }).fill('Материалы для подготовки');
    await page.getByRole('button', { name: 'Сохранить материал', exact: true }).click();
    const material = page
      .getByTestId(/^material-/)
      .filter({ has: page.getByText('Лекция', { exact: true }) });
    await attach(material, 'лекция.txt');
    await expect(page.getByLabel('Всего заданий: 1', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Материалы для подготовки', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    const { createApi } = await import('../../apps/server/dist/api.js');
    const { DatabaseService } =
      await import('../../apps/server/dist/infrastructure/database.service.js');
    const { FilesService } = await import('../../apps/server/dist/modules/files/files.service.js');
    const app = await createApi({ quiet: true });
    await app.init();
    const db = app.get(DatabaseService);
    try {
      const users = await db.user.findMany({ where: { email }, select: { id: true } });
      await db.group.deleteMany({ where: { ownerId: { in: users.map((u) => u.id) } } });
      await db.user.deleteMany({ where: { email } });
      await app.get(FilesService).cleanup();
    } finally {
      await app.close();
    }
  }
});
