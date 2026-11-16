import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('local reminder appears without a push provider and opens the personal task', async ({
  page,
}) => {
  const email = `reminder-${randomUUID()}@uniflow.local`;
  try {
    await page.goto('/register');
    await page.getByLabel('Ваше имя', { exact: true }).fill('Студент напоминаний');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль — не менее 12 символов').fill('Reminder-test-password!');
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ваш день, Студент напоминаний' }),
    ).toBeVisible();

    const api = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
    const cookies = await page.request.get(`${api}/api/v1/auth/session`);
    expect(cookies.ok()).toBe(true);
    const { csrfToken } = (await cookies.json()) as { csrfToken: string };
    const headers = { origin: 'http://localhost:8081', 'x-csrf-token': csrfToken };
    const settings = await page.request.patch(`${api}/api/v1/notifications/settings`, {
      headers,
      data: { enabled: true, minutesBefore: 60 },
    });
    expect(settings.ok()).toBe(true);
    const created = await page.request.post(`${api}/api/v1/tasks`, {
      headers,
      data: {
        title: 'Сдать демонстрационную работу',
        description: '',
        dueAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    });
    expect(created.ok()).toBe(true);
    const { id } = (await created.json()) as { id: string };

    await expect(page.getByRole('heading', { name: 'Напоминание о дедлайне' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('link', { name: 'Открыть задание', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/tasks\\?taskId=${id}`));
    await expect(page.getByText('Сдать демонстрационную работу', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Напоминание о дедлайне' })).toHaveCount(0);
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
