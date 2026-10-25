import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('build a personal timetable and cancel one class', async ({ page }) => {
  const email = `study-${randomUUID()}@uniflow.local`;
  try {
    await page.goto('/register');
    await page.getByLabel('Ваше имя', { exact: true }).fill('Студент расписания');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль — не менее 12 символов').fill('Study-test-password-2026!');
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Студент расписания', exact: true })).toBeVisible();
    await page.goto('/subjects');
    await page.getByRole('button', { name: 'Добавить предмет', exact: true }).click();
    await page.getByLabel('Название / имя', { exact: true }).fill('Тестовая математика');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Тестовая математика', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Преподаватели', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить преподавателя', exact: true }).click();
    await page.getByLabel('Название / имя', { exact: true }).fill('Тестовый преподаватель');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Тестовый преподаватель', { exact: true })).toBeVisible();
    await page.goto('/schedule');
    await page.getByRole('button', { name: 'Добавить семестр', exact: true }).click();
    const start = new Date(Date.now() - 60 * 86400000),
      end = new Date(Date.now() + 120 * 86400000);
    const monday = new Date(start);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    await page.getByLabel('Название семестра').fill('Тестовый семестр');
    await page.getByLabel('Начало семестра (ГГГГ-ММ-ДД)').fill(start.toISOString().slice(0, 10));
    await page.getByLabel('Конец семестра (ГГГГ-ММ-ДД)').fill(end.toISOString().slice(0, 10));
    await page
      .getByLabel('Понедельник первой учебной недели')
      .fill(monday.toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Сохранить семестр' }).click();
    await page.getByRole('button', { name: 'Добавить пару', exact: true }).click();
    await page.getByRole('button', { name: 'Преподаватель', exact: true }).click();
    await page.getByRole('button', { name: 'Тестовый преподаватель', exact: true }).click();
    await page.getByLabel('Аудитория', { exact: true }).fill('201');
    await page.getByRole('button', { name: 'Сохранить пару' }).click();
    await page.getByRole('button', { name: 'Неделя', exact: true }).click();
    await expect(page.getByText('Тестовая математика', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(page.getByText('Отменено', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await expect(page.getByText('Отменено', { exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Неделя', exact: true }).click();
    await expect(page.getByText('Тестовая математика', { exact: true })).toBeVisible();
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
      await database.scheduleEntry.deleteMany({ where: { user: { email } } });
      await database.user.deleteMany({ where: { email } });
    } finally {
      await database.$disconnect();
    }
  }
});
