import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  APPLICATION_CV_BUCKET,
  getApplicationCvPath,
  getHttpUrl,
  parseStorageObjectReference,
} from '@/lib/storage/resume-links';

export const dynamic = 'force-dynamic';

const RESUME_URL_TTL_SECONDS = 10 * 60;

type Relation<T> = T | T[] | null | undefined;

interface ApplicationResumeRow {
  id: string;
  applicant_id: string;
  resume_url: string | null;
  candidate_snapshot: unknown;
  jobs: Relation<{
    recruiter_id: string | null;
  }>;
}

function normalizeRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getSnapshotResumePath(snapshot: unknown, applicantId: string) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }

  return getApplicationCvPath((snapshot as Record<string, unknown>).resumePath, applicantId);
}

function getApplicationResumePath(application: ApplicationResumeRow) {
  return (
    getSnapshotResumePath(application.candidate_snapshot, application.applicant_id) ||
    getApplicationCvPath(application.resume_url, application.applicant_id)
  );
}

function toErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to open resume';
  const status =
    message === 'Authentication required'
      ? 401
      : message === 'Not authorized'
        ? 403
        : message === 'Resume not found' || message === 'Application not found'
          ? 404
          : 500;

  return NextResponse.json({ error: message }, { status });
}

function redirectNoStore(url: string) {
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Authentication required');
    }

    const { data, error } = await supabase
      .from('applications')
      .select(
        `
        id,
        applicant_id,
        resume_url,
        candidate_snapshot,
        jobs:job_id (
          recruiter_id
        )
      `
      )
      .eq('id', params.id)
      .maybeSingle();

    if (error || !data) {
      throw new Error('Application not found');
    }

    const application = data as ApplicationResumeRow;
    const job = normalizeRelation(application.jobs);
    const { isAdmin } = await checkAdminStatus();
    const isApplicant = application.applicant_id === user.id;
    const isRecruiter = job?.recruiter_id === user.id;

    if (!isApplicant && !isRecruiter && !isAdmin) {
      throw new Error('Not authorized');
    }

    const resumePath = getApplicationResumePath(application);
    if (resumePath) {
      const serviceClient = createServiceSupabaseClient();
      const { data: signed, error: signedError } = await serviceClient.storage
        .from(APPLICATION_CV_BUCKET)
        .createSignedUrl(resumePath, RESUME_URL_TTL_SECONDS);

      if (signedError || !signed?.signedUrl) {
        console.error('Failed to create signed resume URL', {
          applicationId: application.id,
          applicantId: application.applicant_id,
          error: signedError,
        });
        throw new Error('Resume not found');
      }

      return redirectNoStore(signed.signedUrl);
    }

    const storageReference = parseStorageObjectReference(application.resume_url);
    if (storageReference?.bucket === APPLICATION_CV_BUCKET) {
      throw new Error('Resume not found');
    }

    const directUrl = getHttpUrl(application.resume_url);
    if (!directUrl) {
      throw new Error('Resume not found');
    }

    return redirectNoStore(directUrl);
  } catch (error) {
    return toErrorResponse(error);
  }
}
