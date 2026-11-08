#!/usr/bin/env node
/**
 * Regression test for the job detail page on phones (Phase 2 of
 * MOBILE_REDESIGN_PLAN.md). Uses the first jobs listed on /jobs.
 *
 *   npx next build && npx next start -p 3000
 *   BASE_URL=http://localhost:3000 npm run test:e2e:job-detail
 *
 * PLAYWRIGHT_CHANNEL=chrome uses an installed Chrome instead of bundled Chromium.
 * Logged-in flows (apply form, save, report) are in REGRESSION_TEST_MATRIX.md.
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

async function newPage(width, height, locale = 'en') {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 1024,
    hasTouch: width < 1024,
  });
  await context.addCookies([
    { name: 'lang_pref_set', value: '1', url: BASE_URL },
    { name: 'lang', value: locale, url: BASE_URL },
  ]);
  return { context, page: await context.newPage() };
}

// Find a job with a long description (so "Read more" applies).
const { context: probeContext, page: probe } = await newPage(360, 740);
await probe.goto(`${BASE_URL}/en/jobs`, { waitUntil: 'load' });
const hrefs = await probe.locator('article a[href*="/jobs/"]').evaluateAll((as) => as.slice(0, 8).map((a) => a.getAttribute('href')));
let jobPath = null;
for (const href of hrefs) {
  await probe.goto(`${BASE_URL}${href}`, { waitUntil: 'load' });
  if (await probe.locator('button[aria-controls][aria-expanded]').filter({ hasText: /description|Read/i }).count()) {
    jobPath = href;
    break;
  }
}
await probeContext.close();
assert.ok(jobPath, 'no listed job with a long description found');
const descriptionHeading = (page) => page.locator('h2', { hasText: 'Job Description' });

{
  const { context, page } = await newPage(360, 740);
  await page.goto(`${BASE_URL}${jobPath}`, { waitUntil: 'load' });

  await check('360px: apply options come before the description and start on the first screen', async () => {
    const applyTop = await page.locator('#apply-options').evaluate((el) => el.getBoundingClientRect().top);
    const descTop = await descriptionHeading(page).evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(applyTop < descTop, `apply ${applyTop} vs description ${descTop}`);
    assert.ok(applyTop < 740, `apply options start at ${Math.round(applyTop)}px`);
  });

  await check('long description starts collapsed with an accessible toggle', async () => {
    const id = await page
      .locator('button[aria-controls][aria-expanded]')
      .filter({ hasText: /description/i })
      .getAttribute('aria-controls');
    // Re-locate by id: the label changes to "Show less" once expanded.
    const toggle = page.locator(`button[aria-controls="${id}"]`);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    const collapsedHeight = await page.locator(`[id="${id}"]`).evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(collapsedHeight <= 330, `collapsed height ${collapsedHeight}`);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    const expandedHeight = await page.locator(`[id="${id}"]`).evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(expandedHeight > collapsedHeight, 'did not expand');
  });

  await check('description text is fully in the page, with no raw HTML entities', async () => {
    const text = await descriptionHeading(page).locator('xpath=..').innerText();
    assert.ok(text.length > 400, 'description looks truncated');
    assert.doesNotMatch(text, /&#x?[0-9a-f]+;|&amp;/i);
  });

  await check('sticky Apply bar appears once past the apply options and jumps back to them', async () => {
    await descriptionHeading(page).evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const bar = page.getByRole('button', { name: /Apply Now/ });
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Apply Now/.test(x.textContent));
      return b && b.getBoundingClientRect().top < window.innerHeight;
    });
    await bar.click();
    await page.waitForFunction(() => {
      const r = document.getElementById('apply-options').getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight / 2;
    });
  });

  await check('share links are labelled and at least 44px', async () => {
    const shares = await page.locator('a[aria-label^="Share on"]').evaluateAll((els) =>
      els.map((a) => ({ label: a.getAttribute('aria-label'), w: a.getBoundingClientRect().width, h: a.getBoundingClientRect().height }))
    );
    assert.equal(shares.length, 4, JSON.stringify(shares));
    for (const s of shares) assert.ok(s.w >= 43.5 && s.h >= 43.5, `${s.label} is ${s.w}x${s.h}`);
  });

  await check('apply buttons keep their behaviour: sign-in link carries the apply redirect', async () => {
    const signIn = page.locator('#apply-options a', { hasText: /Sign in to Apply/ });
    if ((await signIn.count()) === 0) return; // job without internal apply
    const href = await signIn.getAttribute('href');
    assert.match(decodeURIComponent(href), new RegExp(`redirect=${jobPath}/apply`));
  });

  await check('JobPosting JSON-LD still present', async () => {
    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
      els.map((el) => JSON.parse(el.textContent)['@type'])
    );
    assert.ok(types.includes('JobPosting'), types.join(','));
  });

  await check('no horizontal page scroll at 360px', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
  });

  await context.close();
}

await check('320px: no horizontal scroll', async () => {
  const { context, page } = await newPage(320, 568);
  await page.goto(`${BASE_URL}${jobPath}`, { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0);
  await context.close();
});

await check('French: toggle label is localized', async () => {
  const { context, page } = await newPage(375, 667, 'fr');
  await page.goto(`${BASE_URL}${jobPath.replace(/^\/en\//, '/fr/')}`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /Lire toute la description/ }).waitFor();
  await context.close();
});

await check('desktop 1280: two columns, full description, no toggle', async () => {
  const { context, page } = await newPage(1280, 900);
  await page.goto(`${BASE_URL}${jobPath}`, { waitUntil: 'load' });
  const apply = await page.locator('#apply-options').boundingBox();
  const desc = await descriptionHeading(page).boundingBox();
  assert.ok(apply.x > desc.x + desc.width / 2, 'apply sidebar should be to the right');
  assert.equal(await page.getByRole('button', { name: /Read the full description/ }).isVisible(), false);
  await context.close();
});

await browser.close();
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll job detail checks passed.');
