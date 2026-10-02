/**
 * Turn a stored CV reference into a link a browser can open.
 *
 * CVs in our own buckets are private, so the only working link is a short-
 * lived signed URL minted after the caller's access checks. Call this at the
 * point a server hands a CV link to a client -- never store its result, it
 * expires. External links (e.g. a Google Drive CV) pass through unchanged.
 */

import type { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  APPLICATION_CV_BUCKET,
  CV_SIGNED_URL_TTL_SECONDS,
  PROFILE_CV_BUCKET,
  getApplicationCvPath,
  getHttpUrl,
  getProfileCvPath,
  isPrivateCvReference,
} from '@/lib/storage/resume-links';

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

export async function signCvUrl(
  service: ServiceClient,
  value: unknown,
  ownerId: string,
  ttlSeconds = CV_SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const target =
    (() => {
      const profilePath = getProfileCvPath(value, ownerId);
      if (profilePath) return { bucket: PROFILE_CV_BUCKET, path: profilePath };
      const applicationPath = getApplicationCvPath(value, ownerId);
      if (applicationPath) return { bucket: APPLICATION_CV_BUCKET, path: applicationPath };
      return null;
    })();

  if (target) {
    const { data, error } = await service.storage.from(target.bucket).createSignedUrl(target.path, ttlSeconds);
    if (error || !data?.signedUrl) {
      console.error('[sign-cv] could not sign CV', { bucket: target.bucket, ownerId, error: error?.message });
      return null;
    }
    return data.signedUrl;
  }

  // A private-bucket URL that isn't in the owner's folder is never handed out.
  if (isPrivateCvReference(value)) return null;
  return getHttpUrl(value);
}
