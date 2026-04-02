import { createServiceSupabaseClient } from '@/lib/supabase/service';

import type { NormalizedJobImageInput } from './types';

let cacheDisabled = false;
let cacheDisabledReason: string | null = null;

function disableCache(reason: string, error?: unknown): void {
  if (!cacheDisabled) {
    cacheDisabled = true;
    cacheDisabledReason = reason;
    console.warn('[job-image-cache] disabling cache:', reason, error);
  }
}

export async function findCachedJobImage(
  inputHash: string
): Promise<{ imageUrl: string; publicId: string } | null> {
  if (cacheDisabled) {
    return null;
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('job_marketing_assets')
      .select('image_url, cloudinary_public_id')
      .eq('input_hash', inputHash)
      .maybeSingle();

    if (error) {
      disableCache(error.message, error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      imageUrl: String(data.image_url),
      publicId: String(data.cloudinary_public_id),
    };
  } catch (error) {
    disableCache('Supabase service client unavailable for cache lookups.', error);
    return null;
  }
}

export async function storeCachedJobImage(params: {
  inputHash: string;
  variationKey: string;
  templateVersion: string;
  job: NormalizedJobImageInput;
  imageUrl: string;
  publicId: string;
  width: number;
  height: number;
}): Promise<void> {
  if (cacheDisabled) {
    return;
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from('job_marketing_assets').upsert(
      {
        input_hash: params.inputHash,
        source_job_id: params.job.sourceJobId,
        source_job_key: params.job.sourceJobKey,
        template_version: params.templateVersion,
        variation_key: params.variationKey,
        cloudinary_public_id: params.publicId,
        image_url: params.imageUrl,
        width: params.width,
        height: params.height,
        job_payload: params.job,
      },
      { onConflict: 'input_hash' }
    );

    if (error) {
      disableCache(error.message, error);
    }
  } catch (error) {
    disableCache('Supabase service client unavailable for cache writes.', error);
  }
}

export function getJobImageCacheStatus(): { enabled: boolean; reason?: string } {
  return cacheDisabled ? { enabled: false, reason: cacheDisabledReason || undefined } : { enabled: true };
}
