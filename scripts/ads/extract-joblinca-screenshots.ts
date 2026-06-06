import { chromium, devices, type Browser, type Locator, type Page } from 'playwright';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const BASE_URL = (process.env.JOBLINCA_BASE_URL?.trim() || 'https://joblinca.com').replace(/\/+$/, '');
const OUTPUT_DIR = path.resolve(process.cwd(), 'ads/assets');
const DESKTOP_VIEWPORT = { width: 1440, height: 1024 };
const MOBILE_DEVICE = devices['iPhone 13'];
const NAVIGATION_TIMEOUT_MS = 45_000;
const DEFAULT_TIMEOUT_MS = 15_000;

type ViewportName = 'desktop' | 'mobile';
type LogLevel = 'info' | 'warn' | 'error';
type JobsPageType = 'direct-route' | 'alternative-route' | 'homepage-link' | 'homepage-section';
type QualityKind = 'listing' | 'count' | 'card';
type ApplyFlowType =
  | 'inline'
  | 'modal'
  | 'separate-page'
  | 'auth-wall'
  | 'external-url'
  | 'email'
  | 'phone'
  | 'whatsapp'
  | 'unknown';

type ManifestEntry = {
  file: string;
  pageType: string;
  description: string;
  recommendedUse: string;
  viewport: ViewportName;
  fallbackBehavior: string;
};

type State = {
  baseUrl: string;
  captured: Set<string>;
  jobsPage: { url: string; type: JobsPageType; selector: string } | null;
  detailUrl: string | null;
  applyFlow: { type: ApplyFlowType; description: string; targetUrl: string | null } | null;
};

type Candidate = { label: string; locator: Locator };
type Found = { label: string; locator: Locator };
type CaptureAssessment = { ok: boolean; reason: string };
type JobsSurfaceDiagnostics = {
  path: string;
  title: string;
  jobLinks: number;
  visibleJobLinks: number;
  headingMatches: number;
  viewOpportunityMatches: number;
  filterLinkMatches: number;
  bodyTextLength: number;
  bodySample: string;
};
type RegionOptions = {
  padding?: number;
  maxHeight?: number;
  minHeight?: number;
  alignY?: 'top' | 'center';
};

const MANIFEST: ManifestEntry[] = [
  {
    file: '01-homepage-hero.png',
    pageType: 'homepage',
    description: 'Homepage hero with the main promise, search surface, and browse CTA.',
    recommendedUse: 'Opening awareness creative.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to the first strong homepage section, then a homepage full capture.',
  },
  {
    file: '02-homepage-how-it-works.png',
    pageType: 'homepage',
    description: 'How-it-works proof section that explains discovery and application flow.',
    recommendedUse: 'Explainer or conversion creative.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to a strong homepage proof section such as features or jobs.',
  },
  {
    file: '03-jobs-listing-page.png',
    pageType: 'jobs-listing',
    description: 'Jobs listing overview with visible opportunities.',
    recommendedUse: 'Proof that Joblinca has active roles.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to the homepage jobs section or current jobs page full capture.',
  },
  {
    file: '04-jobs-count-focus.png',
    pageType: 'jobs-proof',
    description: 'Focused capture of visible counts or equivalent jobs proof.',
    recommendedUse: 'Performance frame that emphasizes available opportunities.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to the jobs header, filter counts, or another live-proof block.',
  },
  {
    file: '05-single-job-card.png',
    pageType: 'jobs-listing',
    description: 'Complete job card with title, employer, metadata, and CTA.',
    recommendedUse: 'Concrete job example in ad creatives.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to the best visible listing card or listing overview.',
  },
  {
    file: '06-single-job-detail-page.png',
    pageType: 'job-detail',
    description: 'Job detail page with context and apply surface visible above the fold.',
    recommendedUse: 'Trust-building conversion frame.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to the strongest opened job region or the best listing region.',
  },
  {
    file: '07-apply-button-focus.png',
    pageType: 'apply-cta',
    description: 'Focused apply CTA capture with enough surrounding context.',
    recommendedUse: 'Direct-response CTA frame.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to the apply options card, closed notice, or best visible CTA equivalent.',
  },
  {
    file: '08-application-flow-step.png',
    pageType: 'application-flow',
    description: 'First meaningful application step, auth wall, or safe external-apply context.',
    recommendedUse: 'Final story beat showing how the flow continues.',
    viewport: 'desktop',
    fallbackBehavior: 'Falls back to the safest meaningful next-step surface for the detected flow type.',
  },
  {
    file: '09-mobile-homepage.png',
    pageType: 'homepage',
    description: 'Mobile homepage hero optimized for vertical creatives.',
    recommendedUse: 'Stories and mobile-first awareness ads.',
    viewport: 'mobile',
    fallbackBehavior: 'Falls back to the first homepage section or a mobile homepage full capture.',
  },
  {
    file: '10-mobile-jobs-page.png',
    pageType: 'jobs-listing',
    description: 'Mobile jobs listing with visible opportunity proof.',
    recommendedUse: 'Mobile conversion creative.',
    viewport: 'mobile',
    fallbackBehavior: 'Falls back to the mobile jobs header, homepage jobs block, or full mobile listing capture.',
  },
];

const HIDE_SELECTORS = [
  '[data-testid*="cookie" i]',
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="consent" i]',
  '[class*="consent" i]',
  '[id*="intercom" i]',
  '[class*="intercom" i]',
  '[id*="crisp" i]',
  '[class*="crisp" i]',
  '[id*="chat" i]',
  '[class*="chat" i]',
  'iframe[title*="chat" i]',
  'iframe[src*="intercom" i]',
  'iframe[src*="crisp" i]',
  '[data-sonner-toaster]',
  '[data-radix-toast-viewport]',
];

const SCREENSHOT_STYLE = `
  *, *::before, *::after { caret-color: transparent !important; }
  html { scroll-behavior: auto !important; }
  [data-sonner-toaster], [data-radix-toast-viewport],
  [data-testid*="cookie" i], [id*="cookie" i], [class*="cookie" i],
  [id*="consent" i], [class*="consent" i],
  [id*="intercom" i], [class*="intercom" i],
  [id*="crisp" i], [class*="crisp" i],
  [id*="chat" i], [class*="chat" i],
  iframe[title*="chat" i], iframe[src*="intercom" i], iframe[src*="crisp" i] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
`;

function outputPath(file: string): string {
  return path.join(OUTPUT_DIR, file);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compactText(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function logStep(step: string, message: string, level: LogLevel = 'info'): void {
  const prefix = `[ads:screenshots] ${level.toUpperCase().padEnd(5)} ${step}`;
  if (level === 'warn') {
    console.warn(`${prefix} ${message}`);
    return;
  }
  if (level === 'error') {
    console.error(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function resetOutputs(): Promise<void> {
  for (const file of [...MANIFEST.map((entry) => entry.file), 'manifest.json']) {
    await fs.rm(outputPath(file), { force: true }).catch(() => undefined);
  }
}

async function withRetry<T>(
  step: string,
  operation: (attempt: number) => Promise<T>,
  attempts = 3,
  delayMs = 1_200,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const last = attempt === attempts;
      logStep(step, `${last ? 'final attempt failed' : `attempt ${attempt}/${attempts} failed`}: ${safeErrorMessage(error)}`, last ? 'error' : 'warn');
      if (!last) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

function resolveUrl(base: string, href: string): string {
  return new URL(href, base).toString();
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function isJobDetailUrl(url: string): boolean {
  return /^\/jobs\/[^/]+\/?$/.test(pathnameOf(url));
}

function isApplyUrl(url: string): boolean {
  return /^\/jobs\/[^/]+\/apply(?:\/|$)/.test(pathnameOf(url));
}

function isAuthUrl(url: string): boolean {
  return /\/auth\/|\/login/i.test(pathnameOf(url));
}

async function installScreenshotStyle(page: Page): Promise<void> {
  await page.evaluate((css) => {
    let node = document.getElementById('__joblinca_shot_style__') as HTMLStyleElement | null;
    if (!node) {
      node = document.createElement('style');
      node.id = '__joblinca_shot_style__';
      document.head.appendChild(node);
    }
    node.textContent = css;
  }, SCREENSHOT_STYLE).catch(() => undefined);
}

async function hideNuisances(page: Page): Promise<void> {
  await page.evaluate((selectors) => {
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');
        node.style.setProperty('opacity', '0', 'important');
      }
    }
  }, HIDE_SELECTORS).catch(() => undefined);
}

async function dismissPopups(page: Page): Promise<void> {
  const patterns = [/accept/i, /accept all/i, /i agree/i, /got it/i, /dismiss/i, /close/i, /no thanks/i];
  for (const pattern of patterns) {
    for (const locator of [page.getByRole('button', { name: pattern }).first(), page.getByRole('link', { name: pattern }).first()]) {
      try {
        if (await locator.isVisible({ timeout: 250 }).catch(() => false)) {
          await locator.click({ timeout: 1_000 }).catch(() => undefined);
          await page.waitForTimeout(150);
        }
      } catch {
        // best effort only
      }
    }
  }
  await page.keyboard.press('Escape').catch(() => undefined);
  await installScreenshotStyle(page);
  await hideNuisances(page);
}

async function waitForStableUI(page: Page, step: string): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await installScreenshotStyle(page);
  await hideNuisances(page);
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {
    logStep(step, 'network idle wait timed out; continuing with best-effort settling', 'warn');
  });
  await page.waitForFunction(
    () => {
      const fontsReady = !('fonts' in document) || !document.fonts || document.fonts.status === 'loaded';
      const imagesReady = Array.from(document.images)
        .filter((image) => {
          const rect = image.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .every((image) => image.complete && image.naturalWidth > 0);
      return fontsReady && imagesReady;
    },
    undefined,
    { timeout: 8_000 },
  ).catch(() => {
    logStep(step, 'fonts or images did not fully settle before timeout; continuing', 'warn');
  });
  await page.waitForTimeout(300);
  await dismissPopups(page);
}

async function waitForPageText(page: Page, step: string, patterns: RegExp[], timeoutMs = 25_000): Promise<void> {
  await page.waitForFunction(
    (sources) => {
      const text = document.body.innerText || '';
      return sources.some((source) => new RegExp(source, 'i').test(text));
    },
    patterns.map((pattern) => pattern.source),
    { timeout: timeoutMs },
  ).catch(() => {
    logStep(step, 'page text signals did not appear before timeout; continuing with best effort', 'warn');
  });
}

async function countVisibleMatches(page: Page, selector: string): Promise<number> {
  return page.evaluate((query) => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(query));
    return nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && style.opacity !== '0';
    }).length;
  }, selector).catch(() => 0);
}

async function inspectJobsSurface(page: Page): Promise<JobsSurfaceDiagnostics> {
  const fallback = () => ({
    path: pathnameOf(page.url()),
    title: '',
    jobLinks: 0,
    visibleJobLinks: 0,
    headingMatches: 0,
    viewOpportunityMatches: 0,
    filterLinkMatches: 0,
    bodyTextLength: 0,
    bodySample: '',
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => undefined);
      return await page.evaluate(() => {
        const visible = (element: Element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.opacity !== '0';
        };

        const bodyText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        const allJobLinks = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
        const visibleJobLinks = allJobLinks.filter(visible);
        const visibleNodes = Array.from(document.querySelectorAll('body *')).filter(visible);
        const headingMatches = visibleNodes.filter((node) =>
          /^H[1-3]$/.test(node.tagName) && /find the right opportunity|all available|today'?s featured|opportunit/i.test((node.textContent || '').trim())
        ).length;
        const viewOpportunityMatches = visibleNodes.filter((node) =>
          /view opportunity|view details/i.test((node.textContent || '').trim())
        ).length;
        const filterLinkMatches = Array.from(document.querySelectorAll('a')).filter((node) =>
          visible(node) && /all opportunities|jobs|educational internships|professional internships|gigs/i.test((node.textContent || '').trim())
        ).length;

        return {
          path: location.pathname,
          title: document.title,
          jobLinks: allJobLinks.length,
          visibleJobLinks: visibleJobLinks.length,
          headingMatches,
          viewOpportunityMatches,
          filterLinkMatches,
          bodyTextLength: bodyText.length,
          bodySample: bodyText.slice(0, 220),
        };
      });
    } catch {
      if (attempt < 4) {
        await page.waitForTimeout(500);
        continue;
      }
      return fallback();
    }
  }

  return fallback();
}

function hasStrongJobsRouteSignals(diagnostics: JobsSurfaceDiagnostics): boolean {
  return diagnostics.visibleJobLinks >= 2
    && (diagnostics.headingMatches >= 1 || diagnostics.viewOpportunityMatches >= 1 || diagnostics.filterLinkMatches >= 3);
}

function hasMeaningfulJobsSurface(diagnostics: JobsSurfaceDiagnostics): boolean {
  return hasStrongJobsRouteSignals(diagnostics) || (diagnostics.visibleJobLinks >= 1 && diagnostics.bodyTextLength >= 800);
}

function logJobsSurface(step: string, label: string, diagnostics: JobsSurfaceDiagnostics, level: LogLevel = 'info'): void {
  logStep(
    step,
    `${label}: path=${diagnostics.path} jobLinks=${diagnostics.visibleJobLinks}/${diagnostics.jobLinks} headings=${diagnostics.headingMatches} ctas=${diagnostics.viewOpportunityMatches} filters=${diagnostics.filterLinkMatches} text=${diagnostics.bodyTextLength} sample="${compactText(diagnostics.bodySample, 120)}"`,
    level,
  );
}

async function assessShotQuality(locators: Locator[], kind: QualityKind): Promise<CaptureAssessment> {
  const snapshots = await Promise.all(locators.map(async (locator) => {
    const box = await locator.boundingBox().catch(() => null);
    const text = compactText((await locator.innerText().catch(() => '')) || '', 800);
    const headingCount = await locator.locator('h1, h2, h3').count().catch(() => 0);
    const nestedJobLinks = await locator.locator('a[href*="/jobs/"]').count().catch(() => 0);
    return { box, text, headingCount, nestedJobLinks };
  }));

  const visibleSnapshots = snapshots.filter((snapshot): snapshot is {
    box: { x: number; y: number; width: number; height: number };
    text: string;
    headingCount: number;
    nestedJobLinks: number;
  } => Boolean(snapshot.box && snapshot.box.width > 8 && snapshot.box.height > 8));

  if (!visibleSnapshots.length) {
    return { ok: false, reason: 'target elements were not visibly measurable' };
  }

  const left = Math.min(...visibleSnapshots.map((snapshot) => snapshot.box.x));
  const top = Math.min(...visibleSnapshots.map((snapshot) => snapshot.box.y));
  const right = Math.max(...visibleSnapshots.map((snapshot) => snapshot.box.x + snapshot.box.width));
  const bottom = Math.max(...visibleSnapshots.map((snapshot) => snapshot.box.y + snapshot.box.height));
  const combinedWidth = Math.ceil(right - left);
  const combinedHeight = Math.ceil(bottom - top);
  const text = compactText(visibleSnapshots.map((snapshot) => snapshot.text).join(' '), 1_000);
  const headingCount = visibleSnapshots.reduce((sum, snapshot) => sum + snapshot.headingCount, 0);
  const nestedJobLinks = visibleSnapshots.reduce((sum, snapshot) => sum + snapshot.nestedJobLinks, 0);
  const hasDigits = /\b\d+\b/.test(text);

  if (kind === 'listing') {
    if (combinedWidth < 320 || combinedHeight < 220) {
      return { ok: false, reason: `listing region was too small (${combinedWidth}x${combinedHeight})` };
    }
    if (text.length < 160) {
      return { ok: false, reason: 'listing region did not contain enough visible text' };
    }
    if (!/(view opportunity|view details|opportunit|jobs|internships|gigs|remote|compensation)/i.test(text)) {
      return { ok: false, reason: 'listing region did not look like a jobs listing surface' };
    }
    if (headingCount < 1 && nestedJobLinks < 1) {
      return { ok: false, reason: 'listing region did not expose a heading or nested job link structure' };
    }
    return { ok: true, reason: 'listing region looked populated' };
  }

  if (kind === 'count') {
    if (combinedWidth < 220 || combinedHeight < 80) {
      return { ok: false, reason: `count region was too small (${combinedWidth}x${combinedHeight})` };
    }
    if (!hasDigits) {
      return { ok: false, reason: 'count region did not expose numeric proof' };
    }
    if (!/(jobs|internships|gigs|roles from verified|all opportunities|cities)/i.test(text)) {
      return { ok: false, reason: 'count region did not read like proof of available opportunities' };
    }
    return { ok: true, reason: 'count region looked populated' };
  }

  if (combinedWidth < 220 || combinedHeight < 140) {
    return { ok: false, reason: `job card region was too small (${combinedWidth}x${combinedHeight})` };
  }
  if (text.length < 80) {
    return { ok: false, reason: 'job card region did not contain enough visible text' };
  }
  if (!/(view opportunity|view details|apply|remote|compensation|days ago|today|yesterday|external|joblinca)/i.test(text)) {
    return { ok: false, reason: 'job card region did not look like a complete card' };
  }
  if (headingCount < 1) {
    return { ok: false, reason: 'job card region did not expose a title heading' };
  }
  return { ok: true, reason: 'job card region looked populated' };
}

async function saveQualifiedGroupShot(
  page: Page,
  locators: Locator[],
  file: string,
  step: string,
  state: State,
  kind: QualityKind,
  options: RegionOptions = {},
): Promise<boolean> {
  const assessment = await assessShotQuality(locators, kind);
  if (!assessment.ok) {
    logStep(step, `${file} rejected by ${kind} quality check: ${assessment.reason}`, 'warn');
    return false;
  }
  return saveGroupShot(page, locators, file, step, state, options);
}

async function saveQualifiedLocatorShot(
  page: Page,
  locator: Locator,
  file: string,
  step: string,
  state: State,
  kind: QualityKind,
  options: RegionOptions = {},
): Promise<boolean> {
  return saveQualifiedGroupShot(page, [locator], file, step, state, kind, options);
}

async function waitForJobsContent(page: Page, step: string): Promise<JobsSurfaceDiagnostics> {
  const signals: Candidate[] = [
    { label: 'jobs page heading', locator: page.getByRole('heading', { name: /find the right opportunity/i }).first() },
    { label: 'view opportunity text', locator: page.getByText(/view opportunity/i).first() },
    { label: 'job card heading', locator: page.locator('main a[href*="/jobs/"] h2, main a[href*="/jobs/"] h3').first() },
  ];
  let diagnostics = await inspectJobsSurface(page);
  logJobsSurface(step, 'jobs surface snapshot', diagnostics);
  const quickSignals = await waitForVisibleCandidate(page, signals, `${step}.quick`, 6_000, 750);

  if (!quickSignals && !hasStrongJobsRouteSignals(diagnostics)) {
    const hydrationWindowMs = pathnameOf(page.url()).startsWith('/jobs') ? 18_000 : 10_000;
    logStep(step, 'jobs page did not expose strong listing signals yet; waiting for hydrated content', 'warn');
    const startedAt = Date.now();
    while (!hasStrongJobsRouteSignals(diagnostics) && (Date.now() - startedAt) < hydrationWindowMs) {
      await page.waitForTimeout(2_000);
      diagnostics = await inspectJobsSurface(page);
      if ((Date.now() - startedAt) >= 6_000 && !hasStrongJobsRouteSignals(diagnostics)) {
        logJobsSurface(step, 'jobs surface still hydrating', diagnostics, 'warn');
      }
    }
  }

  if (!hasStrongJobsRouteSignals(diagnostics)) {
    await waitForPageText(page, step, [/find the right opportunity/i, /view opportunity/i, /roles from verified/i, /all opportunities/i], 6_000);
  }

  await waitForStableUI(page, step);
  diagnostics = await inspectJobsSurface(page);
  logJobsSurface(step, hasStrongJobsRouteSignals(diagnostics) ? 'jobs surface ready' : 'jobs surface after best-effort wait', diagnostics, hasStrongJobsRouteSignals(diagnostics) ? 'info' : 'warn');
  return diagnostics;
}

async function waitForHomepageJobsContent(page: Page, step: string): Promise<void> {
  const signals = await waitForVisibleCandidate(page, [
    ...homepageJobsCandidates(page),
    ...jobCardCandidates(page),
    { label: 'featured jobs heading', locator: page.getByRole('heading', { name: /all available|today'?s featured/i }).first() },
    { label: 'view details text', locator: page.getByText(/view details|new jobs daily|roles from verified|fresh picks/i).first() },
  ], `${step}.home`, 12_000, 750);

  if (!signals) {
    logStep(step, 'homepage jobs surface is not ready yet; continuing with best effort', 'warn');
    await waitForPageText(page, step, [/all available/i, /today'?s featured/i, /view details/i, /new jobs daily/i], 6_000);
  }

  await waitForStableUI(page, step);
}

async function waitForDetailContent(page: Page, step: string): Promise<void> {
  await waitForPageText(page, step, [/back to jobs/i, /apply for this/i, /opportunity summary/i], 25_000);
  await waitForStableUI(page, step);
}

async function waitForApplyOrAuthContent(page: Page, step: string): Promise<void> {
  await waitForPageText(page, step, [/contact information/i, /submit application/i, /sign in/i, /welcome back/i], 25_000);
  await waitForStableUI(page, step);
}

async function navigateWithRetry(page: Page, url: string, step: string): Promise<void> {
  await withRetry(step, async () => {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    if (response && response.status() >= 400) {
      throw new Error(`HTTP ${response.status()} while loading ${url}`);
    }
    await waitForStableUI(page, step);
  });
}

async function scrollIntoViewIfNeeded(page: Page, locator: Locator, step: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    }
  }).catch(() => undefined);
  await waitForStableUI(page, step);
}

async function findFirstVisible(
  page: Page,
  candidates: Candidate[],
  step: string,
  timeoutMs = 2_500,
  quiet = false,
): Promise<Found | null> {
  for (const candidate of candidates) {
    try {
      if ((await candidate.locator.count()) < 1) {
        continue;
      }
      const locator = candidate.locator.first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      return { label: candidate.label, locator };
    } catch {
      // try the next locator
    }
  }
  if (!quiet) {
    logStep(step, 'no visible locator matched the candidate list', 'warn');
  }
  return null;
}

async function waitForVisibleCandidate(
  page: Page,
  candidates: Candidate[],
  step: string,
  totalTimeoutMs = 10_000,
  probeTimeoutMs = 600,
): Promise<Found | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < totalTimeoutMs) {
    const found = await findFirstVisible(page, candidates, step, probeTimeoutMs, true);
    if (found) {
      return found;
    }
    await page.waitForTimeout(350);
  }
  logStep(step, 'no visible locator matched the candidate list', 'warn');
  return null;
}

async function pageDimensions(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight),
  }));
}

async function buildClip(page: Page, locators: Locator[], options: RegionOptions = {}): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const boxes = (await Promise.all(locators.map((locator) => locator.boundingBox().catch(() => null))))
    .filter((box): box is { x: number; y: number; width: number; height: number } => Boolean(box && box.width > 8 && box.height > 8));
  if (!boxes.length) {
    return null;
  }
  const dims = await pageDimensions(page);
  const pad = options.padding ?? 16;
  let x = Math.max(0, Math.min(...boxes.map((box) => box.x)) - pad);
  let y = Math.max(0, Math.min(...boxes.map((box) => box.y)) - pad);
  let right = Math.min(dims.width, Math.max(...boxes.map((box) => box.x + box.width)) + pad);
  let bottom = Math.min(dims.height, Math.max(...boxes.map((box) => box.y + box.height)) + pad);
  let width = Math.max(1, right - x);
  let height = Math.max(1, bottom - y);
  if (options.maxHeight && height > options.maxHeight) {
    if (options.alignY === 'center') {
      y = Math.max(0, y + (height - options.maxHeight) / 2);
    }
    height = options.maxHeight;
  }
  if (options.minHeight && height < options.minHeight) {
    height = Math.min(dims.height - y, options.minHeight);
  }
  right = Math.min(dims.width, x + width);
  bottom = Math.min(dims.height, y + height);
  return { x: Math.floor(x), y: Math.floor(y), width: Math.ceil(right - x), height: Math.ceil(bottom - y) };
}

async function saveGroupShot(page: Page, locators: Locator[], file: string, step: string, state: State, options: RegionOptions = {}): Promise<boolean> {
  if (!locators.length) {
    return false;
  }
  try {
    await dismissPopups(page);
    await scrollIntoViewIfNeeded(page, locators[0], step);
    let clip = await buildClip(page, locators, options);
    if (!clip) {
      return false;
    }
    await page.evaluate((top) => window.scrollTo({ top: Math.max(top - 36, 0), behavior: 'auto' }), clip.y);
    await waitForStableUI(page, step);
    clip = (await buildClip(page, locators, options)) ?? clip;
    await page.screenshot({ path: outputPath(file), type: 'png', clip, animations: 'disabled', caret: 'hide' });
    state.captured.add(file);
    logStep(step, `screenshot saved: ${file}`);
    return true;
  } catch (error) {
    if (locators.length === 1) {
      try {
        await locators[0].screenshot({ path: outputPath(file), type: 'png', animations: 'disabled', caret: 'hide' });
        state.captured.add(file);
        logStep(step, `screenshot saved: ${file} (locator fallback)`);
        return true;
      } catch {
        // fall through to warning below
      }
    }
    logStep(step, `failed to save ${file}: ${safeErrorMessage(error)}`, 'warn');
    return false;
  }
}

async function saveLocatorShot(page: Page, locator: Locator, file: string, step: string, state: State, options: RegionOptions = {}): Promise<boolean> {
  return saveGroupShot(page, [locator], file, step, state, options);
}

async function saveFullPageShot(page: Page, file: string, step: string, state: State): Promise<boolean> {
  try {
    await dismissPopups(page);
    await waitForStableUI(page, step);
    await page.screenshot({ path: outputPath(file), type: 'png', fullPage: true, animations: 'disabled', caret: 'hide' });
    state.captured.add(file);
    logStep(step, `screenshot saved: ${file}`);
    return true;
  } catch (error) {
    logStep(step, `failed to save ${file}: ${safeErrorMessage(error)}`, 'warn');
    return false;
  }
}

async function captureWithFallbacks(
  step: string,
  file: string,
  fallbacks: Array<{ label: string; run: () => Promise<boolean> }>,
): Promise<boolean> {
  for (let index = 0; index < fallbacks.length; index += 1) {
    const fallback = fallbacks[index];
    try {
      if (await fallback.run()) {
        if (index > 0) {
          logStep(step, `fallback used for ${file}: ${fallback.label}`, 'warn');
        }
        return true;
      }
    } catch (error) {
      logStep(step, `${fallback.label} failed: ${safeErrorMessage(error)}`, 'warn');
    }
  }
  return false;
}

function heroCandidates(page: Page): Candidate[] {
  return [
    { label: 'hero section from h1', locator: page.getByRole('heading', { level: 1 }).first().locator('xpath=ancestor::section[1]') },
    { label: 'hero section from browse CTA', locator: page.getByRole('link', { name: /browse all|browse jobs|find jobs|search jobs/i }).first().locator('xpath=ancestor::section[1]') },
    { label: 'first main section', locator: page.locator('main > section').first() },
    { label: 'main region', locator: page.locator('main').first() },
  ];
}

function howItWorksCandidates(page: Page): Candidate[] {
  return [
    { label: 'how-it-works heading section', locator: page.getByRole('heading', { name: /how it works|land your dream job|3 steps|three steps/i }).first().locator('xpath=ancestor::section[1]') },
    { label: 'how-it-works text section', locator: page.locator('section').filter({ hasText: /create your profile|get matched|apply|get hired/i }).first() },
  ];
}

function homepageJobsCandidates(page: Page): Candidate[] {
  return [
    { label: 'homepage jobs section from job title', locator: page.locator('a[href*="/jobs/"] h2, a[href*="/jobs/"] h3').first().locator('xpath=ancestor::section[1]') },
    { label: 'homepage jobs section with job links', locator: page.locator('section').filter({ has: page.locator('a[href*="/jobs/"] h2, a[href*="/jobs/"] h3').first() }).first() },
    { label: 'featured opportunities section', locator: page.getByRole('heading', { name: /featured|opportunit|new jobs daily|all available jobs/i }).first().locator('xpath=ancestor::section[1]') },
  ];
}

function featureCandidates(page: Page): Candidate[] {
  return [
    { label: 'why-joblinca section', locator: page.getByRole('heading', { name: /why joblinca/i }).first().locator('xpath=ancestor::section[1]') },
    { label: 'feature cards section', locator: page.locator('section').filter({ hasText: /salary|reviews|referrals|api/i }).first() },
  ];
}

function jobsHeaderCandidates(page: Page): Candidate[] {
  return [
    { label: 'jobs heading section', locator: page.getByRole('heading', { name: /find the right opportunity|all available jobs|browse jobs|available jobs/i }).first().locator('xpath=ancestor::section[1]') },
    { label: 'opportunity marketplace section', locator: page.locator('section').filter({ hasText: /opportunity marketplace|roles from verified employers/i }).first() },
  ];
}

function jobsListingSectionCandidates(page: Page): Candidate[] {
  return [
    { label: 'jobs listing section from job title', locator: page.locator('main a[href*="/jobs/"] h2, main a[href*="/jobs/"] h3').first().locator('xpath=ancestor::section[1]') },
    { label: 'main jobs region from job title', locator: page.locator('main a[href*="/jobs/"] h2, main a[href*="/jobs/"] h3').first().locator('xpath=ancestor::main[1]') },
    ...homepageJobsCandidates(page),
  ];
}

function jobsCountCandidates(page: Page): Candidate[] {
  return [
    { label: 'jobs count cluster', locator: page.locator('section').filter({ hasText: /jobs[\s\S]*internships[\s\S]*gigs|roles from verified employers/i }).first() },
    { label: 'jobs filter count row', locator: page.getByRole('link', { name: /all opportunities|jobs|educational internships|professional internships|gigs/i }).first().locator('xpath=ancestor::div[1]') },
    { label: 'homepage stats strip', locator: page.locator('section').filter({ hasText: /job seekers access|cities|mtn|orange/i }).first() },
    { label: 'homepage featured jobs intro', locator: page.locator('section').filter({ hasText: /all available|today'?s featured|roles from verified|fresh picks/i }).first() },
  ];
}

function jobCardCandidates(page: Page): Candidate[] {
  return [
    { label: 'job card from title heading', locator: page.locator('main a[href*="/jobs/"] h2, main a[href*="/jobs/"] h3').first().locator('xpath=ancestor::a[1]') },
    { label: 'job card link with title', locator: page.locator('main a[href*="/jobs/"]:has(h2), main a[href*="/jobs/"]:has(h3)').first() },
    { label: 'job card with view opportunity', locator: page.locator('main a[href*="/jobs/"]').filter({ hasText: /view opportunity|view details|apply/i }) },
    { label: 'generic job article', locator: page.locator('main article, main [data-testid*="job" i]') },
  ];
}

function detailCandidates(page: Page): Candidate[] {
  return [
    { label: 'job detail card', locator: page.getByRole('heading', { level: 1 }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]') },
    { label: 'job detail main block', locator: page.getByRole('heading', { level: 1 }).first().locator('xpath=ancestor::div[2]') },
    { label: 'main detail region', locator: page.locator('main, body').first() },
  ];
}

function applyPanelCandidates(page: Page): Candidate[] {
  return [
    { label: 'apply options card', locator: page.getByRole('heading', { name: /apply for this/i }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]') },
    { label: 'opportunity summary card', locator: page.getByRole('heading', { name: /opportunity summary/i }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]') },
    { label: 'external listing card', locator: page.getByText(/external job listing/i).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]') },
  ];
}

function applyCtaCandidates(page: Page): Candidate[] {
  return [
    { label: 'joblinca apply link', locator: page.getByRole('link', { name: /apply with joblinca|continue application|sign in to apply/i }) },
    { label: 'primary apply button', locator: page.getByRole('button', { name: /apply with joblinca|apply on original source|apply on company website|apply via whatsapp|continue application/i }) },
    { label: 'generic apply link', locator: page.getByRole('link', { name: /apply|postuler/i }) },
    { label: 'generic apply button', locator: page.getByRole('button', { name: /apply|postuler/i }) },
  ];
}

function applicationStepCandidates(page: Page): Candidate[] {
  return [
    { label: 'application form', locator: page.locator('form').first() },
    { label: 'application step card', locator: page.getByRole('heading', { name: /apply for|application|contact information|resume|cover letter|submit application/i }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]') },
    { label: 'dialog step', locator: page.locator('[role="dialog"]').first() },
    { label: 'main application region', locator: page.locator('main').filter({ hasText: /resume|cv|contact information|cover letter|submit application|continue/i }).first() },
  ];
}

function authCandidates(page: Page): Candidate[] {
  return [
    { label: 'login form', locator: page.locator('form').filter({ has: page.locator('input[type="password"]') }).first() },
    { label: 'sign-in card', locator: page.getByRole('heading', { name: /sign in|log in|welcome back/i }).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]') },
    { label: 'auth main region', locator: page.locator('main').filter({ hasText: /sign in|log in|continue with google|password/i }).first() },
  ];
}

async function looksLikeJobsPage(page: Page): Promise<boolean> {
  if (isJobDetailUrl(page.url()) || isApplyUrl(page.url())) {
    return false;
  }
  return Boolean(await findFirstVisible(page, [
    ...jobsHeaderCandidates(page),
    ...jobCardCandidates(page),
    { label: 'view opportunity text', locator: page.getByText(/view opportunity/i).first() },
    { label: 'job seeker profiles text', locator: page.getByText(/job seeker profiles/i).first() },
  ], 'jobs.detect.signal', 3_000, true));
}

async function looksLikeHomepageJobsSurface(page: Page): Promise<boolean> {
  if (isJobDetailUrl(page.url()) || isApplyUrl(page.url())) {
    return false;
  }
  return Boolean(await findFirstVisible(page, [
    ...homepageJobsCandidates(page),
    ...jobCardCandidates(page),
    { label: 'featured jobs heading', locator: page.getByRole('heading', { name: /all available|today'?s featured/i }).first() },
    { label: 'view details text', locator: page.getByText(/view details|roles from verified|fresh picks/i).first() },
  ], 'jobs.home.detect', 2_500, true));
}

async function looksLikeDetailPage(page: Page): Promise<boolean> {
  if (isJobDetailUrl(page.url())) {
    return true;
  }
  return Boolean(await findFirstVisible(page, [
    { label: 'back-to-jobs link', locator: page.getByRole('link', { name: /back to jobs/i }) },
    { label: 'apply options heading', locator: page.getByRole('heading', { name: /apply for this/i }) },
    { label: 'opportunity summary heading', locator: page.getByRole('heading', { name: /opportunity summary/i }) },
  ], 'jobs.detail.detect', 2_500, true));
}

async function openHomepageJobsSurface(page: Page, state: State, step: string): Promise<boolean> {
  await navigateWithRetry(page, state.baseUrl, step);
  await waitForHomepageJobsContent(page, step);
  const homeJobs = await waitForVisibleCandidate(page, [
    ...homepageJobsCandidates(page),
    ...jobCardCandidates(page),
  ], `${step}.homepage-surface`, 8_000, 600);
  if (!homeJobs) {
    return false;
  }
  state.jobsPage = { url: page.url(), type: 'homepage-section', selector: homeJobs.label };
  logStep(step, `jobs page detected: ${page.url()} (homepage section via ${homeJobs.label})`);
  return true;
}

async function openJobsPage(page: Page, state: State): Promise<boolean> {
  const step = 'jobs.detect';
  if (state.jobsPage && (await looksLikeJobsPage(page) || await looksLikeHomepageJobsSurface(page))) {
    return true;
  }
  const directJobsUrl = resolveUrl(state.baseUrl, '/jobs');

  try {
    let diagnostics: JobsSurfaceDiagnostics | null = null;
    await withRetry(step, async () => {
      const response = await page.goto(directJobsUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      if (response && response.status() >= 400) {
        throw new Error(`HTTP ${response.status()} while loading ${directJobsUrl}`);
      }
      diagnostics = await waitForJobsContent(page, step);
    }, 2, 1_500);

    if ((diagnostics && hasStrongJobsRouteSignals(diagnostics)) || await looksLikeJobsPage(page)) {
      state.jobsPage = { url: page.url(), type: 'direct-route', selector: directJobsUrl };
      logStep(step, `jobs page detected: ${page.url()} (direct-route via ${diagnostics && hasStrongJobsRouteSignals(diagnostics) ? 'surface diagnostics' : 'locators'})`);
      return true;
    }
    if (diagnostics) {
      logJobsSurface(step, 'direct /jobs route remained below direct-route quality threshold', diagnostics, 'warn');
    }
    logStep(step, 'direct /jobs route loaded but did not expose a reliable listing surface', 'warn');
  } catch (error) {
    logStep(step, `direct /jobs load failed: ${safeErrorMessage(error)}`, 'warn');
  }

  await navigateWithRetry(page, state.baseUrl, step);
  const nav = await findFirstVisible(page, [
    { label: 'stable jobs link', locator: page.locator('a[href="/jobs"], a[href^="/jobs?"], a[href*="/jobs-in/"], a[href="/remote-jobs"], a[href="/global-jobs"]').first() },
    { label: 'browse jobs CTA', locator: page.getByRole('link', { name: /browse all|browse jobs|find jobs|search jobs/i }).first() },
    { label: 'browse jobs button', locator: page.getByRole('button', { name: /browse all|browse jobs|find jobs|search jobs/i }).first() },
  ], step, 3_000);
  if (nav) {
    const href = await nav.locator.getAttribute('href').catch(() => null);
    if (href) {
      await navigateWithRetry(page, resolveUrl(page.url(), href), step);
    } else {
      await withRetry(step, async () => {
        await nav.locator.click({ timeout: 6_000 });
        await waitForStableUI(page, step);
      }, 2, 900);
    }
    await waitForJobsContent(page, step);
    if (await looksLikeJobsPage(page)) {
      state.jobsPage = { url: page.url(), type: 'homepage-link', selector: nav.label };
      logStep(step, `jobs page detected: ${page.url()} (homepage link via ${nav.label})`);
      return true;
    }
  }
  if (await openHomepageJobsSurface(page, state, step)) {
    return true;
  }
  logStep(step, 'jobs page could not be confidently detected', 'warn');
  return false;
}

async function openJobDetailFromListing(page: Page, state: State): Promise<boolean> {
  const step = 'jobs.detail.open';
  logStep(step, 'opening a job detail from listing');
  await openJobsPage(page, state);
  let jobCard = await findFirstVisible(page, jobCardCandidates(page), step, 4_500);
  if (!jobCard && await openHomepageJobsSurface(page, state, step)) {
    jobCard = await findFirstVisible(page, jobCardCandidates(page), `${step}.homepage`, 4_500);
  }
  if (!jobCard) {
    logStep(step, 'no job card found to open', 'warn');
    return false;
  }
  logStep(step, `job card found using ${jobCard.label}`);
  const href = await jobCard.locator.getAttribute('href').catch(() => null);
  if (href) {
    const targetUrl = resolveUrl(page.url(), href);
    if (isJobDetailUrl(targetUrl)) {
      await navigateWithRetry(page, targetUrl, step);
      await waitForDetailContent(page, step);
      if (await looksLikeDetailPage(page)) {
        state.detailUrl = page.url();
        return true;
      }
    }
  }
  await withRetry(step, async () => {
    await jobCard.locator.click({ timeout: 8_000 });
    await waitForStableUI(page, step);
  }, 2, 900).catch((error) => {
    logStep(step, `click into detail failed: ${safeErrorMessage(error)}`, 'warn');
  });
  await waitForDetailContent(page, step);
  if (await looksLikeDetailPage(page)) {
    state.detailUrl = page.url();
    return true;
  }
  logStep(step, 'job detail could not be opened', 'warn');
  return false;
}

async function detectApplyFlow(page: Page, cta: Locator): Promise<{ type: ApplyFlowType; description: string; targetUrl: string | null }> {
  const text = ((await cta.innerText().catch(() => '')) || '').trim().toLowerCase();
  const href = ((await cta.getAttribute('href').catch(() => null)) || '').trim();
  const targetUrl = href ? resolveUrl(page.url(), href) : null;
  if (targetUrl && isApplyUrl(targetUrl)) {
    return { type: 'separate-page', description: 'internal application page', targetUrl };
  }
  if (targetUrl && isAuthUrl(targetUrl)) {
    return { type: 'auth-wall', description: 'sign-in wall before apply', targetUrl };
  }
  if (targetUrl) {
    try {
      if (new URL(targetUrl).origin !== new URL(page.url()).origin) {
        return { type: 'external-url', description: 'external website application', targetUrl };
      }
    } catch {
      // ignore URL parse failure
    }
  }
  if (/whatsapp/.test(text)) return { type: 'whatsapp', description: 'WhatsApp application CTA', targetUrl };
  if (/phone|call/.test(text)) return { type: 'phone', description: 'phone application CTA', targetUrl };
  if (/email/.test(text)) return { type: 'email', description: 'email application CTA', targetUrl };
  if (/original source|company website|external/.test(text)) return { type: 'external-url', description: 'external source application CTA', targetUrl };
  return { type: 'unknown', description: text || 'generic apply CTA', targetUrl };
}

async function captureHomepageHero(page: Page, state: State, file = '01-homepage-hero.png', step = 'homepage.hero', mobile = false): Promise<void> {
  logStep(step, 'starting homepage capture');
  await navigateWithRetry(page, state.baseUrl, step);
  const hero = await findFirstVisible(page, heroCandidates(page), step, 3_500);
  const jobs = await findFirstVisible(page, homepageJobsCandidates(page), step, 2_500);
  const created = await captureWithFallbacks(step, file, [
    { label: hero?.label ?? 'homepage hero', run: async () => hero ? saveLocatorShot(page, hero.locator, file, step, state, { padding: mobile ? 12 : 18, maxHeight: mobile ? 920 : 980 }) : false },
    { label: jobs?.label ?? 'homepage jobs section', run: async () => jobs ? saveLocatorShot(page, jobs.locator, file, step, state, { padding: mobile ? 10 : 18, maxHeight: mobile ? 920 : 900 }) : false },
    { label: 'homepage full-page fallback', run: async () => saveFullPageShot(page, file, step, state) },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function captureHowItWorks(page: Page, state: State): Promise<void> {
  const step = 'homepage.how-it-works';
  const file = '02-homepage-how-it-works.png';
  logStep(step, 'starting how-it-works capture');
  await navigateWithRetry(page, state.baseUrl, step);
  const howItWorks = await findFirstVisible(page, howItWorksCandidates(page), step, 3_500);
  const features = await findFirstVisible(page, featureCandidates(page), step, 2_500);
  const jobs = await findFirstVisible(page, homepageJobsCandidates(page), step, 2_500);
  const created = await captureWithFallbacks(step, file, [
    { label: howItWorks?.label ?? 'how-it-works section', run: async () => howItWorks ? saveLocatorShot(page, howItWorks.locator, file, step, state, { padding: 20, maxHeight: 860 }) : false },
    { label: features?.label ?? 'feature section', run: async () => features ? saveLocatorShot(page, features.locator, file, step, state, { padding: 18, maxHeight: 860 }) : false },
    { label: jobs?.label ?? 'homepage jobs section', run: async () => jobs ? saveLocatorShot(page, jobs.locator, file, step, state, { padding: 18, maxHeight: 900 }) : false },
    { label: 'homepage full-page fallback', run: async () => saveFullPageShot(page, file, step, state) },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function captureJobsListing(page: Page, state: State, file = '03-jobs-listing-page.png', step = 'jobs.listing', mobile = false): Promise<void> {
  logStep(step, 'starting jobs listing capture');
  await openJobsPage(page, state);
  const listingSection = await findFirstVisible(page, jobsListingSectionCandidates(page), `${step}.section`, 4_000);
  const header = await findFirstVisible(page, [...jobsHeaderCandidates(page), ...homepageJobsCandidates(page)], step, 3_500);
  const card = await findFirstVisible(page, jobCardCandidates(page), step, 3_500);
  const saveHomepageJobsSurfaceFallback = async (): Promise<boolean> => {
    if (!(await openHomepageJobsSurface(page, state, `${step}.fallback`))) {
      return false;
    }
    const refreshedSection = await findFirstVisible(page, jobsListingSectionCandidates(page), `${step}.fallback.section`, 3_500);
    return refreshedSection
      ? saveLocatorShot(page, refreshedSection.locator, file, step, state, { padding: mobile ? 12 : 20, maxHeight: mobile ? 940 : 980 })
      : false;
  };
  const created = await captureWithFallbacks(step, file, [
    { label: listingSection?.label ?? 'jobs listing section', run: async () => listingSection ? saveQualifiedLocatorShot(page, listingSection.locator, file, step, state, 'listing', { padding: mobile ? 12 : 20, maxHeight: mobile ? 940 : 980 }) : false },
    { label: 'jobs header plus first card', run: async () => header && card ? saveQualifiedGroupShot(page, [header.locator, card.locator], file, step, state, 'listing', { padding: mobile ? 12 : 20, maxHeight: mobile ? 940 : 920 }) : false },
    { label: header?.label ?? 'jobs header', run: async () => header ? saveQualifiedLocatorShot(page, header.locator, file, step, state, 'listing', { padding: mobile ? 10 : 18, maxHeight: mobile ? 940 : 820 }) : false },
    { label: card?.label ?? 'first job card', run: async () => card ? saveQualifiedLocatorShot(page, card.locator, file, step, state, 'listing', { padding: mobile ? 10 : 16, maxHeight: mobile ? 940 : 760 }) : false },
    { label: 'homepage jobs surface', run: saveHomepageJobsSurfaceFallback },
    {
      label: 'jobs full-page fallback',
      run: async () => {
        const diagnostics = await inspectJobsSurface(page);
        if (!hasMeaningfulJobsSurface(diagnostics)) {
          logJobsSurface(step, 'jobs full-page fallback rejected as sparse surface', diagnostics, 'warn');
          return false;
        }
        return saveFullPageShot(page, file, step, state);
      },
    },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function captureJobsCount(page: Page, state: State): Promise<void> {
  const step = 'jobs.count';
  const file = '04-jobs-count-focus.png';
  logStep(step, 'starting jobs-count proof capture');
  await openJobsPage(page, state);
  const counts = await findFirstVisible(page, jobsCountCandidates(page), step, 3_500);
  const header = await findFirstVisible(page, jobsHeaderCandidates(page), step, 3_000);
  const card = await findFirstVisible(page, jobCardCandidates(page), step, 3_000);
  const saveHomepageCountFallback = async (): Promise<boolean> => {
    if (!(await openHomepageJobsSurface(page, state, `${step}.fallback`))) {
      return false;
    }
    const refreshedCounts = await findFirstVisible(page, jobsCountCandidates(page), `${step}.fallback.counts`, 3_500);
    return refreshedCounts
      ? saveQualifiedLocatorShot(page, refreshedCounts.locator, file, step, state, 'count', { padding: 16, maxHeight: 420 })
      : false;
  };
  const created = await captureWithFallbacks(step, file, [
    { label: counts?.label ?? 'jobs count cluster', run: async () => counts ? saveQualifiedLocatorShot(page, counts.locator, file, step, state, 'count', { padding: 16, maxHeight: 420 }) : false },
    { label: header?.label ?? 'jobs header', run: async () => header ? saveQualifiedLocatorShot(page, header.locator, file, step, state, 'count', { padding: 16, maxHeight: 420 }) : false },
    { label: 'header plus first card proof', run: async () => header && card ? saveQualifiedGroupShot(page, [header.locator, card.locator], file, step, state, 'count', { padding: 18, maxHeight: 520 }) : false },
    { label: 'homepage count proof', run: saveHomepageCountFallback },
    {
      label: 'jobs full-page fallback',
      run: async () => {
        const diagnostics = await inspectJobsSurface(page);
        if (!hasMeaningfulJobsSurface(diagnostics)) {
          logJobsSurface(step, 'jobs full-page fallback rejected as sparse surface', diagnostics, 'warn');
          return false;
        }
        return saveFullPageShot(page, file, step, state);
      },
    },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function captureSingleJobCard(page: Page, state: State): Promise<void> {
  const step = 'jobs.card';
  const file = '05-single-job-card.png';
  logStep(step, 'starting single-job-card capture');
  await openJobsPage(page, state);
  const card = await findFirstVisible(page, jobCardCandidates(page), step, 4_500);
  const header = await findFirstVisible(page, jobsHeaderCandidates(page), step, 2_500);
  if (card) {
    logStep(step, `job card found using ${card.label}`);
  }
  const saveHomepageJobCardFallback = async (): Promise<boolean> => {
    if (!(await openHomepageJobsSurface(page, state, `${step}.fallback`))) {
      return false;
    }
    const refreshedCard = await findFirstVisible(page, jobCardCandidates(page), `${step}.fallback.card`, 4_500);
    if (refreshedCard) {
      logStep(step, `job card found using ${refreshedCard.label} after fallback`);
    }
    return refreshedCard
      ? saveQualifiedLocatorShot(page, refreshedCard.locator, file, step, state, 'card', { padding: 18, maxHeight: 780 })
      : false;
  };
  const created = await captureWithFallbacks(step, file, [
    { label: card?.label ?? 'single job card', run: async () => card ? saveQualifiedLocatorShot(page, card.locator, file, step, state, 'card', { padding: 18, maxHeight: 780 }) : false },
    { label: 'jobs header plus card', run: async () => header && card ? saveQualifiedGroupShot(page, [header.locator, card.locator], file, step, state, 'card', { padding: 18, maxHeight: 860 }) : false },
    { label: header?.label ?? 'jobs header', run: async () => header ? saveQualifiedLocatorShot(page, header.locator, file, step, state, 'card', { padding: 16, maxHeight: 860 }) : false },
    { label: 'homepage job card', run: saveHomepageJobCardFallback },
    {
      label: 'jobs full-page fallback',
      run: async () => {
        const diagnostics = await inspectJobsSurface(page);
        if (!hasMeaningfulJobsSurface(diagnostics)) {
          logJobsSurface(step, 'jobs full-page fallback rejected as sparse surface', diagnostics, 'warn');
          return false;
        }
        return saveFullPageShot(page, file, step, state);
      },
    },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function captureJobDetail(page: Page, state: State): Promise<void> {
  const step = 'jobs.detail';
  const file = '06-single-job-detail-page.png';
  logStep(step, 'starting job-detail capture');
  if (!(await looksLikeDetailPage(page))) {
    await openJobDetailFromListing(page, state);
  }
  const detail = await findFirstVisible(page, detailCandidates(page), step, 3_500);
  const heading = await findFirstVisible(page, [{ label: 'job title heading', locator: page.getByRole('heading', { level: 1 }).first() }, ...detailCandidates(page)], step, 3_500);
  const applyPanel = await findFirstVisible(page, applyPanelCandidates(page), step, 3_500);
  const created = await captureWithFallbacks(step, file, [
    { label: 'detail heading with apply panel', run: async () => heading && applyPanel ? saveGroupShot(page, [heading.locator, applyPanel.locator], file, step, state, { padding: 20, maxHeight: 900 }) : false },
    { label: detail?.label ?? 'detail region', run: async () => detail ? saveLocatorShot(page, detail.locator, file, step, state, { padding: 18, maxHeight: 900 }) : false },
    { label: applyPanel?.label ?? 'apply panel', run: async () => applyPanel ? saveLocatorShot(page, applyPanel.locator, file, step, state, { padding: 18, maxHeight: 860 }) : false },
    { label: 'detail full-page fallback', run: async () => saveFullPageShot(page, file, step, state) },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function captureApplyCTA(page: Page, state: State): Promise<void> {
  const step = 'apply.cta';
  const file = '07-apply-button-focus.png';
  logStep(step, 'starting apply-CTA capture');
  if (!(await looksLikeDetailPage(page))) {
    await openJobDetailFromListing(page, state);
  }
  const cta = await findFirstVisible(page, applyCtaCandidates(page), step, 4_000);
  const panel = await findFirstVisible(page, applyPanelCandidates(page), step, 3_500);
  const closedNotice = await findFirstVisible(page, [{ label: 'closed notice', locator: page.getByText(/no longer accepting applications/i).first() }, ...applyPanelCandidates(page)], step, 2_500);
  if (cta) {
    state.applyFlow = await detectApplyFlow(page, cta.locator);
    logStep(step, `apply flow type detected: ${state.applyFlow.type} (${state.applyFlow.description})`);
  }
  const created = await captureWithFallbacks(step, file, [
    { label: 'apply CTA with panel', run: async () => cta && panel ? saveGroupShot(page, [panel.locator, cta.locator], file, step, state, { padding: 18, maxHeight: 720 }) : false },
    { label: panel?.label ?? 'apply panel', run: async () => panel ? saveLocatorShot(page, panel.locator, file, step, state, { padding: 18, maxHeight: 720 }) : false },
    { label: cta?.label ?? 'apply CTA', run: async () => cta ? saveLocatorShot(page, cta.locator, file, step, state, { padding: 24, maxHeight: 360 }) : false },
    { label: closedNotice?.label ?? 'closed notice', run: async () => closedNotice ? saveLocatorShot(page, closedNotice.locator, file, step, state, { padding: 18, maxHeight: 460 }) : false },
    { label: 'detail full-page fallback', run: async () => saveFullPageShot(page, file, step, state) },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function captureApplicationFlowStep(page: Page, state: State): Promise<void> {
  const step = 'apply.flow';
  const file = '08-application-flow-step.png';
  logStep(step, 'starting application-flow capture');
  if (!(await looksLikeDetailPage(page))) {
    await openJobDetailFromListing(page, state);
  }
  const cta = await findFirstVisible(page, applyCtaCandidates(page), step, 4_000);
  const panel = await findFirstVisible(page, applyPanelCandidates(page), step, 3_500);
  const external = await findFirstVisible(page, [{ label: 'external listing card', locator: page.getByText(/external job listing/i).first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]') }, ...applyPanelCandidates(page)], step, 3_000);
  const safeFallback = async () => captureWithFallbacks(step, file, [
    { label: external?.label ?? 'external context', run: async () => external ? saveLocatorShot(page, external.locator, file, step, state, { padding: 18, maxHeight: 760 }) : false },
    { label: panel?.label ?? 'apply panel', run: async () => panel ? saveLocatorShot(page, panel.locator, file, step, state, { padding: 18, maxHeight: 760 }) : false },
    { label: 'detail full-page fallback', run: async () => saveFullPageShot(page, file, step, state) },
  ]);
  if (!cta) {
    if (!(await safeFallback())) throw new Error(`failed to create ${file}`);
    return;
  }
  state.applyFlow = state.applyFlow ?? await detectApplyFlow(page, cta.locator);
  logStep(step, `apply flow type detected: ${state.applyFlow.type} (${state.applyFlow.description})`);
  if (['external-url', 'email', 'phone', 'whatsapp'].includes(state.applyFlow.type)) {
    if (!(await safeFallback())) throw new Error(`failed to create ${file}`);
    return;
  }
  if (state.applyFlow.targetUrl && (state.applyFlow.type === 'separate-page' || state.applyFlow.type === 'auth-wall')) {
    await navigateWithRetry(page, state.applyFlow.targetUrl, step);
    await waitForApplyOrAuthContent(page, step);
    const appStep = await findFirstVisible(page, applicationStepCandidates(page), step, 4_000);
    const authStep = await findFirstVisible(page, authCandidates(page), step, 4_000);
    const created = await captureWithFallbacks(step, file, [
      { label: appStep?.label ?? 'application step', run: async () => appStep ? saveLocatorShot(page, appStep.locator, file, step, state, { padding: 18, maxHeight: 960 }) : false },
      { label: authStep?.label ?? 'auth wall', run: async () => authStep ? saveLocatorShot(page, authStep.locator, file, step, state, { padding: 18, maxHeight: 900 }) : false },
      { label: 'current page full-page fallback', run: async () => saveFullPageShot(page, file, step, state) },
    ]);
    if (!created) throw new Error(`failed to create ${file}`);
    return;
  }
  await withRetry(step, async () => {
    await cta.locator.click({ timeout: 8_000 });
    await waitForStableUI(page, step);
  }, 2, 900).catch((error) => {
    logStep(step, `CTA click failed, using safe fallback: ${safeErrorMessage(error)}`, 'warn');
  });
  await waitForApplyOrAuthContent(page, step);
  const dialog = await findFirstVisible(page, [{ label: 'dialog', locator: page.locator('[role="dialog"]').first() }], step, 2_500);
  const appStep = await findFirstVisible(page, applicationStepCandidates(page), step, 4_000);
  const authStep = await findFirstVisible(page, authCandidates(page), step, 4_000);
  if (dialog) {
    state.applyFlow = { type: 'modal', description: 'application opened in a dialog', targetUrl: null };
    logStep(step, 'apply flow type detected: modal');
  } else if (authStep || isAuthUrl(page.url())) {
    state.applyFlow = { type: 'auth-wall', description: 'sign-in wall after CTA click', targetUrl: page.url() };
    logStep(step, 'apply flow type detected: auth-wall');
  } else if (appStep || isApplyUrl(page.url())) {
    state.applyFlow = { type: 'separate-page', description: 'application step became visible', targetUrl: page.url() };
    logStep(step, 'apply flow type detected: separate-page');
  }
  const created = await captureWithFallbacks(step, file, [
    { label: dialog?.label ?? 'modal dialog', run: async () => dialog ? saveLocatorShot(page, dialog.locator, file, step, state, { padding: 18, maxHeight: 920 }) : false },
    { label: appStep?.label ?? 'application step', run: async () => appStep ? saveLocatorShot(page, appStep.locator, file, step, state, { padding: 18, maxHeight: 960 }) : false },
    { label: authStep?.label ?? 'auth wall', run: async () => authStep ? saveLocatorShot(page, authStep.locator, file, step, state, { padding: 18, maxHeight: 900 }) : false },
    { label: 'current page full-page fallback', run: async () => saveFullPageShot(page, file, step, state) },
  ]);
  if (!created) throw new Error(`failed to create ${file}`);
}

async function runStep(step: string, errors: string[], action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = safeErrorMessage(error);
    errors.push(`${step}: ${message}`);
    logStep(step, `step failed but continuing: ${message}`, 'error');
  }
}

async function captureDesktopShots(browser: Browser, captured: Set<string>, errors: string[]): Promise<void> {
  logStep('desktop', 'starting desktop capture flow');

  const homeContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT, locale: 'en-US', colorScheme: 'dark' });
  homeContext.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  homeContext.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const homePage = await homeContext.newPage();
  const homeState: State = { baseUrl: BASE_URL, captured, jobsPage: null, detailUrl: null, applyFlow: null };

  try {
    await runStep('homepage.hero', errors, async () => captureHomepageHero(homePage, homeState));
    await runStep('homepage.how-it-works', errors, async () => captureHowItWorks(homePage, homeState));
  } finally {
    await homeContext.close();
  }

  const jobsContext = await browser.newContext({ viewport: DESKTOP_VIEWPORT, locale: 'en-US', colorScheme: 'dark' });
  jobsContext.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  jobsContext.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const jobsPage = await jobsContext.newPage();
  const jobsState: State = { baseUrl: BASE_URL, captured, jobsPage: null, detailUrl: null, applyFlow: null };

  try {
    await runStep('jobs.listing', errors, async () => captureJobsListing(jobsPage, jobsState));
    await runStep('jobs.count', errors, async () => captureJobsCount(jobsPage, jobsState));
    await runStep('jobs.card', errors, async () => captureSingleJobCard(jobsPage, jobsState));
    await runStep('jobs.detail', errors, async () => captureJobDetail(jobsPage, jobsState));
    await runStep('apply.cta', errors, async () => captureApplyCTA(jobsPage, jobsState));
    await runStep('apply.flow', errors, async () => captureApplicationFlowStep(jobsPage, jobsState));
  } finally {
    await jobsContext.close();
  }
}

async function captureMobileShots(browser: Browser, captured: Set<string>, errors: string[]): Promise<void> {
  const context = await browser.newContext({ ...MOBILE_DEVICE, locale: 'en-US', colorScheme: 'dark' });
  context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  const page = await context.newPage();
  const state: State = { baseUrl: BASE_URL, captured, jobsPage: null, detailUrl: null, applyFlow: null };
  try {
    logStep('mobile', 'starting mobile capture flow');
    await runStep('mobile.homepage', errors, async () => captureHomepageHero(page, state, '09-mobile-homepage.png', 'mobile.homepage', true));
    await runStep('mobile.jobs', errors, async () => captureJobsListing(page, state, '10-mobile-jobs-page.png', 'mobile.jobs', true));
  } finally {
    await context.close();
  }
}

async function writeManifest(): Promise<void> {
  await fs.writeFile(outputPath('manifest.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`, 'utf8');
  logStep('manifest', 'manifest saved');
}

async function verifyRequiredOutputs(): Promise<string[]> {
  const missing: string[] = [];
  for (const entry of MANIFEST) {
    if (!(await fileExists(outputPath(entry.file)))) {
      missing.push(entry.file);
    }
  }
  return missing;
}

async function main(): Promise<void> {
  await ensureDir(OUTPUT_DIR);
  await resetOutputs();
  await writeManifest();
  const browser = await chromium.launch({ headless: true });
  const captured = new Set<string>();
  const errors: string[] = [];
  try {
    await captureDesktopShots(browser, captured, errors);
    await captureMobileShots(browser, captured, errors);
    await writeManifest();
    const missing = await verifyRequiredOutputs();
    if (missing.length > 0) {
      logStep('verify', `missing required files: ${missing.join(', ')}`, 'error');
      process.exitCode = 1;
    } else {
      logStep('verify', 'all required screenshot files were created');
    }
    if (errors.length > 0) {
      logStep('verify', `${errors.length} step(s) used fallbacks or failed but the run continued`, 'warn');
      for (const error of errors) {
        logStep('verify', error, 'warn');
      }
    }
    logStep('done', `screenshots saved to ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  logStep('fatal', safeErrorMessage(error), 'error');
  await ensureDir(OUTPUT_DIR).catch(() => undefined);
  await writeManifest().catch(() => undefined);
  process.exit(1);
});
