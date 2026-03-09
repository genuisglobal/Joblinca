import { NextResponse, type NextRequest } from 'next/server';
import {
  normalizeInterviewAutomationSettings,
} from '@/lib/interview-scheduling/automation';
import {
  loadJobInterviewAutomationSettings,
  upsertJobInterviewAutomationSettings,
} from '@/lib/interview-scheduling/server';
import {
  requireAuthenticatedUser,
  requireRecruiterOwnedJob,
} from '@/lib/hiring-pipeline/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedJob(params.id, user.id);
    const settings = await loadJobInterviewAutomationSettings(params.id);

    return NextResponse.json({ settings });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load interview automation settings';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Job not found'
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedJob(params.id, user.id);
    const body = await request.json();
    const settings = normalizeInterviewAutomationSettings(body?.settings || {});
    const savedSettings = await upsertJobInterviewAutomationSettings({
      jobId: params.id,
      settings,
    });

    return NextResponse.json({ settings: savedSettings });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to save interview automation settings';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Job not found'
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
