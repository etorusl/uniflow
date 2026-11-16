import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test('groups accept an invitation after registration and keep individual progress independent', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60_000);
  const visitor = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: page.viewportSize() ?? undefined,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
  });
  const second = await visitor.newPage();
  const emails = [
    `group-owner-${randomUUID()}@uniflow.local`,
    `group-member-${randomUUID()}@uniflow.local`,
  ];
  async function register(tab: Page, name: string, email: string) {
    await tab.getByLabel('Ваше имя', { exact: true }).fill(name);
    await tab.getByLabel('Email', { exact: true }).fill(email);
    await tab.getByLabel('Пароль — не менее 12 символов').fill('Groups-build-test-password-42!');
    await tab.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(tab.getByRole('link', { name, exact: true })).toBeVisible();
  }
  try {
    expect((await page.goto('/register'))?.ok(), 'registration page loads').toBe(true);
    await register(page, 'Автор группы', emails[0]!);
    await page.goto('/groups');
    await page.getByRole('button', { name: 'Новая группа', exact: true }).click();
    await page.getByLabel('Название группы').fill('Лаборатория');
    await page.getByLabel('Название предмета').fill('Физика');
    await page.getByRole('button', { name: 'Создать группу', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Лаборатория', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Добавить задание группы' }).click();
    await page.getByLabel('Название задания группы').fill('Сдать практикум');
    await page.getByRole('button', { name: 'Сохранить задание' }).click();
    await expect(page.getByRole('heading', { name: 'Сдать практикум', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Отметить выполненным', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Вернуть в работу', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Приглашения', exact: true }).click();
    await page.getByRole('button', { name: 'Создать приглашение', exact: true }).click();
    await page.getByRole('button', { name: 'Выпустить приглашение', exact: true }).click();
    const url = await page.getByLabel('Ссылка приглашения', { exact: true }).inputValue();
    expect((await second.goto(url))?.ok(), 'invitation opens the groups route').toBe(true);
    await second.getByRole('link', { name: 'Создать аккаунт', exact: true }).click();
    await register(second, 'Участник группы', emails[1]!);
    await second.getByRole('button', { name: 'Принять приглашение', exact: true }).click();
    await expect(second.getByRole('heading', { name: 'Лаборатория', exact: true })).toBeVisible();
    await expect(
      second.getByRole('heading', { name: 'Сдать практикум', exact: true }),
    ).toBeVisible();
    await expect(
      second.getByRole('button', { name: 'Отметить выполненным', exact: true }),
    ).toBeVisible();
    await second.getByRole('button', { name: 'Отметить выполненным', exact: true }).click();
    await expect(
      second.getByRole('heading', { name: 'Сдать практикум', exact: true }),
    ).not.toBeVisible();
    await second.getByRole('button', { name: 'Завершено', exact: true }).click();
    await expect(
      second.getByRole('button', { name: 'Вернуть в работу', exact: true }),
    ).toBeVisible();
  } finally {
    await visitor.close();
    const { DatabaseService } =
      await import('../../apps/server/dist/infrastructure/database.service.js');
    const { loadEnvironment, parseEnvironment } =
      await import('../../apps/server/dist/infrastructure/environment.js');
    loadEnvironment();
    const db = new DatabaseService(parseEnvironment(process.env));
    try {
      await db.studyGroup.deleteMany({ where: { owner: { email: { in: emails } } } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
    } finally {
      await db.$disconnect();
    }
  }
});
