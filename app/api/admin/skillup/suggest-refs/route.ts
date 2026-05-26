import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';
import { callAiJson, isAiConfigured } from '@/lib/ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_REFS_PER_QUESTION = 3;
const MAX_CANDIDATE_COURSES = 40;

interface ChallengeRow {
  id: string;
  title: string;
  domain: string | null;
  config: unknown;
}

interface CourseRow {
  id: string;
  title: string;
  title_fr: string | null;
  description: string | null;
  external_provider: string | null;
  external_url: string | null;
  external_url_fr: string | null;
  is_free: boolean | null;
  partner_name: string | null;
}

interface ParsedQuestion {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

const RefSuggestionSchema = z.object({
  course_id: z.string().nullable().optional(),
  external_provider: z.string().nullable().optional(),
  external_url: z.string().nullable().optional(),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const SuggestResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      question_id: z.string(),
      refs: z.array(RefSuggestionSchema).max(MAX_REFS_PER_QUESTION),
    })
  ),
});

function parseQuestionsFromConfig(config: unknown): ParsedQuestion[] {
  if (typeof config !== 'object' || config === null) return [];
  const record = config as Record<string, unknown>;
  let raw: unknown = record.questions;
  if (!Array.isArray(raw) && Array.isArray(record.quiz_questions)) {
    raw = record.quiz_questions;
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index): ParsedQuestion | null => {
      if (typeof item !== 'object' || item === null) return null;
      const q = item as Record<string, unknown>;
      const prompt = typeof q.question === 'string' ? q.question.trim() : '';
      if (!prompt) return null;
      const options = Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === 'string')
        : [];
      const correct = Number(q.correct_index);
      if (!Number.isFinite(correct) || correct < 0) return null;
      const explanation = typeof q.explanation === 'string' ? q.explanation : null;
      const id = typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${index + 1}`;
      return {
        id,
        prompt,
        options,
        correct_index: Math.floor(correct),
        explanation,
      };
    })
    .filter((q): q is ParsedQuestion => q !== null);
}

function buildPrompt(args: {
  challenge: ChallengeRow;
  questions: ParsedQuestion[];
  courses: CourseRow[];
}): string {
  const { challenge, questions, courses } = args;

  const courseLines = courses
    .map((c) => {
      const provider = c.external_provider ? `[${c.external_provider}]` : '[in-house]';
      const free = c.is_free ? '(free)' : '';
      const url = c.external_url ? ` -> ${c.external_url}` : '';
      const desc = c.description ? ` :: ${c.description.slice(0, 160)}` : '';
      return `- id=${c.id} ${provider} ${free} "${c.title}"${url}${desc}`;
    })
    .join('\n');

  const questionLines = questions
    .map((q) => {
      const correct = q.options[q.correct_index] ?? `index ${q.correct_index}`;
      return `id=${q.id}
  prompt: ${q.prompt}
  correct_answer: ${correct}
  options: ${q.options.join(' | ')}`;
    })
    .join('\n\n');

  return `You are matching quiz questions to learning resources for a job-skills platform.
Domain: ${challenge.domain ?? 'general'}
Challenge: ${challenge.title}

Available courses:
${courseLines || '(none)'}

For each question below, suggest up to ${MAX_REFS_PER_QUESTION} resources that would
best help someone who got the question wrong. Prefer free options when available
and equally relevant.

Each suggested ref must EITHER:
- reference course_id from the list above (set external fields to null), OR
- reference an external resource via external_url + external_provider (set
  course_id to null). Only suggest external resources if no listed course fits.

For every ref include a one-sentence rationale and a confidence score 0..1.

Questions:
${questionLines}

Return JSON of shape:
{ "suggestions": [ { "question_id": "...", "refs": [ { "course_id": "..." | null, "external_provider": "..." | null, "external_url": "..." | null, "rationale": "...", "confidence": 0.8 } ] } ] }`;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAdmin();

    if (!isAiConfigured()) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured on this server.' },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const challengeId =
      typeof (body as Record<string, unknown>).challenge_id === 'string'
        ? ((body as Record<string, unknown>).challenge_id as string).trim()
        : '';
    if (!challengeId) {
      return NextResponse.json(
        { error: 'challenge_id is required' },
        { status: 422 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: challengeRow, error: challengeError } = await supabase
      .from('talent_challenges')
      .select('id, title, domain, config')
      .eq('id', challengeId)
      .maybeSingle();
    if (challengeError) {
      return NextResponse.json({ error: challengeError.message }, { status: 500 });
    }
    if (!challengeRow) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const challenge = challengeRow as ChallengeRow;
    const allQuestions = parseQuestionsFromConfig(challenge.config);
    if (allQuestions.length === 0) {
      return NextResponse.json(
        { error: 'Challenge has no parseable questions' },
        { status: 422 }
      );
    }

    // Skip questions that already have any approved ref to avoid duplicate work.
    const { data: existingRefs } = await supabase
      .from('talent_challenge_question_refs')
      .select('question_id, status')
      .eq('challenge_id', challenge.id);

    const questionsWithApproved = new Set<string>();
    for (const row of existingRefs || []) {
      if ((row as { status?: string }).status === 'approved') {
        questionsWithApproved.add((row as { question_id?: string }).question_id || '');
      }
    }

    const questions = allQuestions.filter((q) => !questionsWithApproved.has(q.id));
    if (questions.length === 0) {
      return NextResponse.json({
        ok: true,
        challenge_id: challenge.id,
        message: 'All questions already have approved refs',
        suggestions_inserted: 0,
      });
    }

    // Candidate courses: prefer ones tagged to the same domain, fallback to a
    // broader pool. Hard cap to keep the LLM prompt size manageable.
    let coursesQuery = supabase
      .from('learning_courses')
      .select(
        'id, title, title_fr, description, external_provider, external_url, external_url_fr, is_free, partner_name'
      )
      .eq('published', true)
      .order('is_free', { ascending: false })
      .limit(MAX_CANDIDATE_COURSES);

    if (challenge.domain) {
      coursesQuery = coursesQuery.or(
        `partner_name.ilike.%${challenge.domain}%,title.ilike.%${challenge.domain}%`
      );
    }

    const { data: coursesData } = await coursesQuery;
    const courses = (coursesData || []) as CourseRow[];

    const prompt = buildPrompt({ challenge, questions, courses });

    const aiResult = await callAiJson({
      messages: [
        {
          role: 'system',
          content:
            'You are a careful curriculum matcher. Always return valid JSON matching the schema requested.',
        },
        { role: 'user', content: prompt },
      ],
      schema: SuggestResponseSchema,
      temperature: 0.2,
      maxTokens: 1500,
    });

    const courseIds = new Set(courses.map((c) => c.id));
    const questionIdSet = new Set(questions.map((q) => q.id));

    const rowsToInsert: Array<Record<string, unknown>> = [];
    for (const suggestion of aiResult.parsed.suggestions) {
      if (!questionIdSet.has(suggestion.question_id)) continue;
      let order = 0;
      for (const ref of suggestion.refs.slice(0, MAX_REFS_PER_QUESTION)) {
        const courseRef =
          ref.course_id && courseIds.has(ref.course_id) ? ref.course_id : null;
        const externalUrl =
          !courseRef && ref.external_url && ref.external_url.trim()
            ? ref.external_url.trim()
            : null;

        if (!courseRef && !externalUrl) continue;

        rowsToInsert.push({
          challenge_id: challenge.id,
          question_id: suggestion.question_id,
          target_course_id: courseRef,
          target_module_id: null,
          external_provider:
            ref.external_provider && ref.external_provider.trim()
              ? ref.external_provider.trim()
              : null,
          external_url: externalUrl,
          external_url_fr: null,
          status: 'pending',
          suggested_by: 'ai',
          confidence: ref.confidence,
          rationale: ref.rationale,
          display_order: order,
          metadata: { ai_model: aiResult.model, suggested_by_user: userId },
        });
        order += 1;
      }
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        challenge_id: challenge.id,
        suggestions_inserted: 0,
        ai_model: aiResult.model,
        tokens_used: aiResult.tokensUsed,
        message: 'AI returned no usable suggestions',
      });
    }

    const { error: insertError } = await supabase
      .from('talent_challenge_question_refs')
      .insert(rowsToInsert);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      challenge_id: challenge.id,
      suggestions_inserted: rowsToInsert.length,
      questions_processed: questions.length,
      ai_model: aiResult.model,
      tokens_used: aiResult.tokensUsed,
    });
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to generate suggestions',
      },
      { status: 500 }
    );
  }
}
