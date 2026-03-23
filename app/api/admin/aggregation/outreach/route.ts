import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/admin/aggregation/outreach
 *
 * List discovered jobs that have contact info (email, phone, or WhatsApp),
 * with optional filtering by source, outreach status, and search.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const source = searchParams.get('source');
  const status = searchParams.get('status'); // outreach lead status filter
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = 50;

  const supabase = createServerSupabaseClient();

  // Fetch discovered jobs that have at least one contact field
  let query = supabase
    .from('discovered_jobs')
    .select(
      `
      id,
      title,
      company_name,
      source_name,
      location,
      original_job_url,
      contact_email,
      contact_phone,
      contact_whatsapp,
      recruiter_name,
      trust_score,
      ingestion_status,
      discovered_at,
      posted_at,
      expires_at
      `
    )
    .or('contact_email.not.is.null,contact_phone.not.is.null,contact_whatsapp.not.is.null')
    .order('discovered_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (source) {
    query = query.eq('source_name', source);
  }

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,company_name.ilike.%${search}%,contact_email.ilike.%${search}%`
    );
  }

  const { data: jobs, error: jobsError } = await query;

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  // Fetch outreach leads for these jobs
  const jobIds = (jobs || []).map((j) => j.id);
  let leads: Record<string, any> = {};

  if (jobIds.length > 0) {
    const { data: leadsData } = await supabase
      .from('recruiter_outreach_leads')
      .select('id, discovered_job_id, status, channel, notes, last_contact_at, seeker_count, created_at')
      .in('discovered_job_id', jobIds);

    if (leadsData) {
      for (const lead of leadsData) {
        leads[lead.discovered_job_id] = lead;
      }
    }
  }

  // Combine jobs with their outreach status
  const enriched = (jobs || []).map((job) => ({
    ...job,
    outreach: leads[job.id] || null,
  }));

  // If filtering by outreach status
  let result = enriched;
  if (status === 'contacted') {
    result = enriched.filter((j) => j.outreach?.status === 'contacted');
  } else if (status === 'responded') {
    result = enriched.filter((j) => j.outreach?.status === 'responded');
  } else if (status === 'new') {
    result = enriched.filter((j) => !j.outreach);
  }

  // Get unique sources for filter dropdown
  const { data: sources } = await supabase
    .from('discovered_jobs')
    .select('source_name')
    .or('contact_email.not.is.null,contact_phone.not.is.null,contact_whatsapp.not.is.null')
    .limit(100);

  const uniqueSources = [...new Set((sources || []).map((s) => s.source_name))].sort();

  return NextResponse.json({
    jobs: result,
    sources: uniqueSources,
    total: result.length,
    page,
  });
}

/**
 * POST /api/admin/aggregation/outreach
 *
 * Create or update an outreach lead for a discovered job.
 * Used when an admin wants to track that they've contacted a job poster.
 */
export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    discovered_job_id,
    channel,
    notes,
    status: outreachStatus,
    seeker_count,
  } = body as {
    discovered_job_id: string;
    channel?: 'email' | 'phone' | 'whatsapp' | 'manual';
    notes?: string;
    status?: string;
    seeker_count?: number;
  };

  if (!discovered_job_id) {
    return NextResponse.json({ error: 'discovered_job_id is required' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Get the discovered job's contact info
  const { data: job } = await supabase
    .from('discovered_jobs')
    .select('id, company_name, contact_email, contact_phone, contact_whatsapp')
    .eq('id', discovered_job_id)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Discovered job not found' }, { status: 404 });
  }

  // Check for existing lead
  const { data: existing } = await supabase
    .from('recruiter_outreach_leads')
    .select('id')
    .eq('discovered_job_id', discovered_job_id)
    .maybeSingle();

  if (existing) {
    // Update existing lead
    const updates: Record<string, any> = {};
    if (outreachStatus) updates.status = outreachStatus;
    if (channel) updates.channel = channel;
    if (notes !== undefined) updates.notes = notes;
    if (seeker_count !== undefined) updates.seeker_count = seeker_count;
    if (outreachStatus === 'contacted' || outreachStatus === 'responded') {
      updates.last_contact_at = new Date().toISOString();
    }

    const { error: updateErr } = await supabase
      .from('recruiter_outreach_leads')
      .update(updates)
      .eq('id', existing.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: 'updated', leadId: existing.id });
  }

  // Create new lead
  const { data: newLead, error: insertErr } = await supabase
    .from('recruiter_outreach_leads')
    .insert({
      discovered_job_id,
      company_name: job.company_name,
      contact_email: job.contact_email,
      contact_phone: job.contact_phone,
      contact_whatsapp: job.contact_whatsapp,
      channel: channel || 'manual',
      status: outreachStatus || 'queued',
      notes: notes || null,
      seeker_count: seeker_count || 0,
      owner_admin_id: admin.userId,
      last_contact_at: outreachStatus === 'contacted' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: 'created', leadId: newLead?.id });
}
