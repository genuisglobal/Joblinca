import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: certifications, error } = await supabase.from('certifications').select('*');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(certifications);
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ message: 'Certification issuance not implemented' }, { status: 501 });
}