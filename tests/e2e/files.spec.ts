import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('attach, download and delete a private file through the task card', async ({ page }) => {
  const email = `file-${randomUUID()}@uniflow.local`;
  try {
    await page.goto('/register');
    await page.getByLabel('Ваше имя', { exact: true }).fill('Студент с файлами');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль — не менее 12 символов').fill('Attachment-test-password!');
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ваш день, Студент с файлами' })).toBeVisible();
    await page.getByRole('link', { name: /Добавить задание/ }).click();
    await page.getByLabel('Название задания').fill('Подготовить конспект');
    await page.getByRole('button', { name: 'Сохранить задание' }).click();
    await page.getByRole('button', { name: 'Вложения', exact: true }).click();
    const panel = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Вложения · Подготовить конспект' }) });
    const chooserPromise = page.waitForEvent('filechooser');
    await panel.getByRole('button', { name: 'Добавить файл', exact: true }).click();
    const chooser = await chooserPromise;
    const bytes = Buffer.from('Файл для сквозного теста\n');
    await chooser.setFiles({ name: 'Конспект.txt', mimeType: 'text/plain', buffer: bytes });
    await expect(panel.getByText('Конспект.txt', { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Скачать', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Конспект.txt');
    const stream = await download.createReadStream();
    const result: Buffer[] = [];
    for await (const chunk of stream) result.push(Buffer.from(chunk));
    expect(Buffer.concat(result)).toEqual(bytes);
    await panel.getByRole('button', { name: 'Удалить файл', exact: true }).click();
    await panel.getByRole('button', { name: 'Подтвердить удаление', exact: true }).click();
    await expect(panel.getByText('Вложений пока нет.')).toBeVisible();
  } finally {
    const { DatabaseService } =
      await import('../../apps/server/dist/infrastructure/database.service.js');
    const { loadEnvironment, parseEnvironment } =
      await import('../../apps/server/dist/infrastructure/environment.js');
    loadEnvironment();
    const database = new DatabaseService(parseEnvironment(process.env));
    try {
      await database.user.deleteMany({ where: { email } });
    } finally {
      await database.$disconnect();
    }
  }
});
