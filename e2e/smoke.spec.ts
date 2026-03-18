import { test, expect } from '@playwright/test';

test.describe('site smoke checks', () => {
  test('home page loads and shows key UI', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByPlaceholder('ROOM CODE')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
    await expect(page.getByText('Enter Your Name')).toBeVisible();
  });

  test('catalog shows production games', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Yahtzee' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hearts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Poker' })).toBeVisible();
  });
});
