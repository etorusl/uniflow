import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('recover a password through local mail and discard the revoked session', async ({ page }) => {
  const email = `recovery-${randomUUID()}@uniflow.local`;
  try {
    await page.goto('/register');
    await page.getByLabel('Ваше имя', { exact: true }).fill('Студент восстановления');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль — не менее 12 символов').fill('Original-test-password!');
    await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ваш день, Студент восстановления' }),
    ).toBeVisible();
    await page.goto('/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Отправить письмо' }).click();
    await expect(
      page.getByText('Если аккаунт существует, письмо для восстановления будет отправлено.'),
    ).toBeVisible();
    let token: string | undefined;
    await expect
      .poll(
        async () => {
          const search = await fetch(
            `http://127.0.0.1:${process.env.MAILPIT_PORT ?? '8025'}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          ).then((response) => response.json());
          if (!search.messages?.[0]?.ID) return false;
          const message = await fetch(
            `http://127.0.0.1:${process.env.MAILPIT_PORT ?? '8025'}/api/v1/message/${search.messages[0].ID}`,
          ).then((response) => response.json());
          token = message.Text?.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)?.[1];
          return !!token;
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel('Пароль — не менее 12 символов').fill('Recovered-test-password!');
    await page.getByRole('button', { name: 'Сохранить пароль' }).click();
    await expect(page.getByText('Пароль изменён. Войдите с новым паролем.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Войти', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Вход', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill('Recovered-test-password!');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Ваш день, Студент восстановления' }),
    ).toBeVisible();
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
