import fs from 'fs/promises';
import path from 'path';

import type { JobImageVariation, NormalizedJobImageInput } from './types';

export const JOB_MARKETING_TEMPLATE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1080, initial-scale=1" />
  <style>
    :root { color-scheme: only light; }
    * { box-sizing: border-box; }
    html, body {
      width: 1080px;
      height: 1920px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #081425;
    }
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: #f6f7fb;
    }
    .poster {
      position: relative;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      padding: 72px;
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(circle at 12% 12%, rgba(255, 125, 46, 0.42), transparent 28%),
        radial-gradient(circle at 92% 8%, rgba(79, 189, 255, 0.22), transparent 26%),
        radial-gradient(circle at 80% 82%, rgba(36, 180, 126, 0.18), transparent 24%),
        linear-gradient(165deg, #071220 0%, #0d2740 48%, #07121e 100%);
    }
    .poster::before {
      content: "";
      position: absolute;
      inset: 28px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 44px;
      pointer-events: none;
    }
    .glow {
      position: absolute;
      border-radius: 999px;
      opacity: 0.6;
    }
    .glow.one {
      top: 108px;
      right: -120px;
      width: 360px;
      height: 360px;
      background: rgba(255, 152, 65, 0.1);
    }
    .glow.two {
      bottom: 280px;
      left: -120px;
      width: 400px;
      height: 400px;
      background: rgba(57, 160, 255, 0.1);
    }
    .top-row {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 18px 28px;
      border-radius: 999px;
      background: linear-gradient(135deg, #ff7f32, #ffb13c);
      color: #11213a;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.18);
    }
    .badge-dot {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #11213a;
    }
    .brand {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      min-height: 56px;
    }
    .brand img {
      max-width: 220px;
      max-height: 56px;
      object-fit: contain;
      filter: brightness(0) invert(1);
      opacity: 0.95;
    }
    .brand-fallback {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .headline {
      position: relative;
      z-index: 1;
      margin: 38px 0 18px;
      max-width: 840px;
      color: #ffd29e;
      font-size: {{headline_font_size}}px;
      line-height: 1.02;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .panel {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 32px;
      padding: 48px;
      margin-top: 12px;
      border-radius: 40px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
      backdrop-filter: blur(24px);
      box-shadow: 0 32px 72px rgba(0, 0, 0, 0.22);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .company {
      font-size: 30px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: #88d7ff;
    }
    .title {
      margin: 0;
      max-width: 860px;
      font-size: {{title_font_size}}px;
      line-height: 0.92;
      letter-spacing: -0.05em;
      font-weight: 800;
    }
    .meta-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
    }
    .meta-pill {
      display: inline-flex;
      align-items: center;
      padding: 18px 24px;
      border-radius: 999px;
      background: rgba(8, 24, 42, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 32px;
      font-weight: 600;
      color: #f3f8ff;
    }
    .salary-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 28px 32px;
      border-radius: 32px;
      background: linear-gradient(135deg, rgba(36, 200, 138, 0.88), rgba(16, 153, 211, 0.82));
      color: #041321;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.18);
    }
    .salary-label {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      opacity: 0.9;
    }
    .salary-value {
      font-size: 72px;
      line-height: 0.95;
      font-weight: 800;
      letter-spacing: -0.04em;
    }
    .spacer {
      flex: 1;
      min-height: 48px;
    }
    .cta-panel {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 36px 40px;
      border-radius: 32px;
      background: rgba(255, 255, 255, 0.94);
      color: #0a1830;
      box-shadow: 0 22px 52px rgba(0, 0, 0, 0.18);
    }
    .cta-copy {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cta-kicker {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #ff7f32;
    }
    .cta-main {
      font-size: 46px;
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .cta-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 96px;
      height: 96px;
      border-radius: 28px;
      background: linear-gradient(135deg, #ff7f32, #ffb13c);
      color: #0b1c35;
      font-size: 54px;
      font-weight: 900;
    }
    .footer {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin-top: 24px;
      font-size: 24px;
      color: rgba(255, 255, 255, 0.76);
    }
    .footer-url {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <main id="joblinca-job-card" class="poster">
    <div class="glow one"></div>
    <div class="glow two"></div>
    <div class="top-row">
      <div class="badge"><span class="badge-dot"></span>{{badge_text}}</div>
      <div class="brand">{{brand_markup}}</div>
    </div>
    <p class="headline">{{headline}}</p>
    <section class="panel">
      <div class="company">{{company}}</div>
      <h1 class="title">{{title}}</h1>
      <div class="meta-grid">
        <div class="meta-pill">{{location}}</div>
        <div class="meta-pill">{{type}}</div>
      </div>
      <div class="salary-card">
        <span class="salary-label">Salary</span>
        <span class="salary-value">{{salary}}</span>
      </div>
    </section>
    <div class="spacer"></div>
    <section class="cta-panel">
      <div class="cta-copy">
        <span class="cta-kicker">Joblinca Career Alert</span>
        <span class="cta-main">{{cta_text}}</span>
      </div>
      <div class="cta-arrow">&rarr;</div>
    </section>
    <footer class="footer">
      <span>Built for fast-moving social campaigns and mobile-first hiring.</span>
      <span class="footer-url">Joblinca.com</span>
    </footer>
  </main>
</body>
</html>`;

let brandDataUrlPromise: Promise<string | null> | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replacePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([\w_]+)\s*}}/g, (_, key: string) => values[key] ?? '');
}

function titleFontSizeFor(title: string): number {
  if (title.length <= 18) return 128;
  if (title.length <= 28) return 118;
  if (title.length <= 38) return 104;
  if (title.length <= 52) return 92;
  return 80;
}

function headlineFontSizeFor(headline: string): number {
  if (headline.length <= 28) return 54;
  if (headline.length <= 48) return 46;
  if (headline.length <= 70) return 40;
  return 34;
}

async function getBrandDataUrl(): Promise<string | null> {
  if (!brandDataUrlPromise) {
    brandDataUrlPromise = fs
      .readFile(path.join(process.cwd(), 'public', 'assets', 'logo-wordmark.png'))
      .then((buffer) => `data:image/png;base64,${buffer.toString('base64')}`)
      .catch(() => null);
  }

  return brandDataUrlPromise;
}

function buildBrandMarkup(brandDataUrl: string | null): string {
  if (!brandDataUrl) {
    return '<span class="brand-fallback">Joblinca</span>';
  }

  return `<img src="${brandDataUrl}" alt="Joblinca" />`;
}

export function buildJobImageVariations(
  job: NormalizedJobImageInput,
  variationCount: number
): JobImageVariation[] {
  const variants: JobImageVariation[] = [
    {
      key: 'urgent-location',
      headline: `Urgent hiring in ${job.location}`,
      badgeText: 'Urgent Hiring',
      ctaText: 'Apply on Joblinca.com',
    },
    {
      key: 'needed-now',
      headline: `${job.title} needed now`,
      badgeText: 'Urgent Hiring',
      ctaText: 'Apply on Joblinca.com',
    },
    {
      key: 'apply-today',
      headline: `Apply today for this ${job.title} role`,
      badgeText: 'Urgent Hiring',
      ctaText: 'Apply on Joblinca.com',
    },
  ];

  return variants.slice(0, variationCount);
}

export async function buildJobImageHtml(
  job: NormalizedJobImageInput,
  variation: JobImageVariation
): Promise<string> {
  const brandMarkup = buildBrandMarkup(await getBrandDataUrl());

  return replacePlaceholders(JOB_MARKETING_TEMPLATE, {
    badge_text: escapeHtml(variation.badgeText),
    brand_markup: brandMarkup,
    headline: escapeHtml(variation.headline),
    company: escapeHtml(job.company),
    title: escapeHtml(job.title),
    location: escapeHtml(job.location),
    type: escapeHtml(job.type),
    salary: escapeHtml(job.salary),
    cta_text: escapeHtml(variation.ctaText),
    title_font_size: String(titleFontSizeFor(job.title)),
    headline_font_size: String(headlineFontSizeFor(variation.headline)),
  });
}
