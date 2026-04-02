import { chromium, type Browser } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      chromiumSandbox: false,
      args: ['--disable-dev-shm-usage'],
    });
  }

  try {
    return await browserPromise;
  } catch (error) {
    browserPromise = null;
    throw error;
  }
}

export async function renderHtmlToPng(
  html: string,
  width: number,
  height: number
): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });

  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      if ('fonts' in document) {
        await document.fonts.ready;
      }
    });

    const card = page.locator('#joblinca-job-card');
    await card.waitFor();
    return Buffer.from(await card.screenshot({ type: 'png' }));
  } finally {
    await context.close().catch(() => {});
  }
}

export async function closeJobImageBrowser(): Promise<void> {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise.catch(() => null);
  browserPromise = null;

  if (browser) {
    await browser.close().catch(() => {});
  }
}
