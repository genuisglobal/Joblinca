import { createHash } from 'crypto';

import PQueue from 'p-queue';

import { createServiceSupabaseClient } from '@/lib/supabase/service';

import { renderHtmlToPng } from './browser';
import { findCachedJobImage, storeCachedJobImage } from './cache';
import { isCloudinaryConfigured, uploadJobImageToCloudinary } from './cloudinary';
import { normalizeJobImageInput } from './schema';
import { buildJobImageHtml, buildJobImageVariations } from './template';
import type {
  JobImageBatchResult,
  JobImageDelivery,
  JobImageError,
  JobImageGenerationOptions,
  JobImageInput,
  JobImageResult,
  JobImageVariation,
  NormalizedJobImageInput,
  ParsedJobImageRequest,
} from './types';
import {
  DEFAULT_JOB_IMAGE_TEMPLATE_VERSION,
  JOB_IMAGE_HEIGHT,
  JOB_IMAGE_WIDTH,
} from './types';

function slugifySegment(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .replace(/_/g, '-')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'job'
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildInputHash(job: NormalizedJobImageInput, variation: JobImageVariation): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        templateVersion: DEFAULT_JOB_IMAGE_TEMPLATE_VERSION,
        width: JOB_IMAGE_WIDTH,
        height: JOB_IMAGE_HEIGHT,
        variation,
        job,
      })
    )
    .digest('hex');
}

function buildCloudinaryPublicId(
  job: NormalizedJobImageInput,
  variation: JobImageVariation,
  inputHash: string
): string {
  const identity = job.sourceJobId || `${slugifySegment(job.title)}-${slugifySegment(job.location)}`;
  return `${identity}-${variation.key}-${inputHash.slice(0, 12)}`.slice(0, 120);
}

function toDataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export function resolvePreferredJobImageDelivery(): JobImageDelivery {
  return isCloudinaryConfigured() ? 'cloudinary' : 'inline';
}

type TaskOutcome = { result: JobImageResult } | { error: JobImageError };

export async function generateJobMarketingImageBatch(
  request: ParsedJobImageRequest
): Promise<JobImageBatchResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const { jobs, options } = request;

  if (options.delivery === 'cloudinary' && !isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary delivery was requested but the Cloudinary environment variables are missing.'
    );
  }

  const taskList = jobs.flatMap((job, jobIndex) =>
    buildJobImageVariations(job, options.variationCount).map((variation, variationIndex) => ({
      resultIndex: jobIndex * options.variationCount + variationIndex,
      jobIndex,
      variationIndex,
      job,
      variation,
    }))
  );

  if (options.delivery === 'inline') {
    warnings.push(
      'Inline delivery returns base64 data URLs and is best kept for previews or local QA. Use Cloudinary for production posting.'
    );
  }

  if (taskList.length > 60) {
    warnings.push(
      'This request is still processed synchronously. For consistently large batches, promote the trigger into a queue-backed worker.'
    );
  }

  const queue = new PQueue({ concurrency: options.concurrency });
  const outcomes = await Promise.all(
    taskList.map((task) =>
      queue.add(async (): Promise<TaskOutcome> => {
        try {
          const inputHash = buildInputHash(task.job, task.variation);

          if (options.delivery === 'cloudinary') {
            const cached = await findCachedJobImage(inputHash);
            if (cached) {
              return {
                result: {
                  result_index: task.resultIndex,
                  job_index: task.jobIndex,
                  variation_index: task.variationIndex,
                  source_job_id: task.job.sourceJobId,
                  source_job_key: task.job.sourceJobKey,
                  job_title: task.job.title,
                  headline: task.variation.headline,
                  variation: task.variation.key,
                  image_url: cached.imageUrl,
                  public_id: cached.publicId,
                  cached: true,
                  delivery: options.delivery,
                  width: JOB_IMAGE_WIDTH,
                  height: JOB_IMAGE_HEIGHT,
                },
              };
            }
          }

          const html = await buildJobImageHtml(task.job, task.variation);
          const pngBuffer = await renderHtmlToPng(html, JOB_IMAGE_WIDTH, JOB_IMAGE_HEIGHT);

          if (options.delivery === 'cloudinary') {
            const upload = await uploadJobImageToCloudinary({
              buffer: pngBuffer,
              publicId: buildCloudinaryPublicId(task.job, task.variation, inputHash),
              folder: options.cloudinaryFolder,
              tags: ['joblinca', 'job-marketing', task.variation.key],
            });

            await storeCachedJobImage({
              inputHash,
              variationKey: task.variation.key,
              templateVersion: DEFAULT_JOB_IMAGE_TEMPLATE_VERSION,
              job: task.job,
              imageUrl: upload.imageUrl,
              publicId: upload.publicId,
              width: JOB_IMAGE_WIDTH,
              height: JOB_IMAGE_HEIGHT,
            });

            return {
              result: {
                result_index: task.resultIndex,
                job_index: task.jobIndex,
                variation_index: task.variationIndex,
                source_job_id: task.job.sourceJobId,
                source_job_key: task.job.sourceJobKey,
                job_title: task.job.title,
                headline: task.variation.headline,
                variation: task.variation.key,
                image_url: upload.imageUrl,
                public_id: upload.publicId,
                cached: false,
                delivery: options.delivery,
                width: JOB_IMAGE_WIDTH,
                height: JOB_IMAGE_HEIGHT,
                html: options.includeHtml ? html : undefined,
              },
            };
          }

          return {
            result: {
              result_index: task.resultIndex,
              job_index: task.jobIndex,
              variation_index: task.variationIndex,
              source_job_id: task.job.sourceJobId,
              source_job_key: task.job.sourceJobKey,
              job_title: task.job.title,
              headline: task.variation.headline,
              variation: task.variation.key,
              image_url: toDataUrl(pngBuffer),
              cached: false,
              delivery: options.delivery,
              width: JOB_IMAGE_WIDTH,
              height: JOB_IMAGE_HEIGHT,
              html: options.includeHtml ? html : undefined,
            },
          };
        } catch (error) {
          console.error('[job-image-generator] task failed', {
            sourceJobKey: task.job.sourceJobKey,
            variation: task.variation.key,
            error,
          });

          return {
            error: {
              job_index: task.jobIndex,
              variation_index: task.variationIndex,
              source_job_key: task.job.sourceJobKey,
              job_title: task.job.title,
              variation: task.variation.key,
              error: getErrorMessage(error),
            },
          };
        }
      })
    )
  );

  const results = outcomes
    .flatMap((outcome) => ('result' in outcome ? [outcome.result] : []))
    .sort((left, right) => left.result_index - right.result_index);
  const errors = outcomes.flatMap((outcome) => ('error' in outcome ? [outcome.error] : []));

  return {
    ok: errors.length === 0,
    template_version: DEFAULT_JOB_IMAGE_TEMPLATE_VERSION,
    requested_jobs: jobs.length,
    requested_images: taskList.length,
    generated_images: results.length,
    cached_images: results.filter((result) => result.cached).length,
    failed_images: errors.length,
    duration_ms: Date.now() - startedAt,
    results,
    errors,
    warnings,
  };
}

export async function generateSingleJobMarketingImage(
  job: JobImageInput,
  overrides: Partial<JobImageGenerationOptions> = {}
): Promise<JobImageResult | null> {
  const delivery = overrides.delivery ?? resolvePreferredJobImageDelivery();
  const batch = await generateJobMarketingImageBatch({
    jobs: [normalizeJobImageInput(job)],
    options: {
      variationCount: overrides.variationCount ?? 1,
      concurrency: overrides.concurrency ?? 1,
      delivery,
      cloudinaryFolder: overrides.cloudinaryFolder,
      includeHtml: overrides.includeHtml ?? false,
    },
  });

  return batch.results[0] ?? null;
}

export interface ApprovedJobImageGenerationResult {
  primaryImageUrl: string;
  variants: Array<{
    variation: string;
    headline: string;
    imageUrl: string;
    publicId?: string;
    cached: boolean;
  }>;
}

export interface StoredJobMarketingImage {
  variation: string;
  headline: string;
  imageUrl: string;
  publicId: string;
  templateVersion: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

const variationOrder = new Map<string, number>([
  ['urgent-location', 0],
  ['needed-now', 1],
  ['apply-today', 2],
]);

function coerceStoredJobPayload(payload: unknown, jobId: string): NormalizedJobImageInput | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const location = typeof value.location === 'string' ? value.location.trim() : '';
  const salary = typeof value.salary === 'string' ? value.salary.trim() : '';
  const company = typeof value.company === 'string' ? value.company.trim() : '';
  const type = typeof value.type === 'string' ? value.type.trim() : '';

  if (!title || !location || !salary || !company || !type) {
    return null;
  }

  return {
    sourceJobId:
      typeof value.sourceJobId === 'string' && value.sourceJobId.trim()
        ? value.sourceJobId.trim()
        : jobId,
    sourceJobKey:
      typeof value.sourceJobKey === 'string' && value.sourceJobKey.trim()
        ? value.sourceJobKey.trim()
        : jobId,
    title,
    location,
    salary,
    company,
    type,
    applyUrl: typeof value.applyUrl === 'string' ? value.applyUrl.trim() || null : null,
    jobUrl: typeof value.jobUrl === 'string' ? value.jobUrl.trim() || null : null,
  };
}

export async function generateAndPersistApprovedJobImage(params: {
  jobId: string;
  title: string;
  company?: string | null;
  salary?: string | null;
  location?: string | null;
  type?: string | null;
  jobUrl?: string | null;
}): Promise<ApprovedJobImageGenerationResult | null> {
  try {
    const batch = await generateJobMarketingImageBatch({
      jobs: [
        normalizeJobImageInput({
          id: params.jobId,
          title: params.title,
          company: params.company,
          salary: params.salary,
          location: params.location,
          type: params.type,
          jobUrl: params.jobUrl,
        }),
      ],
      options: {
        variationCount: 3,
        concurrency: 3,
        delivery: resolvePreferredJobImageDelivery(),
      },
    });

    const primaryImage = batch.results[0];
    if (!primaryImage?.image_url) {
      return null;
    }

    const serviceClient = createServiceSupabaseClient();
    const { error } = await serviceClient
      .from('jobs')
      .update({ image_url: primaryImage.image_url })
      .eq('id', params.jobId);

    if (error) {
      throw new Error(error.message || 'Failed to persist generated job image');
    }

    return {
      primaryImageUrl: primaryImage.image_url,
      variants: batch.results.map((result) => ({
        variation: result.variation,
        headline: result.headline,
        imageUrl: result.image_url,
        publicId: result.public_id,
        cached: result.cached,
      })),
    };
  } catch (error) {
    console.error('[job-image-generator] approved-job persistence failed', {
      jobId: params.jobId,
      error,
    });
    return null;
  }
}

export async function listLatestJobMarketingImages(jobId: string): Promise<StoredJobMarketingImage[]> {
  const serviceClient = createServiceSupabaseClient();
  const { data, error } = await serviceClient
    .from('job_marketing_assets')
    .select(
      'source_job_id, variation_key, image_url, cloudinary_public_id, template_version, width, height, created_at, updated_at, job_payload'
    )
    .eq('source_job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load job marketing images');
  }

  const latestByVariation = new Map<string, StoredJobMarketingImage>();

  for (const row of data || []) {
    const variationKey =
      typeof row.variation_key === 'string' ? row.variation_key : 'urgent-location';
    if (latestByVariation.has(variationKey)) {
      continue;
    }

    const normalizedJob = coerceStoredJobPayload(row.job_payload, jobId);
    const headline =
      normalizedJob
        ? buildJobImageVariations(normalizedJob, 3).find(
            (variation) => variation.key === variationKey
          )?.headline || normalizedJob.title
        : variationKey;

    latestByVariation.set(variationKey, {
      variation: variationKey,
      headline,
      imageUrl: String(row.image_url),
      publicId: String(row.cloudinary_public_id),
      templateVersion: String(row.template_version),
      width: Number(row.width || JOB_IMAGE_WIDTH),
      height: Number(row.height || JOB_IMAGE_HEIGHT),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at || row.created_at),
    });
  }

  return [...latestByVariation.values()].sort((left, right) => {
    return (variationOrder.get(left.variation) ?? 99) - (variationOrder.get(right.variation) ?? 99);
  });
}
