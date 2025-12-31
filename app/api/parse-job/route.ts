import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * API Route: /api/parse-job
 *
 * Accepts a multipart/form‑data POST request containing a single file
 * (PDF, DOCX or plain text).  The file is parsed to extract plain
 * text which is then used to infer a job title and description.  The
 * title is derived from the first non‑empty line and truncated for
 * brevity.  The description is the full extracted text.  This route
 * never throws on parsing failures; instead it returns an empty
 * object to the caller so that client code can handle errors
 * gracefully.  This ensures build‑time safety and prevents runtime
 * crashes when unsupported file types are uploaded.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let text = '';
    const fileName = file.name.toLowerCase();
    // Determine parser based on extension and MIME type
    if (fileName.endsWith('.pdf')) {
      // Parse PDF using pdf-parse
      try {
        const result = await pdfParse(buffer);
        text = result.text || '';
      } catch {
        text = '';
      }
    } else if (fileName.endsWith('.docx')) {
      // Parse DOCX using mammoth
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || '';
      } catch {
        text = '';
      }
    } else {
      // Assume plain text
      text = buffer.toString('utf-8');
    }
    // Normalise line breaks and split lines
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const title = lines.length > 0 ? lines[0].slice(0, 120) : '';
    const description = text.trim();
    return NextResponse.json({ title, description });
  } catch (error) {
    console.error('Error parsing job file', error);
    return NextResponse.json({}, { status: 200 });
  }
}