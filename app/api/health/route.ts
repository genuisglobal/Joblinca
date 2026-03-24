import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function GET() {
  try {
    const supabase = createServiceSupabaseClient();

    // Lightweight connectivity check — fetches zero rows but proves the
    // database is reachable and responding.
    const { error } = await supabase.from('jobs').select('id').limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { status: 'ok', timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown database error';
    return NextResponse.json(
      { status: 'error', message },
      { status: 503 },
    );
  }
}
