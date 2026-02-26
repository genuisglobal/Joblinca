import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: sessions, error } = await supabase
    .from('career_counselor_sessions')
    .select('id, title, updated_at, messages')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to fetch sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }

  const summaries = (sessions || []).map((s: any) => ({
    id: s.id,
    title: s.title,
    updated_at: s.updated_at,
    message_count: Array.isArray(s.messages) ? s.messages.length : 0,
  }));

  return NextResponse.json(summaries);
}
