import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  LOCALE_COOKIE_NAME,
  normalizeLocale,
} from '@/lib/i18n/locale';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const locale = normalizeLocale(body?.locale);

  if (!locale) {
    return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 });
  }

  const response = NextResponse.json({ success: true, locale });
  response.cookies.set({
    name: LOCALE_COOKIE_NAME,
    value: locale,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from('profiles')
        .update({ preferred_locale: locale })
        .eq('id', user.id);
    }
  } catch (error) {
    console.warn('Locale preference persistence failed', error);
  }

  return response;
}
