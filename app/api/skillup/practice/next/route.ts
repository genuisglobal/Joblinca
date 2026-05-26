import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { pickNextPracticeQuestion } from '@/lib/skillup/practice';
import type { Locale } from '@/lib/i18n/locale';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const domain = (request.nextUrl.searchParams.get('domain') || '').trim() || null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('preferred_locale')
    .eq('id', user.id)
    .maybeSingle();
  const locale: Locale = profile?.preferred_locale === 'fr' ? 'fr' : 'en';

  const question = await pickNextPracticeQuestion({
    userId: user.id,
    domain,
    locale,
  });

  if (!question) {
    return NextResponse.json({ ok: true, question: null, message: 'No practice questions available' });
  }

  // Don't leak the correct answer to the client.
  return NextResponse.json({
    ok: true,
    locale,
    question: {
      challenge_id: question.challenge_id,
      challenge_title: question.challenge_title,
      domain: question.domain,
      question_id: question.question_id,
      prompt: question.prompt,
      options: question.options,
    },
  });
}
