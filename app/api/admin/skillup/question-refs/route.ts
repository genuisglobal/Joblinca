import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

interface RefRow {
  id: string;
  challenge_id: string;
  question_id: string;
  target_course_id: string | null;
  external_provider: string | null;
  external_url: string | null;
  external_url_fr: string | null;
  status: string;
  suggested_by: string;
  suggested_at: string;
  confidence: number | null;
  rationale: string | null;
  display_order: number;
  metadata: Record<string, unknown> | null;
}

interface ChallengeLookupRow {
  id: string;
  title: string;
  title_fr: string | null;
  domain: string | null;
  config: unknown;
}

interface CourseLookupRow {
  id: string;
  title: string;
  title_fr: string | null;
  external_provider: string | null;
  external_url: string | null;
  is_free: boolean | null;
}

function questionPromptFromConfig(
  config: unknown,
  questionId: string
): string | null {
  if (typeof config !== 'object' || config === null) return null;
  const record = config as Record<string, unknown>;
  let raw: unknown = record.questions;
  if (!Array.isArray(raw) && Array.isArray(record.quiz_questions)) {
    raw = record.quiz_questions;
  }
  if (!Array.isArray(raw)) return null;

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (typeof item !== 'object' || item === null) continue;
    const q = item as Record<string, unknown>;
    const id = typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${i + 1}`;
    if (id === questionId && typeof q.question === 'string') {
      return q.question;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createServerSupabaseClient();

    const searchParams = request.nextUrl.searchParams;
    const statusFilter = (searchParams.get('status') || 'pending').trim();
    const challengeIdFilter = (searchParams.get('challenge_id') || '').trim();
    const limitRaw = Number(searchParams.get('limit') || '');
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
      : 50;

    let query = supabase
      .from('talent_challenge_question_refs')
      .select(
        'id, challenge_id, question_id, target_course_id, external_provider, external_url, external_url_fr, status, suggested_by, suggested_at, confidence, rationale, display_order, metadata'
      )
      .order('suggested_at', { ascending: true })
      .limit(limit);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (challengeIdFilter) {
      query = query.eq('challenge_id', challengeIdFilter);
    }

    const { data: refsData, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const refs = (refsData || []) as RefRow[];
    if (refs.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const challengeIds = Array.from(new Set(refs.map((r) => r.challenge_id)));
    const courseIds = Array.from(
      new Set(refs.map((r) => r.target_course_id).filter((id): id is string => !!id))
    );

    const [{ data: challengeRows }, { data: courseRows }] = await Promise.all([
      supabase
        .from('talent_challenges')
        .select('id, title, title_fr, domain, config')
        .in('id', challengeIds),
      courseIds.length > 0
        ? supabase
            .from('learning_courses')
            .select('id, title, title_fr, external_provider, external_url, is_free')
            .in('id', courseIds)
        : Promise.resolve({ data: [] as CourseLookupRow[] }),
    ]);

    const challengeById = new Map<string, ChallengeLookupRow>();
    for (const row of (challengeRows || []) as ChallengeLookupRow[]) {
      challengeById.set(row.id, row);
    }
    const courseById = new Map<string, CourseLookupRow>();
    for (const row of (courseRows || []) as CourseLookupRow[]) {
      courseById.set(row.id, row);
    }

    const items = refs.map((ref) => {
      const challenge = challengeById.get(ref.challenge_id) || null;
      const course = ref.target_course_id ? courseById.get(ref.target_course_id) || null : null;
      return {
        id: ref.id,
        challenge_id: ref.challenge_id,
        challenge_title: challenge?.title || null,
        challenge_domain: challenge?.domain || null,
        question_id: ref.question_id,
        question_prompt: challenge ? questionPromptFromConfig(challenge.config, ref.question_id) : null,
        target_course: course
          ? {
              id: course.id,
              title: course.title,
              external_provider: course.external_provider,
              external_url: course.external_url,
              is_free: Boolean(course.is_free),
            }
          : null,
        external_provider: ref.external_provider,
        external_url: ref.external_url,
        status: ref.status,
        suggested_by: ref.suggested_by,
        suggested_at: ref.suggested_at,
        confidence: ref.confidence,
        rationale: ref.rationale,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load question refs',
      },
      { status: 500 }
    );
  }
}
