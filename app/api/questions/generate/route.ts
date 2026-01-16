import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are an expert HR assistant helping recruiters create screening questions for job postings in Cameroon. Generate relevant, professional screening questions.

Rules:
- Generate 3-5 questions based on the job
- Focus on skills, experience, and fit for the role
- Make questions specific to the job requirements
- Include a mix of question types
- Keep questions concise and clear
- Questions should be appropriate for the Cameroon job market

Return ONLY a valid JSON array (no markdown, no code blocks) with this exact format:
[
  {
    "type": "text",
    "question": "Question text here",
    "required": true
  },
  {
    "type": "yesno",
    "question": "Yes/No question here",
    "required": false
  },
  {
    "type": "select",
    "question": "Single choice question",
    "required": false,
    "options": ["Option 1", "Option 2", "Option 3"]
  }
]

Valid types are: "text" (short answer), "textarea" (long answer), "yesno" (yes/no), "select" (single choice), "multiselect" (multiple choice).
Only include "options" array for "select" and "multiselect" types.`;

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Check if user is a recruiter
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'recruiter') {
    return NextResponse.json(
      { error: 'Only recruiters can generate questions' },
      { status: 403 }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jobTitle, jobDescription } = body;

  if (!jobTitle) {
    return NextResponse.json({ error: 'Job title is required' }, { status: 400 });
  }

  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured' },
      { status: 503 }
    );
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const userPrompt = `Generate screening questions for this job posting:

Job Title: ${jobTitle}
${jobDescription ? `\nJob Description: ${jobDescription}` : ''}

Generate relevant questions that will help screen candidates for this position.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const aiResponse = completion.choices?.[0]?.message?.content?.trim();

    if (!aiResponse) {
      return NextResponse.json(
        { error: 'Failed to generate questions' },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let questions;
    try {
      // Remove any markdown code blocks if present
      const cleanedResponse = aiResponse
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      questions = JSON.parse(cleanedResponse);
    } catch {
      console.error('Failed to parse AI response:', aiResponse);
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    // Validate the questions array
    if (!Array.isArray(questions)) {
      return NextResponse.json(
        { error: 'Invalid response format' },
        { status: 500 }
      );
    }

    // Validate and clean each question
    const validatedQuestions = questions
      .filter((q: unknown) => {
        if (!q || typeof q !== 'object') return false;
        const question = q as { type?: string; question?: string };
        return (
          question.type &&
          ['text', 'textarea', 'yesno', 'select', 'multiselect'].includes(question.type) &&
          question.question &&
          typeof question.question === 'string'
        );
      })
      .map((q: unknown) => {
        const question = q as {
          type: string;
          question: string;
          required?: boolean;
          options?: string[];
        };
        const cleaned: {
          type: string;
          question: string;
          required: boolean;
          options?: string[];
        } = {
          type: question.type,
          question: question.question,
          required: Boolean(question.required),
        };
        if (
          (question.type === 'select' || question.type === 'multiselect') &&
          Array.isArray(question.options)
        ) {
          cleaned.options = question.options.filter(
            (opt: unknown) => typeof opt === 'string'
          );
        }
        return cleaned;
      });

    return NextResponse.json({ questions: validatedQuestions });
  } catch (err) {
    console.error('OpenAI API error:', err);
    return NextResponse.json(
      { error: 'Failed to generate questions. Please try again.' },
      { status: 500 }
    );
  }
}
