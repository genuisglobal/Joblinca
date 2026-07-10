import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';
import type { ResumeData } from '@/lib/resume';

export const runtime = 'nodejs';

const MAX_JOB_DESCRIPTION_LENGTH = 8000;

export interface AtsReport {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestedSkills: string[];
  improvedSummary: string;
  suggestions: string[];
}

function resumeToText(resume: ResumeData): string {
  const parts: string[] = [];
  if (resume.title) parts.push(`Title: ${resume.title}`);
  if (resume.summary) parts.push(`Summary: ${resume.summary}`);
  if (resume.skills?.length) parts.push(`Skills: ${resume.skills.join(', ')}`);
  for (const exp of resume.experience || []) {
    parts.push(
      `Experience: ${exp.role} at ${exp.company} (${exp.startDate} - ${exp.current ? 'Present' : exp.endDate})\n${exp.description}`
    );
  }
  for (const edu of resume.education || []) {
    parts.push(`Education: ${edu.degree} in ${edu.field} — ${edu.institution}`);
  }
  for (const cert of resume.certifications || []) {
    parts.push(`Certification: ${cert.name} (${cert.issuer})`);
  }
  return parts.join('\n\n').slice(0, 8000);
}

function cleanStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, max);
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rate limit: 10 ATS analyses per hour (protect API costs)
  const limit = await rateLimit(
    `resume-ats-score:${getRateLimitIdentifier(request, user?.id)}`,
    { requests: 10, window: '1h' }
  );
  if (!limit.allowed) return limit.response!;

  let body: { resume?: ResumeData; jobDescription?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const resume = body.resume;
  const jobDescription =
    typeof body.jobDescription === 'string'
      ? body.jobDescription.trim().slice(0, MAX_JOB_DESCRIPTION_LENGTH)
      : '';

  if (!resume || typeof resume !== 'object') {
    return NextResponse.json({ error: 'Resume data is required' }, { status: 400 });
  }
  if (jobDescription.length < 50) {
    return NextResponse.json(
      { error: 'Please paste a job description (at least 50 characters).' },
      { status: 400 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an ATS (Applicant Tracking System) analyst and expert resume writer. Compare a resume against a job description and return valid JSON with this exact structure:
{
  "score": number (0-100, how well the resume matches the job: keyword coverage, relevant experience, title alignment),
  "matchedKeywords": string[] (important keywords/skills from the job description that the resume already covers, max 15),
  "missingKeywords": string[] (important keywords/skills from the job description missing from the resume, max 15),
  "suggestedSkills": string[] (skills from the missing keywords that the candidate could plausibly add to their skills section, max 10),
  "improvedSummary": string (the resume summary rewritten to target this specific job, 2-4 sentences; keep all facts truthful — never invent experience or credentials),
  "suggestions": string[] (3-6 specific, actionable improvements to better target this job)
}
Be honest about the score. Never fabricate experience the candidate does not have.`,
        },
        {
          role: 'user',
          content: `JOB DESCRIPTION:\n${jobDescription}\n\nRESUME:\n${resumeToText(resume)}`,
        },
      ],
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const aiResponse = completion.choices?.[0]?.message?.content?.trim();
    if (!aiResponse) {
      return NextResponse.json({ error: 'No AI response' }, { status: 500 });
    }

    const parsed = JSON.parse(aiResponse) as Record<string, unknown>;
    const scoreRaw = Number(parsed.score);
    const report: AtsReport = {
      score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0,
      matchedKeywords: cleanStringArray(parsed.matchedKeywords, 15),
      missingKeywords: cleanStringArray(parsed.missingKeywords, 15),
      suggestedSkills: cleanStringArray(parsed.suggestedSkills, 10),
      improvedSummary: typeof parsed.improvedSummary === 'string' ? parsed.improvedSummary.trim() : '',
      suggestions: cleanStringArray(parsed.suggestions, 6),
    };

    return NextResponse.json(report);
  } catch (err) {
    console.error('ATS analysis failed', err);
    return NextResponse.json({ error: 'ATS analysis failed' }, { status: 500 });
  }
}
