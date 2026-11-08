#!/usr/bin/env node
/**
 * Regression test for the mobile navigation drawer (components/NavBar.tsx).
 *
 * Needs a running app (it is not part of `npm test`, which has no server):
 *   npx next build && npx next start -p 3000
 *   BASE_URL=http://localhost:3000 npm run test:e2e:mobile-nav
 *
 * Uses Playwright's bundled Chromium; set PLAYWRIGHT_CHANNEL=chrome to use an
 * installed Chrome instead.
 *
 * History: the drawer used to render inside the sticky <header>, whose
 * backdrop-filter made it the containing block for `fixed` children, so the
 * drawer was clipped to the header's height (2 of 10 links tappable).
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const WIDTHS = [320, 375, 390, 430];
const HEIGHT = 640; // short phone, so the drawer has to scroll
// Logged-out menu entries (paths without the /en or /fr prefix).
const EXPECTED_LINKS = [
  '/',
  '/jobs',
  '/remote-jobs',
  '/resume',
  '/pricing',
  '/learn-more/jobseekers',
  '/learn-more/recruiters',
  '/auth/register',
  '/auth/login',
];
const LABELS = {
  en: { open: 'Open menu', close: 'Close menu' },
  fr: { open: 'Ouvrir le menu', close: 'Fermer le menu' },
};

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

const stripLocale = (href) => {
  const path = new URL(href, BASE_URL).pathname.replace(/^\/(en|fr)(?=\/|$)/, '');
  return path === '' ? '/' : path;
};

async function newPage(browser, width, locale) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    isMobile: width < 1024,
    hasTouch: width < 1024,
  });
  // Skip the first-visit language prompt.
  await context.addCookies([
    { name: 'lang_pref_set', value: '1', url: BASE_URL },
    { name: 'lang', value: locale, url: BASE_URL },
  ]);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/${locale}/pricing`, { waitUntil: 'load' });
  return { context, page };
}

const drawer = (page) => page.locator('#mobile-nav-drawer');
const menuButton = (page) => page.locator('button[aria-controls="mobile-nav-drawer"]');

async function openDrawer(page) {
  await menuButton(page).click();
  await drawer(page).waitFor({ state: 'visible' });
  await page.waitForTimeout(350); // slide-in transition
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}
);

for (const width of WIDTHS) {
  const { context, page } = await newPage(browser, width, 'en');

  await check(`${width}px: closed drawer is hidden and its links are not focusable`, async () => {
    await menuButton(page).waitFor({ state: 'visible' });
    assert.equal(await drawer(page).isVisible(), false);
    const visibility = await drawer(page).evaluate((el) => getComputedStyle(el).visibility);
    assert.equal(visibility, 'hidden');
  });

  await check(`${width}px: drawer opens above all content, full height, as a modal dialog`, async () => {
    await openDrawer(page);
    const info = await drawer(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        height: r.height,
        viewport: window.innerHeight,
        parentIsBody: el.parentElement === document.body,
        role: el.getAttribute('role'),
        modal: el.getAttribute('aria-modal'),
        bodyOverflow: document.body.style.overflow,
      };
    });
    assert.equal(info.parentIsBody, true, 'drawer must be portalled to <body>');
    assert.equal(info.top, 0);
    assert.ok(Math.abs(info.height - info.viewport) <= 1, `height ${info.height} vs viewport ${info.viewport}`);
    assert.equal(info.role, 'dialog');
    assert.equal(info.modal, 'true');
    assert.equal(info.bodyOverflow, 'hidden', 'background scroll should be locked');
    assert.equal(await menuButton(page).getAttribute('aria-expanded'), 'true');
  });

  await check(`${width}px: focus moves to the close button`, async () => {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    assert.equal(focused, LABELS.en.close);
  });

  await check(`${width}px: every menu item is present and tappable, including scrolled to the bottom`, async () => {
    const hrefs = await drawer(page).locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    const paths = hrefs.map(stripLocale);
    for (const expected of EXPECTED_LINKS) {
      assert.ok(paths.includes(expected), `missing link ${expected} (have ${paths.join(', ')})`);
    }
    const blocked = await drawer(page).evaluate((el) => {
      const out = [];
      for (const target of el.querySelectorAll('a[href], button')) {
        target.scrollIntoView({ block: 'nearest' });
        const r = target.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || !target.contains(hit)) out.push(target.textContent.trim() || target.getAttribute('aria-label'));
      }
      return out;
    });
    assert.deepEqual(blocked, [], `obstructed items: ${blocked.join(', ')}`);

    const scroller = drawer(page).locator('> div').nth(1);
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const last = drawer(page).locator('a[href]').last();
    const box = await last.boundingBox();
    assert.ok(box && box.y + box.height <= HEIGHT + 1, `last item cut off: bottom ${box && box.y + box.height}`);
  });

  await check(`${width}px: Tab stays inside the drawer`, async () => {
    const count = await drawer(page).locator('a[href], button').count();
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => document.getElementById('mobile-nav-drawer').contains(document.activeElement));
      assert.ok(inside, `focus left the drawer after ${i + 1} Tab presses`);
    }
  });

  await check(`${width}px: Escape closes and focus returns to the menu button`, async () => {
    await page.keyboard.press('Escape');
    await drawer(page).waitFor({ state: 'hidden' });
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-controls'));
    assert.equal(focused, 'mobile-nav-drawer');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  });

  await check(`${width}px: backdrop click closes`, async () => {
    await openDrawer(page);
    await page.mouse.click(5, HEIGHT / 2);
    await drawer(page).waitFor({ state: 'hidden' });
  });

  await check(`${width}px: close button closes`, async () => {
    await openDrawer(page);
    await drawer(page).getByRole('button', { name: LABELS.en.close }).click();
    await drawer(page).waitFor({ state: 'hidden' });
  });

  await check(`${width}px: following a link navigates and closes`, async () => {
    await openDrawer(page);
    await drawer(page).locator('a[href$="/jobs"]').first().click();
    await page.waitForURL(/\/jobs(\?|$)/);
    await drawer(page).waitFor({ state: 'hidden' });
  });

  await context.close();
}

await check('French: drawer labels are localized and links keep the /fr prefix', async () => {
  const { context, page } = await newPage(browser, 375, 'fr');
  await menuButton(page).waitFor({ state: 'visible' });
  assert.equal(await menuButton(page).getAttribute('aria-label'), LABELS.fr.open);
  await openDrawer(page);
  await drawer(page).getByRole('button', { name: LABELS.fr.close }).waitFor();
  const hrefs = await drawer(page).locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  assert.ok(hrefs.some((h) => h.startsWith('/fr/jobs')), `expected /fr links, got ${hrefs.join(', ')}`);
  await context.close();
});

await check('Desktop (1280px): inline nav shown, menu button and drawer hidden', async () => {
  const { context, page } = await newPage(browser, 1280, 'en');
  await page.locator('nav ul a[href$="/jobs"]').first().waitFor({ state: 'visible' });
  assert.equal(await menuButton(page).isVisible(), false);
  assert.equal(await drawer(page).isVisible(), false);
  await context.close();
});

await browser.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll mobile navigation drawer checks passed.');
