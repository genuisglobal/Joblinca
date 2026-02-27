import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import type { ResumeData } from './resume';

// ─────────────────────────────────────────────────────────────
// PAGE CONSTANTS
// ─────────────────────────────────────────────────────────────
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const LINE_H = 16;
const SECTION_GAP = 18;

// ─────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────
interface Ctx {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  y: number;
  doc: PDFDocument;
}

// ─────────────────────────────────────────────────────────────
// SHARED UTILITIES
// ─────────────────────────────────────────────────────────────

function newPage(ctx: Ctx): Ctx {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  return { ...ctx, page, y: PAGE_H - MARGIN };
}

function ensureSpace(ctx: Ctx, needed: number): Ctx {
  return ctx.y - needed < MARGIN ? newPage(ctx) : ctx;
}

/** Split text into lines that fit within maxWidth at the given font+size. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Draw wrapped body text, paginating automatically. */
function drawWrapped(
  ctx: Ctx,
  text: string,
  x: number,
  maxWidth: number,
  size: number,
  color = rgb(0.15, 0.15, 0.15),
  font?: PDFFont,
): Ctx {
  const f = font ?? ctx.font;
  for (const line of wrapText(text, f, size, maxWidth)) {
    ctx = ensureSpace(ctx, LINE_H);
    ctx.page.drawText(line, { x, y: ctx.y, size, font: f, color });
    ctx.y -= LINE_H;
  }
  return ctx;
}

/** Standard blue section header with underline (Professional / Modern). */
function sectionHeader(ctx: Ctx, title: string, x: number, width: number, color = rgb(0.15, 0.35, 0.60)): Ctx {
  ctx.y -= SECTION_GAP / 2;
  ctx = ensureSpace(ctx, LINE_H + 8);
  ctx.page.drawText(title.toUpperCase(), { x, y: ctx.y, size: 9, font: ctx.boldFont, color });
  ctx.y -= 5;
  ctx.page.drawLine({ start: { x, y: ctx.y }, end: { x: x + width, y: ctx.y }, thickness: 0.75, color });
  ctx.y -= LINE_H - 2;
  return ctx;
}

/** Draw a horizontal rule line. */
function hRule(ctx: Ctx, x: number, width: number, color = rgb(0.75, 0.75, 0.75), thickness = 0.5): void {
  ctx.page.drawLine({ start: { x, y: ctx.y }, end: { x: x + width, y: ctx.y }, thickness, color });
}

/** Right-align text at a given x edge. */
function drawRight(page: PDFPage, text: string, rightEdge: number, y: number, size: number, font: PDFFont, color = rgb(0.4, 0.4, 0.4)): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightEdge - w, y, size, font, color });
}

/** Center text within the page width. */
function drawCenter(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = rgb(1, 1, 1)): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_W - w) / 2, y, size, font, color });
}

/** Format date string for experience / education. */
function dateRange(start: string, end: string, current: boolean): string {
  return current ? `${start} – Present` : [start, end].filter(Boolean).join(' – ');
}

/** Render bullet description lines, wrapping each one. */
function drawBullets(ctx: Ctx, description: string, x: number, maxWidth: number, size: number): Ctx {
  const lines = description.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const bullet = /^[-•]/.test(line) ? line.replace(/^[-•]\s*/, '• ') : `• ${line}`;
    ctx = drawWrapped(ctx, bullet, x, maxWidth, size);
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE 1: PROFESSIONAL  (single column, classic blue)
// ─────────────────────────────────────────────────────────────
export async function renderProfessionalPdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const CW = PAGE_W - 2 * MARGIN;
  const BLUE = rgb(0.15, 0.35, 0.60);

  let ctx: Ctx = { page, font, boldFont, y: PAGE_H - MARGIN, doc };

  // Name
  ctx.page.drawText(data.fullName || 'Your Name', {
    x: MARGIN, y: ctx.y, size: 22, font: boldFont, color: rgb(0.08, 0.08, 0.08),
  });
  ctx.y -= 26;

  // Title
  if (data.title) {
    ctx.page.drawText(data.title, { x: MARGIN, y: ctx.y, size: 11, font, color: rgb(0.35, 0.35, 0.35) });
    ctx.y -= LINE_H;
  }

  // Contact (wrap if too long)
  const contactParts = [data.email, data.phone, data.location].filter(Boolean);
  if (contactParts.length > 0) {
    const contactStr = contactParts.join('  |  ');
    if (font.widthOfTextAtSize(contactStr, 9) <= CW) {
      ctx.page.drawText(contactStr, { x: MARGIN, y: ctx.y, size: 9, font, color: rgb(0.40, 0.40, 0.40) });
      ctx.y -= LINE_H + 2;
    } else {
      // wrap each item on its own line
      for (const part of contactParts) {
        ctx.page.drawText(part, { x: MARGIN, y: ctx.y, size: 9, font, color: rgb(0.40, 0.40, 0.40) });
        ctx.y -= LINE_H;
      }
      ctx.y -= 2;
    }
  }

  if (data.summary) {
    ctx = sectionHeader(ctx, 'Professional Summary', MARGIN, CW, BLUE);
    ctx = drawWrapped(ctx, data.summary, MARGIN, CW, 10);
  }

  if (data.experience.length > 0) {
    ctx = sectionHeader(ctx, 'Experience', MARGIN, CW, BLUE);
    for (const exp of data.experience) {
      ctx = ensureSpace(ctx, LINE_H * 3);
      ctx.page.drawText(exp.role, { x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
      ctx.y -= LINE_H;
      ctx.page.drawText(`${exp.company}  |  ${dateRange(exp.startDate, exp.endDate, exp.current)}`, {
        x: MARGIN, y: ctx.y, size: 9, font, color: rgb(0.42, 0.42, 0.42),
      });
      ctx.y -= LINE_H;
      if (exp.description) ctx = drawBullets(ctx, exp.description, MARGIN + 10, CW - 10, 9);
      ctx.y -= 5;
    }
  }

  if (data.education.length > 0) {
    ctx = sectionHeader(ctx, 'Education', MARGIN, CW, BLUE);
    for (const edu of data.education) {
      ctx = ensureSpace(ctx, LINE_H * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1),
      });
      ctx.y -= LINE_H;
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
      ctx.page.drawText(`${edu.institution}${dates ? `  |  ${dates}` : ''}`, {
        x: MARGIN, y: ctx.y, size: 9, font, color: rgb(0.42, 0.42, 0.42),
      });
      ctx.y -= LINE_H + 4;
    }
  }

  if (data.skills.length > 0) {
    ctx = sectionHeader(ctx, 'Skills', MARGIN, CW, BLUE);
    ctx = drawWrapped(ctx, data.skills.join('  •  '), MARGIN, CW, 10);
  }

  if (data.languages.length > 0) {
    ctx = sectionHeader(ctx, 'Languages', MARGIN, CW, BLUE);
    ctx = drawWrapped(ctx, data.languages.map(l => `${l.language} (${l.proficiency})`).join('  •  '), MARGIN, CW, 10);
  }

  if (data.certifications.length > 0) {
    ctx = sectionHeader(ctx, 'Certifications', MARGIN, CW, BLUE);
    for (const cert of data.certifications) {
      ctx = drawWrapped(ctx, `• ${[cert.name, cert.issuer, cert.date].filter(Boolean).join('  |  ')}`, MARGIN, CW, 10);
    }
  }

  return doc.save();
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE 2: MODERN  (dark navy sidebar + paginated sidebar bg)
// ─────────────────────────────────────────────────────────────
export async function renderModernPdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const SB_W = 175; // sidebar width
  const SB_X = 28;
  const MAIN_X = SB_W + 42;
  const MAIN_W = PAGE_W - MAIN_X - 35;
  const SB_COLOR = rgb(0.12, 0.16, 0.22);
  const SB_TEXT = rgb(0.85, 0.85, 0.85);
  const SB_DIM = rgb(0.60, 0.60, 0.60);
  const SB_HEAD = rgb(0.50, 0.70, 0.92);
  const BLUE = rgb(0.15, 0.35, 0.60);

  function drawSidebarBg(page: PDFPage): void {
    page.drawRectangle({ x: 0, y: 0, width: SB_W + 14, height: PAGE_H, color: SB_COLOR });
  }

  // Create first page with sidebar
  const firstPage = doc.addPage([PAGE_W, PAGE_H]);
  drawSidebarBg(firstPage);

  // ── Sidebar content ──
  let sideY = PAGE_H - MARGIN;

  function sbDraw(text: string, size: number, isBold: boolean, textColor = SB_TEXT): void {
    for (const line of wrapText(text, isBold ? boldFont : font, size, SB_W - 20)) {
      if (sideY < MARGIN) return;
      firstPage.drawText(line, { x: SB_X, y: sideY, size, font: isBold ? boldFont : font, color: textColor });
      sideY -= size + 4;
    }
  }

  function sbSection(title: string): void {
    sideY -= 8;
    if (sideY < MARGIN) return;
    firstPage.drawText(title.toUpperCase(), { x: SB_X, y: sideY, size: 8, font: boldFont, color: SB_HEAD });
    sideY -= 3;
    firstPage.drawLine({ start: { x: SB_X, y: sideY }, end: { x: SB_X + SB_W - 20, y: sideY }, thickness: 0.5, color: SB_HEAD });
    sideY -= 12;
  }

  // Name + title
  sbDraw(data.fullName || 'Your Name', 15, true, rgb(1, 1, 1));
  if (data.title) { sideY += 2; sbDraw(data.title, 9, false, rgb(0.70, 0.82, 0.93)); }
  sideY -= 6;

  // Contact
  sbSection('Contact');
  if (data.email) sbDraw(data.email, 8.5, false);
  if (data.phone) sbDraw(data.phone, 8.5, false);
  if (data.location) sbDraw(data.location, 8.5, false);

  // Skills
  if (data.skills.length > 0) {
    sbSection('Skills');
    for (const sk of data.skills) {
      if (sideY < MARGIN) break;
      sbDraw(`• ${sk}`, 8.5, false);
    }
  }

  // Languages
  if (data.languages.length > 0) {
    sbSection('Languages');
    for (const l of data.languages) {
      if (sideY < MARGIN) break;
      sbDraw(`${l.language}`, 8.5, true, SB_TEXT);
      sideY += 2;
      sbDraw(l.proficiency, 7.5, false, SB_DIM);
    }
  }

  // Certifications
  if (data.certifications.length > 0) {
    sbSection('Certifications');
    for (const c of data.certifications) {
      if (sideY < MARGIN) break;
      sbDraw(c.name, 8.5, true, SB_TEXT);
      if (c.issuer) { sideY += 2; sbDraw(c.issuer, 7.5, false, SB_DIM); }
    }
  }

  // ── Main content ──
  // Wrap newPage to also draw sidebar bg
  function newModernPage(ctx: Ctx): Ctx {
    const p = ctx.doc.addPage([PAGE_W, PAGE_H]);
    drawSidebarBg(p);
    return { ...ctx, page: p, y: PAGE_H - MARGIN };
  }

  function ensureModern(ctx: Ctx, needed: number): Ctx {
    return ctx.y - needed < MARGIN ? newModernPage(ctx) : ctx;
  }

  function mainSection(ctx: Ctx, title: string): Ctx {
    ctx.y -= SECTION_GAP / 2;
    ctx = ensureModern(ctx, LINE_H + 8);
    ctx.page.drawText(title.toUpperCase(), { x: MAIN_X, y: ctx.y, size: 9, font: boldFont, color: BLUE });
    ctx.y -= 5;
    ctx.page.drawLine({ start: { x: MAIN_X, y: ctx.y }, end: { x: MAIN_X + MAIN_W, y: ctx.y }, thickness: 0.75, color: BLUE });
    ctx.y -= LINE_H - 2;
    return ctx;
  }

  let ctx: Ctx = { page: firstPage, font, boldFont, y: PAGE_H - MARGIN, doc };

  if (data.summary) {
    ctx = mainSection(ctx, 'Profile');
    ctx = drawWrapped(ctx, data.summary, MAIN_X, MAIN_W, 10);
  }

  if (data.experience.length > 0) {
    ctx = mainSection(ctx, 'Experience');
    for (const exp of data.experience) {
      ctx = ensureModern(ctx, LINE_H * 3);
      ctx.page.drawText(exp.role, { x: MAIN_X, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
      ctx.y -= LINE_H;
      ctx.page.drawText(`${exp.company}  |  ${dateRange(exp.startDate, exp.endDate, exp.current)}`, {
        x: MAIN_X, y: ctx.y, size: 9, font, color: rgb(0.42, 0.42, 0.42),
      });
      ctx.y -= LINE_H;
      if (exp.description) ctx = drawBullets(ctx, exp.description, MAIN_X + 10, MAIN_W - 10, 9);
      ctx.y -= 5;
    }
  }

  if (data.education.length > 0) {
    ctx = mainSection(ctx, 'Education');
    for (const edu of data.education) {
      ctx = ensureModern(ctx, LINE_H * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MAIN_X, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1),
      });
      ctx.y -= LINE_H;
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
      ctx.page.drawText(`${edu.institution}${dates ? `  |  ${dates}` : ''}`, {
        x: MAIN_X, y: ctx.y, size: 9, font, color: rgb(0.42, 0.42, 0.42),
      });
      ctx.y -= LINE_H + 4;
    }
  }

  return doc.save();
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE 3: EXECUTIVE  (full-width navy header, Times Roman, right-aligned dates)
// ─────────────────────────────────────────────────────────────
export async function renderExecutivePdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await doc.embedFont(StandardFonts.TimesRomanBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const NAVY = rgb(0.09, 0.13, 0.27);
  const GOLD = rgb(0.72, 0.58, 0.26);
  const WHITE = rgb(1, 1, 1);
  const DARK = rgb(0.10, 0.10, 0.10);
  const MED = rgb(0.38, 0.38, 0.38);
  const CW = PAGE_W - 2 * MARGIN;
  const HEADER_H = 98;

  // Gold top accent bar
  page.drawRectangle({ x: 0, y: PAGE_H - 5, width: PAGE_W, height: 5, color: GOLD });
  // Navy header
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H - 5, color: NAVY });

  // Name centered
  const name = data.fullName || 'Your Name';
  drawCenter(page, name, PAGE_H - 38, 22, boldFont, WHITE);

  // Title centered
  if (data.title) drawCenter(page, data.title, PAGE_H - 56, 11, font, rgb(0.74, 0.82, 0.93));

  // Contact centered
  const cParts = [data.email, data.phone, data.location].filter(Boolean);
  if (cParts.length > 0) {
    const cStr = cParts.join('  ·  ');
    const cSize = font.widthOfTextAtSize(cStr, 8.5) > CW ? 7.5 : 8.5;
    drawCenter(page, cStr, PAGE_H - 74, cSize, font, rgb(0.65, 0.73, 0.84));
  }

  // Gold bottom rule of header
  page.drawLine({ start: { x: MARGIN, y: PAGE_H - HEADER_H - 1 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - HEADER_H - 1 }, thickness: 0.75, color: GOLD });

  let ctx: Ctx = { page, font, boldFont, y: PAGE_H - HEADER_H - 14, doc };

  function execSection(ctx: Ctx, title: string): Ctx {
    ctx.y -= SECTION_GAP / 2;
    ctx = ensureSpace(ctx, LINE_H + 8);
    ctx.page.drawText(title.toUpperCase(), { x: MARGIN, y: ctx.y, size: 9, font: boldFont, color: NAVY });
    ctx.y -= 5;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y }, thickness: 0.75, color: NAVY });
    ctx.y -= LINE_H - 2;
    return ctx;
  }

  if (data.summary) {
    ctx = execSection(ctx, 'Professional Summary');
    ctx = drawWrapped(ctx, data.summary, MARGIN, CW, 10, rgb(0.15, 0.15, 0.15), font);
  }

  if (data.experience.length > 0) {
    ctx = execSection(ctx, 'Professional Experience');
    for (const exp of data.experience) {
      ctx = ensureSpace(ctx, LINE_H * 3);
      ctx.page.drawText(exp.role, { x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: DARK });
      drawRight(ctx.page, dateRange(exp.startDate, exp.endDate, exp.current), PAGE_W - MARGIN, ctx.y, 9, font, MED);
      ctx.y -= LINE_H;
      ctx.page.drawText(exp.company, { x: MARGIN, y: ctx.y, size: 9, font, color: NAVY });
      ctx.y -= LINE_H;
      if (exp.description) ctx = drawBullets(ctx, exp.description, MARGIN + 10, CW - 10, 9);
      ctx.y -= 5;
    }
  }

  if (data.education.length > 0) {
    ctx = execSection(ctx, 'Education');
    for (const edu of data.education) {
      ctx = ensureSpace(ctx, LINE_H * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: DARK,
      });
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
      if (dates) drawRight(ctx.page, dates, PAGE_W - MARGIN, ctx.y, 9, font, MED);
      ctx.y -= LINE_H;
      ctx.page.drawText(edu.institution, { x: MARGIN, y: ctx.y, size: 9, font, color: NAVY });
      ctx.y -= LINE_H + 4;
    }
  }

  if (data.skills.length > 0) {
    ctx = execSection(ctx, 'Core Competencies');
    ctx = drawWrapped(ctx, data.skills.join('   ·   '), MARGIN, CW, 10, rgb(0.15, 0.15, 0.15), font);
  }

  if (data.languages.length > 0 || data.certifications.length > 0) {
    ctx = execSection(ctx, 'Languages & Certifications');
    if (data.languages.length > 0) {
      ctx = drawWrapped(ctx, data.languages.map(l => `${l.language} (${l.proficiency})`).join('   ·   '), MARGIN, CW, 10, rgb(0.15, 0.15, 0.15), font);
    }
    for (const cert of data.certifications) {
      ctx = drawWrapped(ctx, `• ${[cert.name, cert.issuer, cert.date].filter(Boolean).join('  ·  ')}`, MARGIN, CW, 10, rgb(0.15, 0.15, 0.15), font);
    }
  }

  return doc.save();
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE 4: CREATIVE  (light lavender sidebar, purple accents)
// ─────────────────────────────────────────────────────────────
export async function renderCreativePdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const SB_W = 170;
  const SB_X = 24;
  const MAIN_X = SB_W + 38;
  const MAIN_W = PAGE_W - MAIN_X - 32;
  const SB_BG = rgb(0.95, 0.94, 0.97);
  const PURPLE = rgb(0.40, 0.14, 0.68);
  const PURPLE_LIGHT = rgb(0.58, 0.36, 0.82);
  const DARK = rgb(0.12, 0.12, 0.12);
  const MED = rgb(0.40, 0.40, 0.40);

  function drawSidebarBg(page: PDFPage): void {
    page.drawRectangle({ x: 0, y: 0, width: SB_W + 14, height: PAGE_H, color: SB_BG });
    // Thin purple accent stripe on far left
    page.drawRectangle({ x: 0, y: 0, width: 5, height: PAGE_H, color: PURPLE });
  }

  const firstPage = doc.addPage([PAGE_W, PAGE_H]);
  drawSidebarBg(firstPage);

  // ── Sidebar content ──
  let sideY = PAGE_H - MARGIN;

  function sbText(text: string, size: number, bold: boolean, color = rgb(0.20, 0.20, 0.20)): void {
    for (const line of wrapText(text, bold ? boldFont : font, size, SB_W - 22)) {
      if (sideY < MARGIN) return;
      firstPage.drawText(line, { x: SB_X + 6, y: sideY, size, font: bold ? boldFont : font, color });
      sideY -= size + 4;
    }
  }

  function sbSection(title: string): void {
    sideY -= 10;
    if (sideY < MARGIN) return;
    firstPage.drawText(title.toUpperCase(), { x: SB_X + 6, y: sideY, size: 8, font: boldFont, color: PURPLE });
    sideY -= 4;
    firstPage.drawLine({ start: { x: SB_X + 6, y: sideY }, end: { x: SB_X + SB_W - 16, y: sideY }, thickness: 1, color: PURPLE_LIGHT });
    sideY -= 12;
  }

  // Avatar placeholder circle
  const cx = SB_X + (SB_W - 14) / 2;
  firstPage.drawCircle({ x: cx, y: PAGE_H - 60, size: 36, color: PURPLE });
  const initials = (data.fullName || 'YN').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const iw = boldFont.widthOfTextAtSize(initials, 16);
  firstPage.drawText(initials, { x: cx - iw / 2, y: PAGE_H - 65, size: 16, font: boldFont, color: rgb(1, 1, 1) });
  sideY = PAGE_H - 110;

  sbText(data.fullName || 'Your Name', 13, true, rgb(0.10, 0.10, 0.10));
  if (data.title) { sideY += 2; sbText(data.title, 9, false, PURPLE); }
  sideY -= 4;

  sbSection('Contact');
  if (data.email) sbText(data.email, 8.5, false);
  if (data.phone) sbText(data.phone, 8.5, false);
  if (data.location) sbText(data.location, 8.5, false);

  if (data.skills.length > 0) {
    sbSection('Skills');
    for (const sk of data.skills) {
      if (sideY < MARGIN) break;
      sbText(`• ${sk}`, 8.5, false);
    }
  }

  if (data.languages.length > 0) {
    sbSection('Languages');
    for (const l of data.languages) {
      if (sideY < MARGIN) break;
      sbText(`${l.language} — ${l.proficiency}`, 8.5, false);
    }
  }

  if (data.certifications.length > 0) {
    sbSection('Certifications');
    for (const c of data.certifications) {
      if (sideY < MARGIN) break;
      sbText(c.name, 8.5, true, rgb(0.12, 0.12, 0.12));
      if (c.issuer) sbText(c.issuer, 7.5, false, MED);
    }
  }

  // ── Main content ──
  function newCreativePage(ctx: Ctx): Ctx {
    const p = ctx.doc.addPage([PAGE_W, PAGE_H]);
    drawSidebarBg(p);
    return { ...ctx, page: p, y: PAGE_H - MARGIN };
  }

  function ensureCreative(ctx: Ctx, needed: number): Ctx {
    return ctx.y - needed < MARGIN ? newCreativePage(ctx) : ctx;
  }

  function creativeSection(ctx: Ctx, title: string): Ctx {
    ctx.y -= SECTION_GAP / 2;
    ctx = ensureCreative(ctx, LINE_H + 8);
    ctx.page.drawText(title.toUpperCase(), { x: MAIN_X, y: ctx.y, size: 9, font: boldFont, color: PURPLE });
    ctx.y -= 5;
    ctx.page.drawLine({ start: { x: MAIN_X, y: ctx.y }, end: { x: MAIN_X + MAIN_W, y: ctx.y }, thickness: 1, color: PURPLE_LIGHT });
    ctx.y -= LINE_H - 2;
    return ctx;
  }

  let ctx: Ctx = { page: firstPage, font, boldFont, y: PAGE_H - MARGIN, doc };

  if (data.summary) {
    ctx = creativeSection(ctx, 'Profile');
    ctx = drawWrapped(ctx, data.summary, MAIN_X, MAIN_W, 10);
  }

  if (data.experience.length > 0) {
    ctx = creativeSection(ctx, 'Experience');
    for (const exp of data.experience) {
      ctx = ensureCreative(ctx, LINE_H * 3);
      ctx.page.drawText(exp.role, { x: MAIN_X, y: ctx.y, size: 11, font: boldFont, color: DARK });
      ctx.y -= LINE_H;
      ctx.page.drawText(`${exp.company}  ·  ${dateRange(exp.startDate, exp.endDate, exp.current)}`, {
        x: MAIN_X, y: ctx.y, size: 9, font, color: PURPLE_LIGHT,
      });
      ctx.y -= LINE_H;
      if (exp.description) ctx = drawBullets(ctx, exp.description, MAIN_X + 10, MAIN_W - 10, 9);
      ctx.y -= 5;
    }
  }

  if (data.education.length > 0) {
    ctx = creativeSection(ctx, 'Education');
    for (const edu of data.education) {
      ctx = ensureCreative(ctx, LINE_H * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MAIN_X, y: ctx.y, size: 11, font: boldFont, color: DARK,
      });
      ctx.y -= LINE_H;
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
      ctx.page.drawText(`${edu.institution}${dates ? `  ·  ${dates}` : ''}`, {
        x: MAIN_X, y: ctx.y, size: 9, font, color: PURPLE_LIGHT,
      });
      ctx.y -= LINE_H + 4;
    }
  }

  return doc.save();
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE 5: MINIMAL  (pure black & white, right-aligned dates, ATS-friendly)
// ─────────────────────────────────────────────────────────────
export async function renderMinimalPdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const CW = PAGE_W - 2 * MARGIN;
  const BLACK = rgb(0.08, 0.08, 0.08);
  const DARK = rgb(0.22, 0.22, 0.22);
  const MED = rgb(0.45, 0.45, 0.45);
  const RULE = rgb(0.78, 0.78, 0.78);

  let ctx: Ctx = { page, font, boldFont, y: PAGE_H - MARGIN, doc };

  // Name
  ctx.page.drawText(data.fullName || 'Your Name', { x: MARGIN, y: ctx.y, size: 24, font: boldFont, color: BLACK });
  ctx.y -= 28;

  // Title under name
  if (data.title) {
    ctx.page.drawText(data.title, { x: MARGIN, y: ctx.y, size: 11, font, color: MED });
    ctx.y -= LINE_H + 2;
  }

  // Contact inline
  const cParts = [data.email, data.phone, data.location].filter(Boolean);
  if (cParts.length > 0) {
    ctx.page.drawText(cParts.join('  ·  '), { x: MARGIN, y: ctx.y, size: 9, font, color: MED });
    ctx.y -= LINE_H;
  }

  // Full-width separator
  ctx.y -= 6;
  hRule(ctx, MARGIN, CW, RULE, 0.75);
  ctx.y -= 14;

  function minSection(ctx: Ctx, title: string): Ctx {
    ctx = ensureSpace(ctx, LINE_H + 10);
    ctx.page.drawText(title.toUpperCase(), { x: MARGIN, y: ctx.y, size: 10, font: boldFont, color: DARK });
    ctx.y -= 5;
    hRule(ctx, MARGIN, CW, RULE, 0.5);
    ctx.y -= LINE_H;
    return ctx;
  }

  if (data.summary) {
    ctx = minSection(ctx, 'Summary');
    ctx = drawWrapped(ctx, data.summary, MARGIN, CW, 10, DARK);
    ctx.y -= 4;
  }

  if (data.experience.length > 0) {
    ctx = minSection(ctx, 'Experience');
    for (const exp of data.experience) {
      ctx = ensureSpace(ctx, LINE_H * 3);
      // Role bold left, date right
      ctx.page.drawText(exp.role, { x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: BLACK });
      drawRight(ctx.page, dateRange(exp.startDate, exp.endDate, exp.current), PAGE_W - MARGIN, ctx.y, 9, font, MED);
      ctx.y -= LINE_H;
      ctx.page.drawText(exp.company, { x: MARGIN, y: ctx.y, size: 9, font, color: MED });
      ctx.y -= LINE_H;
      if (exp.description) ctx = drawBullets(ctx, exp.description, MARGIN + 10, CW - 10, 9);
      ctx.y -= 6;
    }
  }

  if (data.education.length > 0) {
    ctx = minSection(ctx, 'Education');
    for (const edu of data.education) {
      ctx = ensureSpace(ctx, LINE_H * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: BLACK,
      });
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
      if (dates) drawRight(ctx.page, dates, PAGE_W - MARGIN, ctx.y, 9, font, MED);
      ctx.y -= LINE_H;
      ctx.page.drawText(edu.institution, { x: MARGIN, y: ctx.y, size: 9, font, color: MED });
      ctx.y -= LINE_H + 4;
    }
  }

  if (data.skills.length > 0) {
    ctx = minSection(ctx, 'Skills');
    ctx = drawWrapped(ctx, data.skills.join('  ·  '), MARGIN, CW, 10, DARK);
    ctx.y -= 4;
  }

  if (data.languages.length > 0) {
    ctx = minSection(ctx, 'Languages');
    ctx = drawWrapped(ctx, data.languages.map(l => `${l.language} (${l.proficiency})`).join('  ·  '), MARGIN, CW, 10, DARK);
    ctx.y -= 4;
  }

  if (data.certifications.length > 0) {
    ctx = minSection(ctx, 'Certifications');
    for (const cert of data.certifications) {
      ctx = drawWrapped(ctx, `${cert.name}${cert.issuer ? ` — ${cert.issuer}` : ''}${cert.date ? `, ${cert.date}` : ''}`, MARGIN, CW, 10, DARK);
    }
  }

  return doc.save();
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE 6: COMPACT  (dense, burgundy accents, two-col skills, max content)
// ─────────────────────────────────────────────────────────────
export async function renderCompactPdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const CW = PAGE_W - 2 * MARGIN;
  const BURG = rgb(0.52, 0.07, 0.13);
  const DARK = rgb(0.10, 0.10, 0.10);
  const MED = rgb(0.40, 0.40, 0.40);
  const LH = 13; // tighter line height
  const BODY = 8.5;
  const HEADER_SIZE = 10;

  let ctx: Ctx = { page, font, boldFont, y: PAGE_H - MARGIN, doc };

  // Name + title on one row
  ctx.page.drawText(data.fullName || 'Your Name', { x: MARGIN, y: ctx.y, size: 18, font: boldFont, color: DARK });
  if (data.title) {
    drawRight(ctx.page, data.title, PAGE_W - MARGIN, ctx.y, 10, font, MED);
  }
  ctx.y -= 22;

  // Contact line
  const cParts = [data.email, data.phone, data.location].filter(Boolean);
  if (cParts.length > 0) {
    ctx.page.drawText(cParts.join('  |  '), { x: MARGIN, y: ctx.y, size: 8, font, color: MED });
    ctx.y -= LH;
  }

  // Thick burgundy separator
  ctx.y -= 4;
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y }, thickness: 1.5, color: BURG });
  ctx.y -= 12;

  function compactSection(ctx: Ctx, title: string): Ctx {
    ctx = ensureSpace(ctx, LH + 8);
    ctx.y -= 4;
    ctx.page.drawText(title.toUpperCase(), { x: MARGIN, y: ctx.y, size: HEADER_SIZE, font: boldFont, color: BURG });
    ctx.y -= 4;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y }, thickness: 0.5, color: BURG });
    ctx.y -= LH;
    return ctx;
  }

  function compactWrapped(ctx: Ctx, text: string, x: number, maxW: number): Ctx {
    for (const line of wrapText(text, font, BODY, maxW)) {
      ctx = ensureSpace(ctx, LH);
      ctx.page.drawText(line, { x, y: ctx.y, size: BODY, font, color: DARK });
      ctx.y -= LH;
    }
    return ctx;
  }

  if (data.summary) {
    ctx = compactSection(ctx, 'Summary');
    ctx = compactWrapped(ctx, data.summary, MARGIN, CW);
  }

  if (data.experience.length > 0) {
    ctx = compactSection(ctx, 'Experience');
    for (const exp of data.experience) {
      ctx = ensureSpace(ctx, LH * 2);
      ctx.page.drawText(exp.role, { x: MARGIN, y: ctx.y, size: 9.5, font: boldFont, color: DARK });
      drawRight(ctx.page, dateRange(exp.startDate, exp.endDate, exp.current), PAGE_W - MARGIN, ctx.y, 8, font, MED);
      ctx.y -= LH;
      ctx.page.drawText(exp.company, { x: MARGIN, y: ctx.y, size: BODY, font, color: BURG });
      ctx.y -= LH;
      if (exp.description) {
        for (const line of exp.description.split('\n').filter(l => l.trim())) {
          const bullet = /^[-•]/.test(line) ? line.replace(/^[-•]\s*/, '• ') : `• ${line}`;
          ctx = compactWrapped(ctx, bullet, MARGIN + 8, CW - 8);
        }
      }
      ctx.y -= 3;
    }
  }

  if (data.education.length > 0) {
    ctx = compactSection(ctx, 'Education');
    for (const edu of data.education) {
      ctx = ensureSpace(ctx, LH * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MARGIN, y: ctx.y, size: 9.5, font: boldFont, color: DARK,
      });
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
      if (dates) drawRight(ctx.page, dates, PAGE_W - MARGIN, ctx.y, 8, font, MED);
      ctx.y -= LH;
      ctx.page.drawText(edu.institution, { x: MARGIN, y: ctx.y, size: BODY, font, color: BURG });
      ctx.y -= LH + 2;
    }
  }

  // Skills in two columns
  if (data.skills.length > 0) {
    ctx = compactSection(ctx, 'Skills');
    const colW = (CW - 20) / 2;
    const mid = Math.ceil(data.skills.length / 2);
    const col1 = data.skills.slice(0, mid);
    const col2 = data.skills.slice(mid);
    const rows = Math.max(col1.length, col2.length);
    ctx = ensureSpace(ctx, rows * LH);
    const startY = ctx.y;
    for (let i = 0; i < col1.length; i++) {
      ctx.page.drawText(`• ${col1[i]}`, { x: MARGIN, y: startY - i * LH, size: BODY, font, color: DARK });
    }
    for (let i = 0; i < col2.length; i++) {
      ctx.page.drawText(`• ${col2[i]}`, { x: MARGIN + colW + 20, y: startY - i * LH, size: BODY, font, color: DARK });
    }
    ctx.y = startY - rows * LH;
  }

  // Languages + Certifications side by side (if both exist)
  if (data.languages.length > 0 && data.certifications.length > 0) {
    ctx = compactSection(ctx, 'Languages & Certifications');
    const colW = (CW - 20) / 2;
    const startY = ctx.y;
    let r1 = 0;
    for (const l of data.languages) {
      ctx.page.drawText(`${l.language} — ${l.proficiency}`, { x: MARGIN, y: startY - r1 * LH, size: BODY, font, color: DARK });
      r1++;
    }
    let r2 = 0;
    for (const c of data.certifications) {
      ctx.page.drawText(c.name, { x: MARGIN + colW + 20, y: startY - r2 * LH, size: BODY, font: boldFont, color: DARK });
      r2++;
      if (c.issuer) {
        ctx.page.drawText(c.issuer, { x: MARGIN + colW + 20, y: startY - r2 * LH, size: BODY - 1, font, color: MED });
        r2++;
      }
    }
    ctx.y = startY - Math.max(r1, r2) * LH;
  } else {
    if (data.languages.length > 0) {
      ctx = compactSection(ctx, 'Languages');
      ctx = compactWrapped(ctx, data.languages.map(l => `${l.language} (${l.proficiency})`).join('  ·  '), MARGIN, CW);
    }
    if (data.certifications.length > 0) {
      ctx = compactSection(ctx, 'Certifications');
      for (const cert of data.certifications) {
        ctx = compactWrapped(ctx, `• ${[cert.name, cert.issuer, cert.date].filter(Boolean).join('  |  ')}`, MARGIN, CW);
      }
    }
  }

  return doc.save();
}

// ─────────────────────────────────────────────────────────────
// DISPATCHER
// ─────────────────────────────────────────────────────────────
export async function renderResumePdf(data: ResumeData): Promise<Uint8Array> {
  switch (data.template) {
    case 'modern':     return renderModernPdf(data);
    case 'executive':  return renderExecutivePdf(data);
    case 'creative':   return renderCreativePdf(data);
    case 'minimal':    return renderMinimalPdf(data);
    case 'compact':    return renderCompactPdf(data);
    default:           return renderProfessionalPdf(data);
  }
}
