import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('create a deadline, complete it, reopen it and inspect real statistics', async ({ page }) => {
  const email = `deadlines-${randomUUID()}@uniflow.local`;
  try {
    await page.goto('/register');
    await page.getByLabel('Ваше имя', { exact: true }).fill('Студент заданий');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль — не менее 12 символов').fill('Deadline-test-password!');
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ваш день, Студент заданий' })).toBeVisible();
    await page.getByRole('link', { name: /Добавить задание/ }).click();
    await page.getByLabel('Название задания').fill('Подготовить презентацию');
    await page.getByLabel('Описание', { exact: true }).fill('Собрать материалы и проверить выводы');
    await page.getByRole('button', { name: 'Сохранить задание' }).click();
    await expect(page.getByText('Подготовить презентацию', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Выполнить', exact: true }).click();
    await expect(page.getByLabel('Выполнено вовремя: 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Выполненные', exact: true }).click();
    await expect(page.getByText('Подготовить презентацию', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'История', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'История выполнения' })).toBeVisible();
    await page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'История выполнения' }) })
      .getByRole('button', { name: 'Закрыть', exact: true })
      .click();
    await page.getByRole('button', { name: 'Вернуть в работу', exact: true }).click();
    await expect(page.getByLabel('Выполнено вовремя: 0', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'В работе', exact: true }).click();
    await expect(page.getByText('Подготовить презентацию', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Подготовить презентацию', { exact: true })).toBeVisible();
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
