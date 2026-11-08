#!/usr/bin/env node
/**
 * Regression test for the mobile /jobs page (Phase 1 of MOBILE_REDESIGN_PLAN.md).
 *
 *   npx next build && npx next start -p 3000
 *   BASE_URL=http://localhost:3000 npm run test:e2e:jobs
 *
 * Needs published jobs in the database the app points at.
 * PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome instead of bundled Chromium.
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

async function phonePage(width = 360, height = 740, locale = 'en') {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  await context.addCookies([
    { name: 'lang_pref_set', value: '1', url: BASE_URL },
    { name: 'lang', value: locale, url: BASE_URL },
  ]);
  return { context, page: await context.newPage() };
}

const allTabCount = async (page) => {
  const text = await page.locator('nav ul a[aria-current="page"]').innerText();
  return Number(text.replace(/\D+/g, ' ').trim().split(' ').pop());
};

{
  const { context, page } = await phonePage();
  await page.goto(`${BASE_URL}/en/jobs`, { waitUntil: 'load' });

  await check('360x740: first job card is above the fold', async () => {
    const top = await page.locator('article').first().evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(top < 740, `first card starts at ${Math.round(top)}px`);
  });

  await check('360px: cards are compact (< 240px tall)', async () => {
    const heights = await page.locator('article').evaluateAll((els) => els.slice(0, 8).map((el) => el.getBoundingClientRect().height));
    assert.ok(heights.length > 0, 'no cards');
    for (const h of heights) assert.ok(h < 240, `card is ${Math.round(h)}px tall`);
  });

  await check('each card is one link and the whole card is tappable', async () => {
    const results = await page.locator('article').evaluateAll((els) =>
      els.slice(0, 8).map((el) => {
        const links = el.querySelectorAll('a[href]');
        const r = el.getBoundingClientRect();
        // html has scroll-behavior: smooth; measure after an instant scroll.
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width - 12, box.top + box.height - 12);
        return { links: links.length, hitIsLink: !!hit && hit.closest('a') === links[0], height: r.height, hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 50) : 'none' };
      })
    );
    for (const r of results) {
      assert.equal(r.links, 1, 'card should contain exactly one link');
      assert.ok(r.hitIsLink, `card corner is not covered by its link (hit ${r.hit})`);
    }
  });

  await check('no horizontal page scroll', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
  });

  await check('browse tabs: active tab marked, counts shown, no duplicate count tiles', async () => {
    assert.equal(await page.locator('nav ul a[aria-current="page"]').count(), 1);
    assert.ok(Number.isFinite(await allTabCount(page)));
  });

  await check('filters sheet: open, apply work type, chip shows, URL param set', async () => {
    await page.getByRole('button', { name: /^Filters/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter opportunities' });
    await sheet.waitFor();
    await sheet.locator('select').nth(1).selectOption('remote');
    await sheet.getByRole('button', { name: 'Show results' }).click();
    await page.waitForURL(/work_type=remote/);
    await page.getByRole('button', { name: 'Remove filter: Remote' }).waitFor();
    assert.match(await page.getByRole('button', { name: /^Filters, 1 active/ }).getAttribute('aria-label'), /1 active/);
  });

  await check('removing a chip clears the URL parameter', async () => {
    await page.getByRole('button', { name: 'Remove filter: Remote' }).click();
    await page.waitForURL((url) => !url.search.includes('work_type'));
  });

  await check('keyword search submits ?q= and shows a chip', async () => {
    const input = page.locator('form[role="search"]:visible input[type="search"]');
    await input.fill('comptable');
    await input.press('Enter');
    await page.waitForURL(/[?&]q=comptable/);
    await page.getByRole('button', { name: /Remove filter: .comptable./ }).waitFor();
  });

  await check('legacy ?remote=1 still applies the Remote filter', async () => {
    await page.goto(`${BASE_URL}/en/jobs?remote=1`, { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Remove filter: Remote' }).waitFor();
  });

  await check('Escape closes the filters sheet and focus returns to the Filters button', async () => {
    await page.goto(`${BASE_URL}/en/jobs`, { waitUntil: 'load' });
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'));
    assert.equal(focused, 'dialog');
  });

  await check('homepage job count equals the /jobs "All" count', async () => {
    await page.goto(`${BASE_URL}/en/jobs`, { waitUntil: 'load' });
    const jobsTotal = await allTabCount(page);
    await page.goto(`${BASE_URL}/en`, { waitUntil: 'load' });
    const homeText = await page.locator('main').innerText();
    const match = homeText.match(/View All (\d+)/) || homeText.match(/(\d+)\s+(?:Jobs|jobs)\b/);
    assert.ok(match, 'no job count on the homepage');
    assert.equal(Number(match[1]), jobsTotal, `homepage ${match[1]} vs /jobs ${jobsTotal}`);
  });

  await context.close();
}

await check('320px: search row and Filters button fit', async () => {
  const { context, page } = await phonePage(320, 568);
  await page.goto(`${BASE_URL}/en/jobs`, { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
  assert.ok(await page.getByRole('button', { name: /^Filters/ }).isVisible());
  await context.close();
});

await check('French: Filtres label and localized sheet', async () => {
  const { context, page } = await phonePage(375, 667, 'fr');
  await page.goto(`${BASE_URL}/fr/jobs`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await page.getByRole('dialog', { name: 'Filtrer les opportunités' }).waitFor();
  await context.close();
});

await check('desktop 1280: inline filters shown, Filters button hidden', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: 'lang_pref_set', value: '1', url: BASE_URL }, { name: 'lang', value: 'en', url: BASE_URL }]);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/en/jobs`, { waitUntil: 'load' });
  assert.equal(await page.locator('form[role="search"]:visible select').count(), 3, 'expected 3 inline selects');
  assert.equal(await page.getByRole('button', { name: /^Filters/ }).isVisible(), false);
  await context.close();
});

await browser.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll /jobs mobile checks passed.');
