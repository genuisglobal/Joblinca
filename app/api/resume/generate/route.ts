import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * API Route: /api/resume/generate
 *
 * Generates a PDF from resume data.  The request body should be
 * JSON containing the fields defined in the ResumeData type.  To
 * control usage, premium users are limited to one generation per
 * day (shared with the optimisation limit).  If the limit is
 * exceeded a 429 response is returned.  The generated PDF is
 * returned as a base64 data URL so it can be downloaded or
 * displayed in the browser without writing files to disk.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let resumeData: any;
  try {
    resumeData = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  // Check premium subscription and usage
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  const isPremium = !!subscription;
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRow } = await supabase
    .from('resume_usage')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle();
  const used = usageRow?.used ?? 0;
  if (!isPremium) {
    return NextResponse.json({ error: 'Upgrade to premium to generate resumes' }, { status: 402 });
  }
  if (used >= 1) {
    return NextResponse.json({ error: 'Daily resume generation limit reached' }, { status: 429 });
  }
  // Try to import pdf-lib dynamically.  If unavailable we will
  // generate a plain text document instead.
  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    let y = height - 40;
    const drawLine = (label: string, value: string) => {
      page.drawText(`${label}: ${value}`, {
        x: 40,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= fontSize + 6;
    };
    if (resumeData.fullName) drawLine('Name', resumeData.fullName);
    if (resumeData.email) drawLine('Email', resumeData.email);
    if (resumeData.phone) drawLine('Phone', resumeData.phone);
    if (resumeData.summary) {
      page.drawText('Summary:', { x: 40, y: y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= fontSize + 4;
      const summaryLines = String(resumeData.summary).split(/\r?\n/);
      summaryLines.forEach((line: string) => {
        page.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
        y -= fontSize + 4;
      });
    }
    if (resumeData.experience) {
      page.drawText('Experience:', { x: 40, y: y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= fontSize + 4;
      const expLines = String(resumeData.experience).split(/\r?\n/);
      expLines.forEach((line: string) => {
        page.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
        y -= fontSize + 4;
      });
    }
    if (resumeData.education) {
      page.drawText('Education:', { x: 40, y: y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= fontSize + 4;
      const eduLines = String(resumeData.education).split(/\r?\n/);
      eduLines.forEach((line: string) => {
        page.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
        y -= fontSize + 4;
      });
    }
    if (resumeData.skills) {
      page.drawText('Skills:', { x: 40, y: y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= fontSize + 4;
      const skillLines = String(resumeData.skills).split(/,\s*/);
      skillLines.forEach((skill: string) => {
        page.drawText(`• ${skill}`, { x: 50, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
        y -= fontSize + 4;
      });
    }
    const pdfBytes = await pdfDoc.save();
    const base64 = Buffer.from(pdfBytes).toString('base64');
    // update usage
    if (usageRow) {
      await supabase
        .from('resume_usage')
        .update({ used: used + 1 })
        .eq('id', usageRow.id);
    } else {
      await supabase
        .from('resume_usage')
        .insert({ user_id: user.id, date: today, used: 1 });
    }
    return NextResponse.json({ dataUrl: `data:application/pdf;base64,${base64}` });
  } catch (err) {
    // Fallback: generate a plain text file if pdf-lib is unavailable
    console.warn('pdf-lib unavailable, generating plain text resume');
    const lines = [] as string[];
    if (resumeData.fullName) lines.push(`Name: ${resumeData.fullName}`);
    if (resumeData.email) lines.push(`Email: ${resumeData.email}`);
    if (resumeData.phone) lines.push(`Phone: ${resumeData.phone}`);
    if (resumeData.summary) lines.push('', 'Summary:', resumeData.summary);
    if (resumeData.experience) lines.push('', 'Experience:', resumeData.experience);
    if (resumeData.education) lines.push('', 'Education:', resumeData.education);
    if (resumeData.skills) lines.push('', 'Skills:', resumeData.skills);
    const content = lines.join('\n');
    const base64 = Buffer.from(content, 'utf-8').toString('base64');
    if (usageRow) {
      await supabase
        .from('resume_usage')
        .update({ used: used + 1 })
        .eq('id', usageRow.id);
    } else {
      await supabase
        .from('resume_usage')
        .insert({ user_id: user.id, date: today, used: 1 });
    }
    return NextResponse.json({ dataUrl: `data:text/plain;base64,${base64}` });
  }
}