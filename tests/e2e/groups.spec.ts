import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('create a closed group and join through a preserved invitation after registration', async ({
  page,
  browser,
}) => {
  const suffix = randomUUID(),
    emails = [`group-owner-${suffix}@uniflow.local`, `group-member-${suffix}@uniflow.local`];
  const guest = await browser.newContext({
    baseURL: 'http://localhost:8081',
    viewport: page.viewportSize() ?? undefined,
  });
  const member = await guest.newPage();
  async function register(target: typeof page, email: string, name: string) {
    await target.getByLabel('Ваше имя', { exact: true }).fill(name);
    await target.getByLabel('Email', { exact: true }).fill(email);
    await target.getByLabel('Пароль — не менее 12 символов').fill('Group-browser-password!');
    await target.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  }
  try {
    await page.goto('/register');
    await register(page, emails[0]!, 'Владелец группы');
    await expect(page.getByRole('heading', { name: 'Ваш день, Владелец группы' })).toBeVisible();
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Создать группу', exact: true }).click();
    await page.getByLabel('Название группы', { exact: true }).fill('Учебная команда');
    await page.getByLabel('Предмет группы', { exact: true }).fill('Алгебра');
    await page.getByRole('button', { name: 'Сохранить группу', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Учебная команда', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
    const code = (await page.getByLabel('Новый код приглашения', { exact: true }).textContent())!;
    await member.goto(`/groups?invite=${code}`);
    await member.getByRole('link', { name: 'Создать аккаунт', exact: true }).click();
    await register(member, emails[1]!, 'Новый участник');
    await expect(member.getByLabel('Код приглашения', { exact: true })).toHaveValue(code);
    await expect(member.getByRole('heading', { name: 'Учебная команда', exact: true })).toHaveCount(
      0,
    );
    await member.getByRole('button', { name: 'Вступить в группу', exact: true }).click();
    await expect(
      member.getByRole('heading', { name: 'Учебная команда', exact: true }),
    ).toBeVisible();
    await expect(
      member.getByRole('button', { name: 'Создать приглашение', exact: true }),
    ).toHaveCount(0);
    await member.reload();
    await expect(
      member.getByRole('heading', { name: 'Учебная команда', exact: true }),
    ).toBeVisible();
    await member.getByRole('button', { name: 'Выйти из группы', exact: true }).click();
    await member.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await expect(member.getByText('Пока нет групп', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Участники (1)', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await guest.close();
    const { DatabaseService } =
      await import('../../apps/server/dist/infrastructure/database.service.js');
    const { loadEnvironment, parseEnvironment } =
      await import('../../apps/server/dist/infrastructure/environment.js');
    loadEnvironment();
    const db = new DatabaseService(parseEnvironment(process.env));
    try {
      const users = await db.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      await db.group.deleteMany({ where: { ownerId: { in: users.map((u) => u.id) } } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
    } finally {
      await db.$disconnect();
    }
  }
});
