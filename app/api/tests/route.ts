import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: tests, error } = await supabase.from('tests').select('*');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(tests);
}

export async function POST(request: NextRequest) {
  // Only admin can create tests; stub logic here
  return NextResponse.json({ message: 'Test creation not implemented' }, { status: 501 });
}