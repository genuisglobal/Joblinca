#!/usr/bin/env node
/**
 * Regression test for Phase 3 (shell polish) of MOBILE_REDESIGN_PLAN.md:
 * pricing header, payment dialog, homepage order, header controls.
 *
 *   npx next build && npx next start -p 3000
 *   BASE_URL=http://localhost:3000 npm run test:e2e:shell
 *
 * Never presses a Pay button (that would start a real payment request).
 * Logged-in pieces (notification sheet, seeker bottom nav) are manual rows
 * in REGRESSION_TEST_MATRIX.md (N7, N8, N9).
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures++;
    console.log(`not ok - ${name}\n  ${String(error.message || error).split('\n').join('\n  ')}`);
  }
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}
);
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
await context.addCookies([
  { name: 'lang_pref_set', value: '1', url: BASE_URL },
  { name: 'lang', value: 'en', url: BASE_URL },
]);
const page = await context.newPage();

await page.goto(`${BASE_URL}/en/pricing`, { waitUntil: 'load' });

await check('pricing: only the site header (duplicate inner header removed)', async () => {
  await page.getByRole('button', { name: 'Subscribe' }).first().waitFor();
  assert.equal(await page.locator('header').count(), 1);
  assert.equal(await page.getByRole('link', { name: /Go to Dashboard/ }).count(), 0);
});

await check('payment dialog: accessible, labelled fields, Escape closes when idle', async () => {
  const subscribe = page.getByRole('button', { name: 'Subscribe' }).first();
  await subscribe.click();
  const dialog = page.getByRole('dialog', { name: 'Complete Payment' });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  const phone = dialog.getByLabel('Phone Number');
  assert.equal(await phone.getAttribute('type'), 'tel');
  assert.equal(await phone.getAttribute('inputmode'), 'numeric');
  await phone.fill('677123456');
  assert.equal(await phone.inputValue(), '677123456');
  const close = dialog.getByRole('button', { name: 'Close' });
  const box = await close.boundingBox();
  assert.ok(box.width >= 43.5 && box.height >= 43.5, `close button ${box.width}x${box.height}`);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
});

await check('payment dialog fits a 360x740 screen (pay buttons reachable by scrolling inside it)', async () => {
  await page.getByRole('button', { name: 'Subscribe' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Complete Payment' });
  await dialog.waitFor();
  const panel = await dialog.boundingBox();
  assert.ok(panel.y >= 0 && panel.y + panel.height <= 741, `panel ${panel.y}+${panel.height}`);
  const pay = dialog.getByRole('button', { name: /MTN/ });
  await pay.scrollIntoViewIfNeeded();
  const payBox = await pay.boundingBox();
  assert.ok(payBox.y + payBox.height <= 741, 'MTN button off screen');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await dialog.waitFor({ state: 'detached' });
});

await page.goto(`${BASE_URL}/en`, { waitUntil: 'load' });

await check('homepage: featured jobs come before the city links and appear early', async () => {
  const firstJob = await page.locator('article').first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const cities = await page.getByText('Find Jobs in Your City').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  assert.ok(firstJob < cities, `first job at ${firstJob}, cities at ${cities}`);
  assert.ok(firstJob < 740 * 3, `first featured job at ${Math.round(firstJob)}px`);
});

await check('header: menu button is 44px; no notification bell when logged out', async () => {
  const menu = await page.locator('button[aria-controls="mobile-nav-drawer"]').boundingBox();
  assert.ok(menu.width >= 43.5 && menu.height >= 43.5, `menu ${menu.width}x${menu.height}`);
  assert.equal(await page.getByRole('button', { name: /^Notifications/ }).count(), 0);
});

await check('no horizontal scroll on home and pricing', async () => {
  for (const path of ['/en', '/en/pricing']) {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, path);
  }
});

await browser.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll shell checks passed.');
