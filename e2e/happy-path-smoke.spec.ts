import { test, expect } from '@playwright/test';

/** Requires Expo web running (default baseURL http://localhost:8082 in playwright.config). */
test.describe('Snippd web smoke (launch gate)', () => {
  test('shell loads without blank document', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});
