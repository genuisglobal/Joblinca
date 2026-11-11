/**
 * Recruiter verification documents (ID card, selfie, business registration)
 * live in the private `documents` bucket under verifications/<user id>/...
 * Only the service role can read it; admins see them through short-lived
 * signed URLs minted here when the verifications page renders.
 */

import type { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getHttpUrl, parseStorageObjectReference, normalizeStoragePath } from '@/lib/storage/resume-links';

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

export const DOCUMENTS_BUCKET = 'documents';
/** Admins keep the review page open while working through a queue. */
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const VERIFICATION_DOCUMENT_FIELDS = ['id_document_url', 'selfie_url', 'business_registration_url'] as const;
type DocField = (typeof VERIFICATION_DOCUMENT_FIELDS)[number];

/** Path inside the documents bucket for a stored verification URL, or null. */
export function getVerificationDocumentPath(value: unknown): string | null {
  const reference = parseStorageObjectReference(value);
  const path = reference ? (reference.bucket === DOCUMENTS_BUCKET ? reference.path : null) : normalizeStoragePath(value);
  return path && path.startsWith('verifications/') ? path : null;
}

/**
 * Replace each verification's document URLs with signed links. Values that
 * point into the documents bucket but can't be signed become null -- a raw
 * private URL is never handed to the browser.
 */
export async function signVerificationDocuments<T extends Partial<Record<DocField, string | null>>>(
  service: ServiceClient,
  rows: T[],
  ttlSeconds = DOCUMENT_SIGNED_URL_TTL_SECONDS
): Promise<T[]> {
  const paths = new Set<string>();
  for (const row of rows) {
    for (const field of VERIFICATION_DOCUMENT_FIELDS) {
      const path = getVerificationDocumentPath(row[field]);
      if (path) paths.add(path);
    }
  }

  const signedByPath = new Map<string, string>();
  if (paths.size > 0) {
    const { data, error } = await service.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrls([...paths], ttlSeconds);
    if (error) {
      console.error('[sign-documents] could not sign verification documents', { error: error.message });
    }
    for (const entry of data || []) {
      if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
    }
  }

  return rows.map((row) => {
    const next = { ...row };
    for (const field of VERIFICATION_DOCUMENT_FIELDS) {
      const value = row[field];
      if (!value) continue;
      const path = getVerificationDocumentPath(value);
      if (path) {
        (next as Record<DocField, string | null>)[field] = signedByPath.get(path) ?? null;
      } else {
        // Anything else pointing at Supabase storage (another bucket, an
        // odd path like ../) is not handed out; only genuinely external
        // links pass through.
        const isStorageUrl = /\/storage\/v1\/object\//i.test(value) || Boolean(parseStorageObjectReference(value));
        (next as Record<DocField, string | null>)[field] = isStorageUrl ? null : getHttpUrl(value);
      }
    }
    return next;
  });
}
