import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { field: string; value: string; context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { field, value, context } = body;

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
      prompt = `Improve this professional summary to be more impactful, clear, and concise. Keep the same information but enhance the wording. Return only the improved text, no explanations.\n\nSummary: ${value}`;
    } else if (field === 'experience') {
      prompt = `Improve this job description to be more impactful with strong action verbs and quantified achievements where possible. Return only the improved text, no explanations.\n\nDescription: ${value}`;
    } else if (field === 'skills') {
      prompt = `Based on this job title and context, suggest 8-12 relevant professional skills. Return a JSON array of strings only.\n\nJob Title: ${value}\nContext: ${context || 'general professional'}`;
    } else {
      return NextResponse.json({ error: 'Unsupported field' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume writer. Provide concise, professional improvements.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      ...(field === 'skills' ? { response_format: { type: 'json_object' } } : {}),
    });

    const aiResponse = completion.choices?.[0]?.message?.content?.trim();

    if (!aiResponse) {
      return NextResponse.json({ error: 'No AI response' }, { status: 500 });
    }

    if (field === 'skills') {
      try {
        const parsed = JSON.parse(aiResponse);
        const skills = Array.isArray(parsed) ? parsed : parsed.skills || [];
        return NextResponse.json({ improved: skills });
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
