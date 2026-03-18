import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@syntax.oleacomputer.com';
const ADMIN_PASSWORD = 'SyntaxAdmin2026!';

async function doLogin(page: Page) {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' });
  // Wait for React hydration: React attaches __reactFiber$* keys to DOM nodes when done.
  // This avoids the race where fill() fires before onChange is bound, leaving email empty.
  await page.waitForFunction(() => {
    const el = document.querySelector('input[type="email"]');
    return el && Object.keys(el).some(k => k.startsWith('__react'));
  }, { timeout: 20000 });
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/dashboard/, { timeout: 35000, waitUntil: 'commit' });
  await page.waitForSelector('button:has-text("New Chat")', { timeout: 25000 });
}

test.describe('SYNTAX Production — Admin Login & Tier Access', () => {

  test('1. Auth page loads correctly', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    await expect(page.locator('text=SYNTAX').first()).toBeVisible();
    await expect(page.locator('text=Welcome Back')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible();
  });

  test('2. Admin login succeeds and lands on dashboard', async ({ page }) => {
    await doLogin(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('3. Dashboard loads with INSTITUTIONAL tier badge', async ({ page }) => {
    await doLogin(page);
    await expect(page.locator('text=INSTITUTIONAL')).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`text=${ADMIN_EMAIL}`)).toBeVisible();
  });

  test('4. No dev bypass controls visible in production', async ({ page }) => {
    await doLogin(page);
    await expect(page.locator('text=Dev Tools')).not.toBeVisible();
    await expect(page.locator('text=Bypass Tier')).not.toBeVisible();
  });

  test('5. Chat interface — New Chat shows prompt suggestions', async ({ page }) => {
    await doLogin(page);
    await page.locator('button:has-text("New Chat")').first().click();
    await expect(
      page.locator('text=How can I assist your portfolio today?')
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('textarea, input[placeholder*="portfolio"]').first()
    ).toBeVisible();
  });

  test('6. Live news ticker is active', async ({ page }) => {
    await doLogin(page);
    // Ticker shows "Live" label + Reuters/CNBC headlines
    await expect(
      page.locator('text=Live').or(page.locator('text=LIVE')).first()
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator('text=Reuters').or(page.locator('text=CNBC')).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('7. Research button visible and panel opens without paywall', async ({ page }) => {
    await doLogin(page);
    const researchBtn = page.locator('button:has-text("Research")').first();
    await expect(researchBtn).toBeVisible({ timeout: 10000 });
    await researchBtn.click();
    await page.waitForTimeout(2000);
    // Institutional tier — no upgrade prompt
    await expect(page.locator('text=Upgrade to Institutional')).not.toBeVisible();
  });

  test('8. Chat submission echoes the message back', async ({ page }) => {
    await doLogin(page);
    await page.locator('button:has-text("New Chat")').first().click();
    const chatInput = page.locator('textarea, input[placeholder*="portfolio"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Is VTI a good ETF to hold long term?');
    await page.keyboard.press('Enter');
    // User bubble with "VTI" should appear immediately in thread
    await expect(page.locator('text=VTI').first()).toBeVisible({ timeout: 15000 });
  });

  test('9. Sign out redirects away from dashboard', async ({ page }) => {
    await doLogin(page);
    await page.locator('button:has-text("Sign Out")').click();
    // Wait for navigation away from /dashboard
    await page.waitForFunction(() => !window.location.href.includes('/dashboard'), { timeout: 10000 });
    expect(page.url()).toMatch(/syntax\.oleacomputer\.com/);
  });

});
