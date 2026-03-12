import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import {
  LEGACY_APPLICATION_STATUSES,
  isLegacyApplicationStatus,
  type LegacyApplicationStatus,
} from '@/lib/hiring-pipeline/mapping';
import { moveApplicationToLegacyStatus } from '@/lib/hiring-pipeline/transitions';
const VALID_STATUSES = [...LEGACY_APPLICATION_STATUSES];

// POST: Bulk update application statuses
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { isAdmin } = await checkAdminStatus();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { applicationIds, status } = body;

  // Validate input
  if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
    return NextResponse.json({ error: 'applicationIds array is required' }, { status: 400 });
  }

  if (!isLegacyApplicationStatus(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  // Verify all applications belong to jobs owned by this recruiter
  const { data: applications, error: fetchError } = await supabase
    .from('applications')
    .select('id, status, reviewed_at, job_id, jobs:job_id(recruiter_id)')
    .in('id', applicationIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Filter to only applications the user owns
  const ownedApplications =
    isAdmin
      ? applications || []
      : applications?.filter((app) => (app.jobs as any)?.recruiter_id === user.id) || [];

  if (ownedApplications.length === 0) {
    return NextResponse.json({ error: 'No authorized applications found' }, { status: 403 });
  }

  const transitionResults = await Promise.allSettled(
    ownedApplications.map(async (app) => {
      const transition = await moveApplicationToLegacyStatus({
        applicationId: app.id,
        actorId: user.id,
        status: status as LegacyApplicationStatus,
        reason: 'bulk_legacy_status_update',
        trigger: 'applications_bulk_route',
      });

      if (status !== 'submitted' && !app.reviewed_at) {
        const { error: reviewError } = await supabase
          .from('applications')
          .update({
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', app.id);

        if (reviewError) {
          throw new Error(reviewError.message);
        }
      }

      return transition;
    })
  );

  const failures = transitionResults.flatMap((result, index) =>
    result.status === 'fulfilled'
      ? []
      : [
          {
            applicationId: ownedApplications[index]?.id,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
          },
        ]
  );

  const updatedCount = transitionResults.filter((result) => result.status === 'fulfilled').length;

  return NextResponse.json({
    success: failures.length === 0,
    updated: updatedCount,
    requested: applicationIds.length,
    authorized: ownedApplications.length,
    failures,
  });
}
