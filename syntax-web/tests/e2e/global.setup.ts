import { chromium } from '@playwright/test';
import * as path from 'path';

export const AUTH_STATE_FILE = path.join(__dirname, 'auth-state.json');

async function globalSetup() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: 'https://syntax.oleacomputer.com' });
  const page = await context.newPage();

  await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Page might redirect straight to /dashboard if a session cookie exists
  const currentUrl = page.url();
  if (currentUrl.includes('/dashboard')) {
    await context.storageState({ path: AUTH_STATE_FILE });
    await browser.close();
    return;
  }

  // Wait for the auth form to hydrate
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.fill('input[type="email"]', 'admin@syntax.oleacomputer.com');
  await page.fill('input[type="password"]', 'SyntaxAdmin2026!');
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });

  await context.storageState({ path: AUTH_STATE_FILE });
  await browser.close();
}

export default globalSetup;
