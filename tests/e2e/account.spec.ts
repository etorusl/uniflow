import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('register without email confirmation, keep the session and edit the profile', async ({
  page,
  context,
}) => {
  const email = `browser-${randomUUID()}@uniflow.local`;
  const password = 'Browser-test-password-2026!';
  try {
    await page.goto('/register');
    await page.getByLabel('Ваше имя', { exact: true }).fill('Тестовый студент');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль — не менее 12 символов').fill(password);
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Тестовый студент', exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name === 'uniflow_session');
    expect(cookie?.httpOnly).toBe(true);
    await page.reload();
    await page.getByRole('link', { name: 'Тестовый студент', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Мой профиль' })).toBeVisible();
    await page.getByLabel('Ваше имя', { exact: true }).fill('Обновлённый профиль');
    await page.getByRole('button', { name: 'Сохранить профиль' }).click();
    await expect(page.getByText('Профиль сохранён.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
    await expect(page.getByRole('link', { name: 'Войти', exact: true })).toBeVisible();
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Обновлённый профиль', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
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
