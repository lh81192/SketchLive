const { test, expect } = require('playwright/test');

test('epub ui regression', async ({ page, context, browserName }) => {
  const projectId = '01KMQ06TK09SDYY1HBY4VDVRCJ';
  const userId = 'ui-regression-user';
  const fixture = '/tmp/SketchLive-smoke/smoke.epub';

  test.skip(browserName !== 'chromium', 'Only run in chromium');

  await page.addInitScript((uid) => {
    localStorage.setItem('sketch_live_uid', uid);
    document.cookie = `sketch_live_uid=${uid}; path=/; SameSite=Lax`;
  }, userId);

  await page.goto(`http://localhost:3100/en/project/${projectId}/import`, { waitUntil: 'networkidle' });
  await expect(page.getByText('Upload EPUB')).toBeVisible();

  await page.setInputFiles('input[type="file"]', fixture);
  await expect(page.getByText('smoke.epub')).toBeVisible();

  await page.getByRole('button', { name: 'Upload EPUB' }).click();
  await expect(page.getByText('Smoke EPUB')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Selected 2 / 2 pages')).toBeVisible({ timeout: 30000 });

  await page.locator('button:has(svg.lucide-arrow-down)').first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: 'Import to Storyboard' }).click();
  await page.waitForURL(new RegExp(`/en/project/${projectId}/storyboard`), { timeout: 30000 });
  await expect(page.getByText('Storyboard')).toBeVisible();
  await expect(page.getByText('2 shots')).toBeVisible();

  await page.getByRole('link', { name: 'Preview' }).click();
  await page.waitForURL(new RegExp(`/en/project/${projectId}/preview`), { timeout: 30000 });
  await expect(page.getByText('0 / 2 shots completed')).toBeVisible();
});
