import { z } from 'zod';

import type {
  JobImageGenerationOptions,
  JobImageInput,
  NormalizedJobImageInput,
  ParsedJobImageRequest,
} from './types';
import { MAX_JOBS_PER_REQUEST, MAX_VARIATIONS_PER_JOB } from './types';

export class JobImageRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobImageRequestValidationError';
  }
}

const jobInputSchema = z.object({
  id: z.union([z.string(), z.number()]).optional().nullable(),
  title: z.string().trim().min(1, 'title is required'),
  location: z.string().optional().nullable(),
  salary: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  jobUrl: z.string().optional().nullable(),
});

const optionsSchema = z.object({
  variations: z.union([z.boolean(), z.number().int().min(1).max(MAX_VARIATIONS_PER_JOB)]).optional(),
  concurrency: z.number().int().min(1).max(6).optional(),
  delivery: z.enum(['cloudinary', 'inline']).optional(),
  cloudinaryFolder: z.string().optional(),
  includeHtml: z.boolean().optional(),
});

const requestSchema = z.union([
  z.array(jobInputSchema).min(1).max(MAX_JOBS_PER_REQUEST),
  z.object({
    jobs: z.array(jobInputSchema).min(1).max(MAX_JOBS_PER_REQUEST),
    options: optionsSchema.optional(),
  }),
]);

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDisplayLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) {
    return fallback;
  }

  return trimmed
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

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

function normalizeSourceJobId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function buildSourceJobKey(sourceJobId: string | null, title: string, company: string, location: string): string {
  if (sourceJobId) {
    return sourceJobId;
  }

  return [slugifySegment(title), slugifySegment(company), slugifySegment(location)]
    .filter(Boolean)
    .join('-')
    .slice(0, 120);
}

export function resolveVariationCount(input: number | boolean | undefined): number {
  if (input === true) {
    return MAX_VARIATIONS_PER_JOB;
  }

  if (input === false || input === undefined) {
    return 1;
  }

  return Math.min(MAX_VARIATIONS_PER_JOB, Math.max(1, Math.floor(input)));
}

export function resolveConcurrency(input?: number): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return Math.min(6, Math.max(1, Math.floor(input)));
  }

  const envValue = Number.parseInt(process.env.JOB_IMAGE_GENERATOR_CONCURRENCY || '', 10);
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.min(6, Math.max(1, envValue));
  }

  return 4;
}

export function normalizeJobImageInput(input: JobImageInput): NormalizedJobImageInput {
  const title = input.title.trim();
  if (!title) {
    throw new JobImageRequestValidationError('title is required');
  }

  const sourceJobId = normalizeSourceJobId(input.id);
  const company = normalizeOptionalText(input.company) ?? 'Confidential';
  const location = normalizeOptionalText(input.location) ?? 'Cameroon';
  const salary = normalizeOptionalText(input.salary) ?? 'Salary not disclosed';
  const type = toDisplayLabel(input.type, 'Full Time');

  return {
    sourceJobId,
    sourceJobKey: buildSourceJobKey(sourceJobId, title, company, location),
    title,
    location,
    salary,
    company,
    type,
    applyUrl: normalizeOptionalText(input.applyUrl),
    jobUrl: normalizeOptionalText(input.jobUrl),
  };
}

function buildOptions(input?: z.infer<typeof optionsSchema>): JobImageGenerationOptions {
  return {
    variationCount: resolveVariationCount(input?.variations),
    concurrency: resolveConcurrency(input?.concurrency),
    delivery: input?.delivery ?? 'cloudinary',
    cloudinaryFolder: normalizeOptionalText(input?.cloudinaryFolder) ?? undefined,
    includeHtml: Boolean(input?.includeHtml),
  };
}

export function parseJobImageRequest(input: unknown): ParsedJobImageRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
      .join('; ');
    throw new JobImageRequestValidationError(message);
  }

  const jobs = Array.isArray(parsed.data) ? parsed.data : parsed.data.jobs;
  const options = Array.isArray(parsed.data) ? undefined : parsed.data.options;

  return {
    jobs: jobs.map((job) => normalizeJobImageInput(job as JobImageInput)),
    options: buildOptions(options),
  };
}
