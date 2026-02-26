import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are an expert HR copywriter helping recruiters in Cameroon create professional job descriptions. Generate clean, well-structured job descriptions in markdown format.

Rules:
- Write a professional, engaging job description
- Include sections: About the Role, Responsibilities, Requirements, and Nice to Have
- Use bullet points for lists
- Keep the tone professional but approachable
- Make it specific to the job title and company
- If the user provides a seed description, expand and polish it
- If no seed description is provided, create a smart description based on the job title and company
- Keep it concise but comprehensive (300-500 words)
- Do NOT include the job title as a heading (it's already shown separately)
- Do NOT include salary, location, or application instructions (those are separate fields)

Return ONLY the job description text, formatted in clean markdown.`;

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'recruiter') {
    return NextResponse.json(
      { error: 'Only recruiters can generate descriptions' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jobTitle, companyName, seedDescription } = body;

  if (!jobTitle) {
    return NextResponse.json({ error: 'Job title is required' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured' },
      { status: 503 }
    );
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let userPrompt = `Generate a professional job description for:\n\nJob Title: ${jobTitle}`;
    if (companyName) {
      userPrompt += `\nCompany: ${companyName}`;
    }
    if (seedDescription && seedDescription.trim()) {
      userPrompt += `\n\nThe recruiter provided this brief description to expand on:\n"${seedDescription.trim()}"`;
    } else {
      userPrompt += `\n\nNo description was provided. Create a smart, relevant job description based on the job title${companyName ? ' and company' : ''}.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
    });

    const description = completion.choices?.[0]?.message?.content?.trim();

    if (!description) {
      return NextResponse.json(
        { error: 'Failed to generate description' },
        { status: 500 }
      );
    }

    return NextResponse.json({ description });
  } catch (err) {
    console.error('OpenAI API error:', err);
    return NextResponse.json(
      { error: 'Failed to generate description. Please try again.' },
      { status: 500 }
    );
  }
}
