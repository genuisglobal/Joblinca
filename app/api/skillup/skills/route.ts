import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { buildSkillProfile } from '@/lib/skillup/skill-mapping';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const skillProfile = await buildSkillProfile(user.id, supabase);
    return NextResponse.json(skillProfile);
  } catch (err) {
    console.error('Failed to build skill profile:', err);
    return NextResponse.json(
      { error: 'Failed to build skill profile' },
      { status: 500 },
    );
  }
}
