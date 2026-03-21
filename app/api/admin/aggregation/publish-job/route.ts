import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { detectContentLanguage, normalizeLocale } from '@/lib/i18n/locale';

function isMissingJobLanguageColumnError(error: { message?: string | null } | null) {
  return Boolean(error?.message?.includes('column jobs.language does not exist'));
}

export const runtime = 'nodejs';

/**
 * POST /api/admin/aggregation/publish-job
 *
 * Promotes a discovered job to the main `jobs` table so it appears
 * on the public site. Links both records via origin_discovered_job_id
 * and native_job_id.
 *
 * Body: { "discoveredJobId": "uuid" }
 *
 * Bulk: { "discoveredJobIds": ["uuid", ...] }
 */
export async function POST(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const { userId } = await requireAdmin();
    adminUserId = userId;
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!adminUserId) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  try {
    const body = await request.json();
    const ids: string[] = body.discoveredJobIds
      ? body.discoveredJobIds
      : body.discoveredJobId
        ? [body.discoveredJobId]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No job IDs provided' }, { status: 400 });
    }

    // Fetch discovered jobs
    const { data: discoveredJobs, error: fetchErr } = await supabase
      .from('discovered_jobs')
      .select('*')
      .in('id', ids);

    if (fetchErr || !discoveredJobs) {
      return NextResponse.json(
        { error: 'Failed to fetch discovered jobs', details: fetchErr?.message },
        { status: 500 }
      );
    }

    const results: { discoveredJobId: string; jobId: string; title: string }[] = [];
    const errors: { discoveredJobId: string; error: string }[] = [];

    for (const dj of discoveredJobs) {
      // Skip if already published
      if (dj.native_job_id) {
        errors.push({ discoveredJobId: dj.id, error: 'Already published' });
        continue;
      }

      const nowIso = new Date().toISOString();

      // Determine the original apply URL
      const originalApplyUrl = dj.apply_url || dj.original_job_url || null;
      const description =
        dj.description_raw ||
        dj.description_clean ||
        `${dj.title}\n\nApply at: ${originalApplyUrl || ''}`;
      const language =
        normalizeLocale(dj.language) ||
        detectContentLanguage(`${dj.title} ${description}`);

      // Insert into jobs table
      const insertPayload = {
        title: dj.title,
        description,
        language,
        location: dj.location || 'Cameroon',
        company_name: dj.company_name || null,
        company_logo_url: null,
        work_type: dj.remote_type || 'onsite',
        external_url: originalApplyUrl,
        salary: dj.salary_min || null,
        published: true,
        approval_status: 'approved',
        approved_at: nowIso,
        approved_by: adminUserId,
        visibility: 'public',
        lifecycle_status: 'live',
        // Enable both "Apply with Joblinca" and "Apply on Original Source"
        apply_method: originalApplyUrl ? 'multiple' : 'joblinca',
        external_apply_url: originalApplyUrl,
        apply_email: dj.contact_email || null,
        apply_phone: dj.contact_phone || null,
        origin_type: 'admin_import',
        origin_discovered_job_id: dj.id,
        source_attribution_json: {
          source_name: dj.source_name,
          source_url: dj.source_url,
          original_job_url: dj.original_job_url,
          trust_score: dj.trust_score,
          discovered_at: dj.discovered_at,
        },
        closes_at: dj.expires_at || null,
        recruiter_id: null,
      };

      let { data: newJob, error: insertErr } = await supabase
        .from('jobs')
        .insert(insertPayload)
        .select('id')
        .single();

      if (isMissingJobLanguageColumnError(insertErr)) {
        const { language: _language, ...fallbackInsertPayload } = insertPayload;
        const fallbackResult = await supabase
          .from('jobs')
          .insert(fallbackInsertPayload)
          .select('id')
          .single();

        newJob = fallbackResult.data;
        insertErr = fallbackResult.error;
      }

      if (insertErr || !newJob) {
        console.error(`[publish-job] Insert error for ${dj.id}:`, insertErr?.message);
        errors.push({ discoveredJobId: dj.id, error: insertErr?.message || 'Insert failed' });
        continue;
      }

      // Link discovered job back to native job
      await supabase
        .from('discovered_jobs')
        .update({
          native_job_id: newJob.id,
          ingestion_status: 'published',
          published_at: nowIso,
          verification_status: 'verified',
        })
        .eq('id', dj.id);

      results.push({
        discoveredJobId: dj.id,
        jobId: newJob.id,
        title: dj.title,
      });
    }

    return NextResponse.json({
      success: true,
      published: results.length,
      errors: errors.length,
      results,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('[publish-job] Error:', err);
    return NextResponse.json(
      { error: 'Publish failed', details: String(err) },
      { status: 500 }
    );
  }
}
