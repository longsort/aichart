import { test, expect } from '@playwright/test';

async function siteLogin(page: import('@playwright/test').Page) {
  await page.goto('/');
  const accessBtn = page.getByRole('button', { name: '접속' });
  if (await accessBtn.isVisible().catch(() => false)) {
    await page.getByPlaceholder('aichart').fill('aichart');
    await page.getByPlaceholder('••••••••').fill('longshort');
    await accessBtn.click();
  }
  await expect(page.locator('.title')).toContainText(/AI 트레이더|분석 엔진/i, { timeout: 20000 });
}

test.describe('AI 트레이더 분석 엔진', () => {
  test('메인 페이지 로드', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1, .title')).toContainText(/AI 트레이더|분석 엔진/i);
  });

  test('심볼 선택 가능', async ({ page }) => {
    await siteLogin(page);
    const select = page.getByRole('combobox', { name: /심볼/ });
    await expect(select).toBeVisible();
    await select.selectOption('ETHUSDT');
    await expect(select).toHaveValue('ETHUSDT');
  });

  test('차트 영역 표시', async ({ page }) => {
    await siteLogin(page);
    await expect(page.locator('.tv-frame, .chart-wrap')).toBeVisible({ timeout: 10000 });
  });

  test('접근성 - 건너뛰기 링크', async ({ page }) => {
    await siteLogin(page);
    const skip = page.locator('.skip-link');
    await expect(skip).toBeAttached();
    await skip.focus();
    await expect(skip).toBeFocused();
  });
});
