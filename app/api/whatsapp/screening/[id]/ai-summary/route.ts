import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { regenerateWhatsAppAiSummary } from '@/lib/whatsapp-screening/service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = id.trim().toLowerCase();

    if (!UUID_REGEX.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid session id' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // RLS on wa_screening_sessions ensures only owning recruiter/admin can read this row.
    const { data: authorizedSession, error: sessionError } = await supabase
      .from('wa_screening_sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json({ error: 'Failed to read session' }, { status: 500 });
    }
    if (!authorizedSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const result = await regenerateWhatsAppAiSummary(sessionId);
    const statusCode = result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to regenerate AI summary',
      },
      { status: 500 }
    );
  }
}
