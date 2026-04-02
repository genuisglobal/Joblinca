import { NextRequest, NextResponse } from 'next/server';

import { authorizeJobImageRequest, JobImageAuthorizationError } from '@/lib/job-image-generator/auth';
import {
  JobImageRequestValidationError,
  parseJobImageRequest,
} from '@/lib/job-image-generator/schema';
import { generateJobMarketingImageBatch } from '@/lib/job-image-generator/service';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({
    route: 'POST /api/generate-job-images',
    auth: 'Admin session or Authorization: Bearer <JOB_IMAGE_GENERATOR_TOKEN>',
    notes: [
      'Accepts either a raw JSON array of jobs or { jobs, options }.',
      'Default delivery is Cloudinary. Set options.delivery=inline for local preview-only runs.',
      'For sustained large batches, move the trigger into a queue-backed worker.',
    ],
    example: {
      jobs: [
        {
          title: 'Accountant',
          location: 'Douala',
          salary: '150,000 XAF',
          company: 'Confidential',
          type: 'Full-time',
        },
      ],
      options: {
        variations: 3,
        concurrency: 4,
        delivery: 'cloudinary',
      },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await authorizeJobImageRequest(request);

    const body = await request.json().catch(() => {
      throw new JobImageRequestValidationError('Invalid JSON body');
    });

    const parsed = parseJobImageRequest(body);
    const result = await generateJobMarketingImageBatch(parsed);

    return NextResponse.json(result, {
      status: result.generated_images > 0 ? 200 : 500,
    });
  } catch (error) {
    if (error instanceof JobImageAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof JobImageRequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('[job-image-generator] batch route failed', error);
    const message =
      error instanceof Error ? error.message : 'Failed to generate job marketing images';
    const status = message.toLowerCase().includes('cloudinary') ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
