import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import fs from 'fs/promises';

/**
 * API Route: /api/generate-job-image
 *
 * Generates a shareable image (PNG) that contains the key details of a job
 * posting.  The generated image uses a dark background consistent with
 * the JobLinca brand and overlays the job title, company name, location,
 * salary and work type.  A small JobLinca logo is placed in the top
 * left corner.  Company logos are not fetched or displayed to keep
 * complexity down and avoid external requests.  The response body
 * contains a base64‑encoded PNG data URL which can be stored as
 * `image_url` in the database or sent directly to clients.  If any
 * required field is missing the route returns a 400 status.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, companyName, salary, location, workType } = body;
    if (!title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }
    // Define canvas dimensions (1200x630 is a typical social card size)
    const width = 1200;
    const height = 630;
    // Base dark background
    const base = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 6, g: 19, b: 43, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    // Load JobLinca logo from the public directory at runtime.  If the
    // logo cannot be found the overlay will be skipped.  Note: the
    // relative path is resolved from the project root when running in
    // production.
    let logoBuffer: Buffer | null = null;
    try {
      const logoPath = process.cwd() + '/public/joblinca-logo.png';
      logoBuffer = await fs.readFile(logoPath);
    } catch {
      logoBuffer = null;
    }
    // Create an SVG with the job details.  Using SVG allows us to render
    // crisp text via Sharp without relying on system fonts.  The text
    // colours match the JobLinca palette.
    const titleFontSize = 48;
    const detailFontSize = 24;
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .title { font: ${titleFontSize}px sans-serif; fill: #ffffff; font-weight: bold; }
          .detail { font: ${detailFontSize}px sans-serif; fill: #a9bbd9; }
        </style>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0)" />
        <text x="50%" y="45%" text-anchor="middle" class="title">${escapeHtml(
      title
    )}</text>
        ${companyName ? `<text x="50%" y="55%" text-anchor="middle" class="detail">${escapeHtml(companyName)}</text>` : ''}
        ${(location || workType) ? `<text x="50%" y="65%" text-anchor="middle" class="detail">${
      [location, workType].filter(Boolean).join(' • ')
    }</text>` : ''}
        ${salary ? `<text x="50%" y="75%" text-anchor="middle" class="detail">${escapeHtml(salary)}</text>` : ''}
      </svg>
    `;
    const svgBuffer = Buffer.from(svg);
    // Render the SVG to PNG
    const textImage = await sharp(svgBuffer).png().toBuffer();
    // Composite the base background with the text overlay and logo (if available)
    const composites: sharp.OverlayOptions[] = [
      { input: textImage, top: 0, left: 0 },
    ];
    if (logoBuffer) {
      // Resize logo to 96x96 and add some margin
      const resizedLogo = await sharp(logoBuffer)
        .resize(96, 96)
        .png()
        .toBuffer();
      composites.push({ input: resizedLogo, top: 24, left: 24 });
    }
    const finalBuffer = await sharp(base)
      .composite(composites)
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${finalBuffer.toString('base64')}`;
    return NextResponse.json({ imageUrl: dataUrl });
  } catch (error) {
    console.error('Error generating job image', error);
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }
}

// Helper to escape special characters for SVG text
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}