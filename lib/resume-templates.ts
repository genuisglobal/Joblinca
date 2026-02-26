import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import type { ResumeData } from './resume';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 16;
const SECTION_GAP = 20;

interface DrawContext {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  y: number;
  doc: PDFDocument;
}

function newPage(ctx: DrawContext): DrawContext {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { ...ctx, page, y: PAGE_HEIGHT - MARGIN };
}

function ensureSpace(ctx: DrawContext, needed: number): DrawContext {
  if (ctx.y - needed < MARGIN) {
    return newPage(ctx);
  }
  return ctx;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrapped(ctx: DrawContext, text: string, x: number, maxWidth: number, fontSize: number): DrawContext {
  const lines = wrapText(text, ctx.font, fontSize, maxWidth);
  for (const line of lines) {
    ctx = ensureSpace(ctx, LINE_HEIGHT);
    ctx.page.drawText(line, { x, y: ctx.y, size: fontSize, font: ctx.font, color: rgb(0.15, 0.15, 0.15) });
    ctx.y -= LINE_HEIGHT;
  }
  return ctx;
}

function drawSectionHeader(ctx: DrawContext, title: string, x: number): DrawContext {
  ctx.y -= SECTION_GAP / 2;
  ctx = ensureSpace(ctx, LINE_HEIGHT + 6);
  ctx.page.drawText(title.toUpperCase(), {
    x,
    y: ctx.y,
    size: 12,
    font: ctx.boldFont,
    color: rgb(0.15, 0.35, 0.6),
  });
  ctx.y -= 4;
  ctx.page.drawLine({
    start: { x, y: ctx.y },
    end: { x: x + (PAGE_WIDTH - 2 * MARGIN), y: ctx.y },
    thickness: 1,
    color: rgb(0.15, 0.35, 0.6),
  });
  ctx.y -= LINE_HEIGHT;
  return ctx;
}

// ──────────────────────────────────────────────
// PROFESSIONAL TEMPLATE - Single column, classic
// ──────────────────────────────────────────────

export async function renderProfessionalPdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const contentWidth = PAGE_WIDTH - 2 * MARGIN;

  let ctx: DrawContext = { page, font, boldFont, y: PAGE_HEIGHT - MARGIN, doc };

  // Header - name
  ctx.page.drawText(data.fullName || 'Your Name', {
    x: MARGIN, y: ctx.y, size: 22, font: boldFont, color: rgb(0.1, 0.1, 0.1),
  });
  ctx.y -= 26;

  // Title
  if (data.title) {
    ctx.page.drawText(data.title, {
      x: MARGIN, y: ctx.y, size: 12, font, color: rgb(0.3, 0.3, 0.3),
    });
    ctx.y -= LINE_HEIGHT;
  }

  // Contact line
  const contactParts = [data.email, data.phone, data.location].filter(Boolean);
  if (contactParts.length > 0) {
    ctx.page.drawText(contactParts.join('  |  '), {
      x: MARGIN, y: ctx.y, size: 9, font, color: rgb(0.35, 0.35, 0.35),
    });
    ctx.y -= LINE_HEIGHT + 4;
  }

  // Summary
  if (data.summary) {
    ctx = drawSectionHeader(ctx, 'Professional Summary', MARGIN);
    ctx = drawWrapped(ctx, data.summary, MARGIN, contentWidth, 10);
  }

  // Experience
  if (data.experience.length > 0) {
    ctx = drawSectionHeader(ctx, 'Experience', MARGIN);
    for (const exp of data.experience) {
      ctx = ensureSpace(ctx, LINE_HEIGHT * 3);
      ctx.page.drawText(exp.role, {
        x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1),
      });
      ctx.y -= LINE_HEIGHT;
      const dateStr = exp.current ? `${exp.startDate} - Present` : `${exp.startDate} - ${exp.endDate}`;
      ctx.page.drawText(`${exp.company}  |  ${dateStr}`, {
        x: MARGIN, y: ctx.y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      });
      ctx.y -= LINE_HEIGHT;
      if (exp.description) {
        const descLines = exp.description.split('\n').filter(l => l.trim());
        for (const line of descLines) {
          const bullet = line.startsWith('-') || line.startsWith('•') ? line : `• ${line}`;
          ctx = drawWrapped(ctx, bullet, MARGIN + 10, contentWidth - 10, 9);
        }
      }
      ctx.y -= 6;
    }
  }

  // Education
  if (data.education.length > 0) {
    ctx = drawSectionHeader(ctx, 'Education', MARGIN);
    for (const edu of data.education) {
      ctx = ensureSpace(ctx, LINE_HEIGHT * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1),
      });
      ctx.y -= LINE_HEIGHT;
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' - ');
      ctx.page.drawText(`${edu.institution}${dates ? `  |  ${dates}` : ''}`, {
        x: MARGIN, y: ctx.y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      });
      ctx.y -= LINE_HEIGHT + 4;
    }
  }

  // Skills
  if (data.skills.length > 0) {
    ctx = drawSectionHeader(ctx, 'Skills', MARGIN);
    ctx = drawWrapped(ctx, data.skills.join('  •  '), MARGIN, contentWidth, 10);
  }

  // Languages
  if (data.languages.length > 0) {
    ctx = drawSectionHeader(ctx, 'Languages', MARGIN);
    const langStr = data.languages.map(l => `${l.language} (${l.proficiency})`).join('  •  ');
    ctx = drawWrapped(ctx, langStr, MARGIN, contentWidth, 10);
  }

  // Certifications
  if (data.certifications.length > 0) {
    ctx = drawSectionHeader(ctx, 'Certifications', MARGIN);
    for (const cert of data.certifications) {
      ctx = ensureSpace(ctx, LINE_HEIGHT);
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean).join('  |  ');
      ctx = drawWrapped(ctx, `• ${parts}`, MARGIN, contentWidth, 10);
    }
  }

  return doc.save();
}

// ──────────────────────────────────────────────
// MODERN TEMPLATE - Two-column with sidebar
// ──────────────────────────────────────────────

export async function renderModernPdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const SIDEBAR_WIDTH = 180;
  const SIDEBAR_X = 30;
  const MAIN_X = SIDEBAR_WIDTH + 50;
  const MAIN_WIDTH = PAGE_WIDTH - MAIN_X - 40;

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Draw sidebar background
  page.drawRectangle({
    x: 0, y: 0, width: SIDEBAR_WIDTH + 15,
    height: PAGE_HEIGHT,
    color: rgb(0.12, 0.16, 0.22),
  });

  // Sidebar content
  let sideY = PAGE_HEIGHT - MARGIN;

  // Name in sidebar
  const nameLines = wrapText(data.fullName || 'Your Name', boldFont, 16, SIDEBAR_WIDTH - 20);
  for (const line of nameLines) {
    page.drawText(line, {
      x: SIDEBAR_X, y: sideY, size: 16, font: boldFont, color: rgb(1, 1, 1),
    });
    sideY -= 20;
  }

  if (data.title) {
    const titleLines = wrapText(data.title, font, 10, SIDEBAR_WIDTH - 20);
    for (const line of titleLines) {
      page.drawText(line, {
        x: SIDEBAR_X, y: sideY, size: 10, font, color: rgb(0.7, 0.8, 0.9),
      });
      sideY -= 14;
    }
  }
  sideY -= 10;

  // Contact in sidebar
  const drawSidebarSection = (title: string) => {
    sideY -= 8;
    page.drawText(title.toUpperCase(), {
      x: SIDEBAR_X, y: sideY, size: 9, font: boldFont, color: rgb(0.5, 0.7, 0.9),
    });
    sideY -= 14;
  };

  drawSidebarSection('Contact');
  const contactItems = [
    data.email && `${data.email}`,
    data.phone && `${data.phone}`,
    data.location && `${data.location}`,
  ].filter(Boolean);
  for (const item of contactItems) {
    const itemLines = wrapText(item!, font, 9, SIDEBAR_WIDTH - 20);
    for (const line of itemLines) {
      page.drawText(line, {
        x: SIDEBAR_X, y: sideY, size: 9, font, color: rgb(0.85, 0.85, 0.85),
      });
      sideY -= 13;
    }
  }

  // Skills in sidebar
  if (data.skills.length > 0) {
    drawSidebarSection('Skills');
    for (const skill of data.skills) {
      if (sideY < MARGIN) break;
      const skillLines = wrapText(`• ${skill}`, font, 9, SIDEBAR_WIDTH - 20);
      for (const line of skillLines) {
        page.drawText(line, {
          x: SIDEBAR_X, y: sideY, size: 9, font, color: rgb(0.85, 0.85, 0.85),
        });
        sideY -= 13;
      }
    }
  }

  // Languages in sidebar
  if (data.languages.length > 0) {
    drawSidebarSection('Languages');
    for (const lang of data.languages) {
      if (sideY < MARGIN) break;
      page.drawText(`${lang.language} - ${lang.proficiency}`, {
        x: SIDEBAR_X, y: sideY, size: 9, font, color: rgb(0.85, 0.85, 0.85),
      });
      sideY -= 13;
    }
  }

  // Certifications in sidebar
  if (data.certifications.length > 0) {
    drawSidebarSection('Certifications');
    for (const cert of data.certifications) {
      if (sideY < MARGIN) break;
      const certLines = wrapText(cert.name, font, 9, SIDEBAR_WIDTH - 20);
      for (const line of certLines) {
        page.drawText(line, {
          x: SIDEBAR_X, y: sideY, size: 9, font: boldFont, color: rgb(0.85, 0.85, 0.85),
        });
        sideY -= 13;
      }
      if (cert.issuer) {
        page.drawText(cert.issuer, {
          x: SIDEBAR_X, y: sideY, size: 8, font, color: rgb(0.65, 0.65, 0.65),
        });
        sideY -= 13;
      }
    }
  }

  // Main content (right side)
  let ctx: DrawContext = { page, font, boldFont, y: PAGE_HEIGHT - MARGIN, doc };

  const drawMainSection = (title: string) => {
    ctx.y -= SECTION_GAP / 2;
    ctx = ensureSpace(ctx, LINE_HEIGHT + 6);
    ctx.page.drawText(title.toUpperCase(), {
      x: MAIN_X, y: ctx.y, size: 12, font: boldFont, color: rgb(0.15, 0.35, 0.6),
    });
    ctx.y -= 4;
    ctx.page.drawLine({
      start: { x: MAIN_X, y: ctx.y },
      end: { x: MAIN_X + MAIN_WIDTH, y: ctx.y },
      thickness: 1,
      color: rgb(0.15, 0.35, 0.6),
    });
    ctx.y -= LINE_HEIGHT;
  };

  // Summary
  if (data.summary) {
    drawMainSection('Profile');
    ctx = drawWrapped(ctx, data.summary, MAIN_X, MAIN_WIDTH, 10);
  }

  // Experience
  if (data.experience.length > 0) {
    drawMainSection('Experience');
    for (const exp of data.experience) {
      ctx = ensureSpace(ctx, LINE_HEIGHT * 3);
      ctx.page.drawText(exp.role, {
        x: MAIN_X, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1),
      });
      ctx.y -= LINE_HEIGHT;
      const dateStr = exp.current ? `${exp.startDate} - Present` : `${exp.startDate} - ${exp.endDate}`;
      ctx.page.drawText(`${exp.company}  |  ${dateStr}`, {
        x: MAIN_X, y: ctx.y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      });
      ctx.y -= LINE_HEIGHT;
      if (exp.description) {
        const descLines = exp.description.split('\n').filter(l => l.trim());
        for (const line of descLines) {
          const bullet = line.startsWith('-') || line.startsWith('•') ? line : `• ${line}`;
          ctx = drawWrapped(ctx, bullet, MAIN_X + 10, MAIN_WIDTH - 10, 9);
        }
      }
      ctx.y -= 6;
    }
  }

  // Education
  if (data.education.length > 0) {
    drawMainSection('Education');
    for (const edu of data.education) {
      ctx = ensureSpace(ctx, LINE_HEIGHT * 2);
      ctx.page.drawText(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`, {
        x: MAIN_X, y: ctx.y, size: 11, font: boldFont, color: rgb(0.1, 0.1, 0.1),
      });
      ctx.y -= LINE_HEIGHT;
      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' - ');
      ctx.page.drawText(`${edu.institution}${dates ? `  |  ${dates}` : ''}`, {
        x: MAIN_X, y: ctx.y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      });
      ctx.y -= LINE_HEIGHT + 4;
    }
  }

  return doc.save();
}

export async function renderResumePdf(data: ResumeData): Promise<Uint8Array> {
  if (data.template === 'modern') {
    return renderModernPdf(data);
  }
  return renderProfessionalPdf(data);
}
