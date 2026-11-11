#!/usr/bin/env node
/**
 * Regression test for components/ui/Dialog.tsx, exercised through its first
 * real user: the first-visit language prompt (components/LocalePreferencePrompt.tsx,
 * a non-dismissible Dialog).
 *
 *   npx next build && npx next start -p 3000
 *   BASE_URL=http://localhost:3000 npm run test:e2e:dialog
 *
 * PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome instead of bundled Chromium.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SIZES = [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
];

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

for (const [width, height] of SIZES) {
  // Fresh context = first visit (no lang_pref_set cookie), so the prompt opens.
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/en/pricing`, { waitUntil: 'load' });
  const dialog = page.getByRole('dialog');

  await check(`${width}px: prompt is an accessible modal dialog`, async () => {
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getAttribute('aria-modal'), 'true');
    const labelledBy = await dialog.getAttribute('aria-labelledby');
    assert.equal(labelledBy, 'locale-prompt-title');
    const title = await page.locator(`#${labelledBy}`).innerText();
    assert.ok(title.trim().length > 0, 'dialog title is empty');
    assert.equal(await dialog.evaluate((el) => el.closest('.fixed').parentElement === document.body), true, 'portalled to body');
  });

  await check(`${width}px: focus starts inside, page scroll locked`, async () => {
    await page.waitForFunction(() => document.querySelector('[role="dialog"]').contains(document.activeElement));
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  });

  await check(`${width}px: both language choices fit on screen (after scrolling inside the dialog)`, async () => {
    for (const label of [/English/, /Fran/]) {
      const button = dialog.getByRole('button', { name: label });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= height + 1, `${label} button off screen`);
    }
  });

  await check(`${width}px: Tab and Shift+Tab stay inside the dialog`, async () => {
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      const inside = await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement));
      assert.ok(inside, `focus left the dialog after ${key}`);
    }
  });

  await check(`${width}px: non-dismissible: Escape and backdrop do not close it`, async () => {
    await page.keyboard.press('Escape');
    await page.mouse.click(2, 2);
    await page.waitForTimeout(200);
    assert.equal(await dialog.isVisible(), true);
  });

  await check(`${width}px: choosing a language closes it, unlocks scroll, remembers the choice`, async () => {
    await dialog.getByRole('button', { name: /English/ }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.body.style.overflow === '');
    const cookies = await context.cookies();
    assert.ok(cookies.some((c) => c.name === 'lang_pref_set' && c.value === '1'), 'preference cookie not set');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    assert.equal(await page.getByRole('dialog').count(), 0, 'prompt reappeared after reload');
  });

  await context.close();
}

await check('French choice switches the URL to /fr', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/en/pricing`, { waitUntil: 'load' });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Fran/ }).click();
  await page.waitForURL(/\/fr\/pricing/);
  await context.close();
});

await browser.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll dialog checks passed.');
