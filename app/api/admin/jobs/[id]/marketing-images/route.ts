import { NextResponse, type NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/admin';
import {
  generateAndPersistApprovedJobImage,
  listLatestJobMarketingImages,
} from '@/lib/job-image-generator/service';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

type JobMarketingRouteContext = {
  params: { id: string };
};

async function loadJobForImages(jobId: string) {
  const serviceClient = createServiceSupabaseClient();
  const { data: job, error } = await serviceClient
    .from('jobs')
    .select('id, title, image_url, approval_status, company_name, location, salary, work_type, job_type')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load job');
  }

  return job;
}

async function buildMarketingImagesResponse(jobId: string) {
  const job = await loadJobForImages(jobId);
  if (!job) {
    return null;
  }

  const images = await listLatestJobMarketingImages(jobId);
  return {
    job_id: job.id,
    job_title: job.title,
    primary_image_url: job.image_url || null,
    total: images.length,
    images: images.map((image) => ({
      variation: image.variation,
      headline: image.headline,
      image_url: image.imageUrl,
      public_id: image.publicId,
      template_version: image.templateVersion,
      width: image.width,
      height: image.height,
      created_at: image.createdAt,
      updated_at: image.updatedAt,
      is_primary: job.image_url === image.imageUrl,
    })),
  };
}

function getErrorStatus(message: string): number {
  return message === 'Authentication required'
    ? 401
    : message === 'Admin access required'
      ? 403
      : message === 'Job not found'
        ? 404
        : message === 'Only approved jobs can regenerate marketing images'
          ? 409
          : 500;
}

export async function GET(_request: NextRequest, { params }: JobMarketingRouteContext) {
  try {
    await requireAdmin();
    const payload = await buildMarketingImagesResponse(params.id);

    if (!payload) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load marketing images';
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) });
  }
}

export async function POST(request: NextRequest, { params }: JobMarketingRouteContext) {
  try {
    const admin = await requireAdmin();
    const job = await loadJobForImages(params.id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.approval_status !== 'approved') {
      return NextResponse.json(
        { error: 'Only approved jobs can regenerate marketing images' },
        { status: 409 }
      );
    }

    const generated = await generateAndPersistApprovedJobImage({
      jobId: job.id,
      title: job.title,
      company: job.company_name,
      salary: job.salary ? String(job.salary) : null,
      location: job.location,
      type: job.work_type || job.job_type,
      jobUrl: `${new URL(request.url).origin}/jobs/${job.id}`,
    });

    if (!generated) {
      throw new Error('Failed to regenerate job marketing images');
    }

    const serviceClient = createServiceSupabaseClient();
    const { error: auditError } = await serviceClient.from('admin_audit_log').insert({
      action: 'admin_regenerate_job_marketing_images',
      admin_id: admin.userId,
      admin_type: admin.adminType,
      target_table: 'jobs',
      target_id: job.id,
      new_values: {
        generated_variations: generated.variants.map((variant) => variant.variation),
        primary_image_url: generated.primaryImageUrl,
      },
    });

    if (auditError) {
      console.warn('Admin job marketing image audit log failed', auditError);
    }

    const payload = await buildMarketingImagesResponse(params.id);
    return NextResponse.json({
      success: true,
      regenerated: true,
      ...payload,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to regenerate marketing images';
    return NextResponse.json({ error: message }, { status: getErrorStatus(message) });
  }
}
