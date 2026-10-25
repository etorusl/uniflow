import { expect, test } from '@playwright/test';

test('navigation works on desktop and phone without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Учёба в одном ритме' })).toBeVisible();
  await expect(page.getByText('На связи', { exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: /Расписание/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Расписание', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Задания/ }).click();
  await expect(page.getByRole('heading', { name: 'Задания', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('connection failure is visible and can be retried', async ({ page }) => {
  await page.route('**/api/v1/health/ready', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Не удалось подключиться');
  await page.unroute('**/api/v1/health/ready');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByText('На связи', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
