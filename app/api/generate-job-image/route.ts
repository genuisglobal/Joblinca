import { NextRequest, NextResponse } from 'next/server';

import { getRateLimitIdentifier, rateLimit } from '@/lib/rate-limit';
import {
  generateSingleJobMarketingImage,
  resolvePreferredJobImageDelivery,
} from '@/lib/job-image-generator/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const limit = await rateLimit(getRateLimitIdentifier(request), {
    requests: 10,
    window: '1m',
  });

  if (!limit.allowed) {
    return limit.response!;
  }

  try {
    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';

    if (!title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 });
    }

    const image = await generateSingleJobMarketingImage(
      {
        title,
        company: body?.company ?? body?.companyName,
        salary: typeof body?.salary === 'string' ? body.salary : undefined,
        location: typeof body?.location === 'string' ? body.location : undefined,
        type: typeof body?.type === 'string' ? body.type : body?.workType,
      },
      {
        delivery: resolvePreferredJobImageDelivery(),
      }
    );

    if (!image) {
      return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
    }

    return NextResponse.json({
      imageUrl: image.image_url,
      variation: image.variation,
      headline: image.headline,
      publicId: image.public_id ?? null,
      cached: image.cached,
    });
  } catch (error) {
    console.error('[job-image-generator] single route failed', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate image',
      },
      { status: 500 }
    );
  }
}
