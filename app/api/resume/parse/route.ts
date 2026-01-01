import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { deriveResumeFromText } from '@/lib/resume';

/**
 * API Route: /api/resume/parse
 *
 * Accepts a multipart/form‑data POST request containing a single file
 * (PDF, DOCX or plain text).  The file is parsed to extract plain
 * text which is then used to derive a rudimentary resume.  The
 * derivative splits the first non‑empty lines into a name and
 * summary, leaving the remainder as experience.  This naive
 * extraction is intended as a starting point for the user and
 * should be edited manually for accuracy.  Parsing errors return
 * an empty object to avoid crashing the client.
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
    if (fileName.endsWith('.pdf')) {
      try {
        const result = await pdfParse(buffer);
        text = result.text || '';
      } catch {
        text = '';
      }
    } else if (fileName.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || '';
      } catch {
        text = '';
      }
    } else {
      text = buffer.toString('utf-8');
    }
    text = text.trim();
    if (!text) {
      return NextResponse.json({});
    }
    const resume = deriveResumeFromText(text);
    return NextResponse.json(resume);
  } catch (error) {
    console.error('Error parsing resume file', error);
    return NextResponse.json({}, { status: 200 });
  }
}