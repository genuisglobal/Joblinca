import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

const VALID_STATUSES = ['submitted', 'shortlisted', 'interviewed', 'hired', 'rejected'];

// POST: Bulk update application statuses
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { applicationIds, status } = body;

  // Validate input
  if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
    return NextResponse.json({ error: 'applicationIds array is required' }, { status: 400 });
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  // Verify all applications belong to jobs owned by this recruiter
  const { data: applications, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, job_id, jobs:job_id(recruiter_id)')
    .in('id', applicationIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Filter to only applications the user owns
  const ownedApplications = applications?.filter(
    (app) => (app.jobs as any)?.recruiter_id === user.id
  ) || [];

  if (ownedApplications.length === 0) {
    return NextResponse.json({ error: 'No authorized applications found' }, { status: 403 });
  }

  const ownedIds = ownedApplications.map((a) => a.id);

  // Update all owned applications
  const { data: updated, error: updateError } = await supabase
    .from('applications')
    .update({
      status,
      updated_at: new Date().toISOString(),
      reviewed_at: status !== 'submitted' ? new Date().toISOString() : null,
    })
    .in('id', ownedIds)
    .select('id');

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Log activity for each updated application
  const activityRecords = ownedApplications.map((app) => ({
    application_id: app.id,
    actor_id: user.id,
    action: 'status_changed',
    old_value: app.status,
    new_value: status,
    metadata: { bulk_action: true },
  }));

  await supabase.from('application_activity').insert(activityRecords);

  return NextResponse.json({
    success: true,
    updated: updated?.length || 0,
    requested: applicationIds.length,
    authorized: ownedIds.length,
  });
}
