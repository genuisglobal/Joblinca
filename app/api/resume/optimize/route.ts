import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_VALUE_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 500;

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: 15 AI optimization requests per hour per user (protect API costs).
  // A normal session uses ~5-8 calls (summary + each experience + skills).
  const limit = await rateLimit(`resume-optimize:user:${user.id}`, { requests: 15, window: '1h' });
  if (!limit.allowed) return limit.response!;

  let body: { field: string; value: string; context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { field } = body;
  const value = typeof body.value === 'string' ? body.value.slice(0, MAX_VALUE_LENGTH) : '';
  const context = typeof body.context === 'string' ? body.context.slice(0, MAX_CONTEXT_LENGTH) : '';

  if (!field || !value) {
    return NextResponse.json({ error: 'Field and value are required' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let prompt = '';
    if (field === 'summary') {
      prompt = `Rewrite this professional summary to be more impactful, clear, and concise (2-4 sentences). Lead with the candidate's strongest selling point, use confident active voice, and keep all factual information — never invent experience, numbers, or credentials. Return only the improved text, no explanations.\n\n${context ? `Target role/title: ${context}\n` : ''}Summary: ${value}`;
    } else if (field === 'experience') {
      prompt = `Rewrite this job description as 3-5 concise resume bullet points. Start each bullet with "• " and a strong action verb, emphasize outcomes and impact, and keep quantified results where present — never invent numbers, tools, or achievements that are not in the original. Return only the bullet points, no explanations.\n\n${context ? `Position: ${context}\n` : ''}Description: ${value}`;
    } else if (field === 'bullet') {
      prompt = `Rewrite this single resume bullet point to be more impactful: start with a strong action verb, emphasize the outcome, and keep any quantified results — never invent numbers, tools, or achievements that are not in the original. Return only the single improved bullet point on one line, with no bullet character prefix and no explanations.\n\n${context ? `Position: ${context}\n` : ''}Bullet: ${value}`;
    } else if (field === 'skills') {
      prompt = `Based on this job title and work history, suggest 8-12 relevant professional skills (mix of technical/hard skills and a few soft skills, as appropriate for the role). Return a JSON object with a single key "skills" whose value is an array of strings, e.g. {"skills": ["Skill 1", "Skill 2"]}.\n\nJob Title: ${value}\nWork history: ${context || 'general professional'}`;
    } else {
      return NextResponse.json({ error: 'Unsupported field' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert resume writer. Provide concise, professional, ATS-friendly improvements. Never fabricate facts, employers, dates, or metrics.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      ...(field === 'skills' ? { response_format: { type: 'json_object' as const } } : {}),
    });

    const aiResponse = completion.choices?.[0]?.message?.content?.trim();

    if (!aiResponse) {
      return NextResponse.json({ error: 'No AI response' }, { status: 500 });
    }

    if (field === 'skills') {
      try {
        const parsed = JSON.parse(aiResponse);
        const skills = Array.isArray(parsed) ? parsed : parsed.skills || [];
        const cleaned = (skills as unknown[])
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, 15);
        return NextResponse.json({ improved: cleaned });
      } catch {
        return NextResponse.json({ improved: [] });
      }
    }

    return NextResponse.json({ improved: aiResponse });
  } catch (err) {
    console.error('OpenAI optimization failed', err);
    return NextResponse.json({ error: 'AI optimization failed' }, { status: 500 });
  }
}
