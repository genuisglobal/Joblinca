import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * Admin management of monitored company career pages.
 *
 * POST   { companyName, url, notes? }        — register a page
 * PATCH  { id, enabled? , notes? }           — toggle / annotate
 * DELETE { id }                              — remove a page
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  try {
    const body = await request.json();
    const companyName = typeof body?.companyName === 'string' ? body.companyName.trim() : '';
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : null;

    if (!companyName || companyName.length < 2) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    let url: URL;
    try {
      url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      return NextResponse.json({ error: 'A valid http(s) URL is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('monitored_career_pages')
      .insert({
        company_name: companyName,
        url: url.toString(),
        notes,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This URL is already monitored' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : null;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.notes === 'string') patch.notes = body.notes.trim().slice(0, 500);

    const { error } = await supabase
      .from('monitored_career_pages')
      .update(patch)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : null;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('monitored_career_pages')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
