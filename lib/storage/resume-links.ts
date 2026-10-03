export const APPLICATION_CV_BUCKET = 'application-cvs';

/**
 * Profile CVs (job_seeker_profiles / talent_profiles.resume_url). Private:
 * objects live at `resumes/<userId>/...` and are only ever served through
 * short-lived signed URLs.
 */
export const PROFILE_CV_BUCKET = 'resumes';

/** How long a signed CV link stays valid once handed to a browser. */
export const CV_SIGNED_URL_TTL_SECONDS = 10 * 60;

export interface StorageObjectReference {
  bucket: string;
  path: string;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeStoragePath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const segments = value
    .trim()
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (
    segments.length === 0 ||
    segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))
  ) {
    return null;
  }

  return segments.join('/');
}

export function isStoragePathOwnedByApplicant(path: string, applicantId: string) {
  return path.split('/')[0] === applicantId;
}

export function buildStoragePublicUrl(
  bucket: string,
  path: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  const normalizedPath = normalizeStoragePath(path);
  if (!supabaseUrl || !normalizedPath) {
    return null;
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

export function parseStorageObjectReference(value: unknown): StorageObjectReference | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('storage://')) {
    const withoutScheme = trimmed.slice('storage://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex > 0) {
      const bucket = withoutScheme.slice(0, slashIndex);
      const path = normalizeStoragePath(withoutScheme.slice(slashIndex + 1));
      return path ? { bucket, path } : null;
    }
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean).map(safeDecode);
  const objectIndex = segments.findIndex(
    (segment, index) =>
      segment === 'object' && segments[index - 2] === 'storage' && segments[index - 1] === 'v1'
  );

  if (objectIndex === -1) {
    return null;
  }

  const accessKind = segments[objectIndex + 1];
  if (!['authenticated', 'public', 'sign'].includes(accessKind)) {
    return null;
  }

  const bucket = segments[objectIndex + 2];
  const path = normalizeStoragePath(segments.slice(objectIndex + 3).join('/'));
  return bucket && path ? { bucket, path } : null;
}

export function getApplicationCvPath(value: unknown, applicantId: string): string | null {
  const directPath = normalizeStoragePath(value);
  if (directPath && isStoragePathOwnedByApplicant(directPath, applicantId)) {
    return directPath;
  }

  const reference = parseStorageObjectReference(value);
  if (
    reference?.bucket === APPLICATION_CV_BUCKET &&
    isStoragePathOwnedByApplicant(reference.path, applicantId)
  ) {
    return reference.path;
  }

  return null;
}

/**
 * Path of a profile CV inside the private `resumes` bucket, only if it sits
 * in `owner`'s folder. Accepts the stored public URL (what resume_url has
 * always held), a signed URL, a storage:// reference, or a bare path.
 */
export function getProfileCvPath(value: unknown, ownerId: string): string | null {
  const reference = parseStorageObjectReference(value);
  const path = reference
    ? reference.bucket === PROFILE_CV_BUCKET
      ? reference.path
      : null
    : normalizeStoragePath(value);
  if (!path) return null;

  const segments = path.split('/');
  return segments[0] === 'resumes' && segments[1] === ownerId && segments.length >= 3 ? path : null;
}

/** True for URLs into one of our private CV buckets (never safe to hand out raw). */
export function isPrivateCvReference(value: unknown): boolean {
  const reference = parseStorageObjectReference(value);
  return reference?.bucket === PROFILE_CV_BUCKET || reference?.bucket === APPLICATION_CV_BUCKET;
}

export function getHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
