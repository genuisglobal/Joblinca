import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { recordRegistrationHelpResponse } from '@/lib/registration-officers';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const response = typeof body?.response === 'string' ? body.response.trim().toLowerCase() : '';
  if (response !== 'no') {
    return NextResponse.json({ error: 'Only a no response is supported here' }, { status: 400 });
  }

  const serviceClient = createServiceSupabaseClient();

  try {
    await recordRegistrationHelpResponse(serviceClient, user.id, 'no');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record response' },
      { status: 500 }
    );
  }
}
