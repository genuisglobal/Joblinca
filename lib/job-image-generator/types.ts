export const JOB_IMAGE_WIDTH = 1080;
export const JOB_IMAGE_HEIGHT = 1920;
export const MAX_JOBS_PER_REQUEST = 100;
export const MAX_VARIATIONS_PER_JOB = 3;
export const DEFAULT_JOB_IMAGE_TEMPLATE_VERSION = 'joblinca-reels-v1';

export interface JobImageInput {
  id?: string | number | null;
  title: string;
  location?: string | null;
  salary?: string | null;
  company?: string | null;
  type?: string | null;
  applyUrl?: string | null;
  jobUrl?: string | null;
}

export interface NormalizedJobImageInput {
  sourceJobId: string | null;
  sourceJobKey: string;
  title: string;
  location: string;
  salary: string;
  company: string;
  type: string;
  applyUrl: string | null;
  jobUrl: string | null;
}

export type JobImageVariationKey = 'urgent-location' | 'needed-now' | 'apply-today';
export type JobImageDelivery = 'cloudinary' | 'inline';

export interface JobImageVariation {
  key: JobImageVariationKey;
  headline: string;
  badgeText: string;
  ctaText: string;
}

export interface JobImageGenerationOptions {
  variationCount: number;
  concurrency: number;
  delivery: JobImageDelivery;
  cloudinaryFolder?: string;
  includeHtml?: boolean;
}

export interface ParsedJobImageRequest {
  jobs: NormalizedJobImageInput[];
  options: JobImageGenerationOptions;
}

export interface JobImageResult {
  result_index: number;
  job_index: number;
  variation_index: number;
  source_job_id: string | null;
  source_job_key: string;
  job_title: string;
  headline: string;
  variation: JobImageVariationKey;
  image_url: string;
  public_id?: string;
  cached: boolean;
  delivery: JobImageDelivery;
  width: number;
  height: number;
  html?: string;
}

export interface JobImageError {
  job_index: number;
  variation_index: number;
  source_job_key: string;
  job_title: string;
  variation: JobImageVariationKey;
  error: string;
}

export interface JobImageBatchResult {
  ok: boolean;
  template_version: string;
  requested_jobs: number;
  requested_images: number;
  generated_images: number;
  cached_images: number;
  failed_images: number;
  duration_ms: number;
  results: JobImageResult[];
  errors: JobImageError[];
  warnings: string[];
}

export interface CloudinaryUploadResult {
  imageUrl: string;
  publicId: string;
  bytes: number;
  version: string | number | null;
}
