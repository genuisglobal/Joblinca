import { promises as fs } from 'node:fs';
import path from 'node:path';

import { loadEnvConfig } from '@next/env';

import { normalizeCompanyName, normalizeUrlForDedup } from '@/lib/jobs/dedupe-model';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createDailyVideoBatches } from '@/lib/videos/job-video-batcher';
import { classifyVideoJob } from '@/lib/videos/job-video-classifier';
import {
  generateCaption,
  generateEnglishScript,
  generateFrenchScript,
  generateHashtags,
  generateScenePlan,
} from '@/lib/videos/job-video-script-generator';
import { createHeyGenProvider } from '@/lib/videos/providers/heygen-provider';
import type { ClassifiedVideoJob, ExistingBatchUsage, RawVideoJob, VideoBatchOutput, VideoLanguage } from '@/lib/videos/types';

type CliOptions = {
  date: string;
  language: VideoLanguage | null;
  dryRun: boolean;
  limit: number | null;
};

type JobRow = {
  id: string;
  public_id: string | null;
  title: string | null;
  description: string | null;
  language: string | null;
  location: string | null;
  salary: number | null;
  work_type: string | null;
  job_type: string | null;
  internship_track: string | null;
  created_at: string;
  closes_at: string | null;
  published: boolean;
  approval_status: string | null;
  lifecycle_status: string | null;
  visibility: string | null;
  recruiter_id: string | null;
  scam_score: number | null;
  external_apply_url: string | null;
  apply_method: string | null;
  apply_email: string | null;
  apply_phone: string | null;
  apply_whatsapp: string | null;
  company_name: string | null;
  origin_type: string | null;
  origin_discovered_job_id: string | null;
  source_attribution_json: Record<string, unknown> | null;
  approved_by: string | null;
  posted_by_role: string | null;
};

type DiscoveredJobRow = {
  id: string;
  source_name: string | null;
  source_url: string | null;
  original_job_url: string | null;
  title: string | null;
  company_name: string | null;
  recruiter_email: string | null;
  recruiter_phone: string | null;
  location: string | null;
  city: string | null;
  description_clean: string | null;
  description_raw: string | null;
  apply_url: string | null;
  trust_score: number | null;
  scam_score: number | null;
  verification_status: string | null;
  claim_status: string | null;
  ingestion_status: string | null;
  language: string | null;
};

type RecruiterRow = {
  id: string;
  verified: boolean | null;
  company_name: string | null;
};

type RecruiterProfileRow = {
  user_id: string;
  verification_status: string | null;
  company_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

const ROOT = process.cwd();
loadEnvConfig(ROOT);
const DEFAULT_TIMEZONE = process.env.JOBLINCA_VIDEO_TIMEZONE || 'Africa/Douala';
const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
const MIN_ACCEPTABLE_TRUST_SCORE = 40;
const MAX_ALLOWED_SCAM_SCORE = 10;

function formatCurrentDate(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    date: formatCurrentDate(DEFAULT_TIMEZONE),
    language: null,
    dryRun: false,
    limit: null,
  };

  for (const argument of argv) {
    if (argument.startsWith('--date=')) {
      options.date = argument.slice('--date='.length);
      continue;
    }

    if (argument.startsWith('--language=')) {
      const language = argument.slice('--language='.length);
      if (language === 'en' || language === 'fr') {
        options.language = language;
      }
      continue;
    }

    if (argument.startsWith('--limit=')) {
      const parsed = Number.parseInt(argument.slice('--limit='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
      continue;
    }

    if (argument === '--dry-run') {
      options.dryRun = true;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    throw new Error(`Invalid --date value: ${options.date}. Expected YYYY-MM-DD.`);
  }

  return options;
}

function dateRangeFor(day: string) {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function countReason(counts: Map<string, number>, reason: string) {
  counts.set(reason, (counts.get(reason) || 0) + 1);
}

function formatSalary(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  return `${Math.round(value).toLocaleString('en-US')} XAF`;
}

function buildApplicationUrl(job: JobRow, discoveredJob: DiscoveredJobRow | null) {
  return (
    job.external_apply_url ||
    discoveredJob?.apply_url ||
    `${DEFAULT_APP_URL}/jobs/${job.id}`
  );
}

async function readExistingBatchUsage(outputDir: string): Promise<ExistingBatchUsage> {
  const usage: ExistingBatchUsage = {
    jobIds: new Set<string>(),
    batchIds: new Set<string>(),
  };

  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const batchFile = path.join(outputDir, entry.name, 'batch.json');
      try {
        const content = await fs.readFile(batchFile, 'utf8');
        const parsed = JSON.parse(content) as { id?: string; jobs?: Array<{ id?: string }> };
        if (parsed.id) {
          usage.batchIds.add(parsed.id);
        }
        for (const job of parsed.jobs || []) {
          if (job.id) {
            usage.jobIds.add(job.id);
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return usage;
  }

  return usage;
}

async function fetchJobs(options: CliOptions) {
  const supabase = createServiceSupabaseClient();
  const { startIso, endIso } = dateRangeFor(options.date);
  const rawQueryLimit = Math.max(25, Math.min(options.limit || 120, 200));

  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, public_id, title, description, language, location, salary, work_type, job_type, internship_track, created_at, closes_at, published, approval_status, lifecycle_status, visibility, recruiter_id, scam_score, external_apply_url, apply_method, apply_email, apply_phone, apply_whatsapp, company_name, origin_type, origin_discovered_job_id, source_attribution_json, approved_by, posted_by_role'
    )
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('visibility', 'public')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(rawQueryLimit);

  if (error) {
    throw new Error(`Failed to load jobs: ${error.message}`);
  }

  const jobs = (data || []) as JobRow[];
  const discoveredIds = [...new Set(jobs.map((job) => job.origin_discovered_job_id).filter(Boolean))] as string[];
  const recruiterIds = [...new Set(jobs.map((job) => job.recruiter_id).filter(Boolean))] as string[];

  const [discoveredResult, recruitersResult, recruiterProfilesResult] = await Promise.all([
    discoveredIds.length > 0
      ? supabase
          .from('discovered_jobs')
          .select(
            'id, source_name, source_url, original_job_url, title, company_name, recruiter_email, recruiter_phone, location, city, description_clean, description_raw, apply_url, trust_score, scam_score, verification_status, claim_status, ingestion_status, language'
          )
          .in('id', discoveredIds)
      : Promise.resolve({ data: [] as DiscoveredJobRow[], error: null }),
    recruiterIds.length > 0
      ? supabase.from('recruiters').select('id, verified, company_name').in('id', recruiterIds)
      : Promise.resolve({ data: [] as RecruiterRow[], error: null }),
    recruiterIds.length > 0
      ? supabase
          .from('recruiter_profiles')
          .select('user_id, verification_status, company_name, contact_email, contact_phone')
          .in('user_id', recruiterIds)
      : Promise.resolve({ data: [] as RecruiterProfileRow[], error: null }),
  ]);

  if (discoveredResult.error) {
    throw new Error(`Failed to load discovered jobs: ${discoveredResult.error.message}`);
  }

  if (recruitersResult.error) {
    throw new Error(`Failed to load recruiters: ${recruitersResult.error.message}`);
  }

  if (recruiterProfilesResult.error) {
    throw new Error(`Failed to load recruiter profiles: ${recruiterProfilesResult.error.message}`);
  }

  const discoveredById = new Map((discoveredResult.data || []).map((row) => [row.id, row as DiscoveredJobRow]));
  const recruitersById = new Map((recruitersResult.data || []).map((row) => [row.id, row as RecruiterRow]));
  const recruiterProfilesById = new Map(
    (recruiterProfilesResult.data || []).map((row) => [row.user_id, row as RecruiterProfileRow])
  );

  return jobs.map((job) => {
    const discovered = job.origin_discovered_job_id
      ? discoveredById.get(job.origin_discovered_job_id) || null
      : null;
    const recruiter = job.recruiter_id ? recruitersById.get(job.recruiter_id) || null : null;
    const recruiterProfile = job.recruiter_id
      ? recruiterProfilesById.get(job.recruiter_id) || null
      : null;

    const rawVideoJob: RawVideoJob = {
      id: job.id,
      publicId: job.public_id,
      title: (job.title || discovered?.title || '').trim(),
      description: (job.description || discovered?.description_clean || discovered?.description_raw || '').trim(),
      company: (job.company_name || discovered?.company_name || recruiterProfile?.company_name || recruiter?.company_name || '').trim(),
      languageHint: job.language === 'en' || job.language === 'fr' ? job.language : null,
      sourceLanguage: discovered?.language || null,
      rawLocation: job.location || discovered?.location || null,
      cityHint: discovered?.city || null,
      salary: job.salary,
      salaryText: formatSalary(job.salary),
      workType: job.work_type,
      jobType: job.job_type,
      internshipTrack: job.internship_track,
      createdAt: job.created_at,
      closesAt: job.closes_at,
      published: job.published,
      approvalStatus: job.approval_status,
      lifecycleStatus: job.lifecycle_status,
      visibility: job.visibility,
      recruiterId: job.recruiter_id,
      recruiterVerified: Boolean(recruiter?.verified),
      recruiterVerificationStatus: recruiterProfile?.verification_status || null,
      approvedBy: job.approved_by,
      postedByRole: job.posted_by_role,
      applyMethod: job.apply_method,
      applicationUrl: buildApplicationUrl(job, discovered),
      jobUrl: `${DEFAULT_APP_URL}/jobs/${job.id}`,
      applyEmail: job.apply_email || discovered?.recruiter_email || recruiterProfile?.contact_email || null,
      applyPhone: job.apply_phone || discovered?.recruiter_phone || recruiterProfile?.contact_phone || null,
      applyWhatsapp: job.apply_whatsapp,
      sourceName:
        discovered?.source_name ||
        (typeof job.source_attribution_json?.source_name === 'string'
          ? String(job.source_attribution_json.source_name)
          : null) ||
        (job.origin_type === 'native' ? 'joblinca' : null),
      sourceUrl:
        discovered?.source_url ||
        (typeof job.source_attribution_json?.source_url === 'string'
          ? String(job.source_attribution_json.source_url)
          : null),
      originalJobUrl:
        discovered?.original_job_url ||
        (typeof job.source_attribution_json?.original_job_url === 'string'
          ? String(job.source_attribution_json.original_job_url)
          : null) ||
        job.external_apply_url,
      originType: job.origin_type,
      originDiscoveredJobId: job.origin_discovered_job_id,
      sourceAttribution: job.source_attribution_json,
      trustScore:
        discovered?.trust_score ??
        (typeof job.source_attribution_json?.trust_score === 'number'
          ? Number(job.source_attribution_json.trust_score)
          : null),
      scamScore: Math.max(job.scam_score || 0, discovered?.scam_score || 0),
      discoveredVerificationStatus: discovered?.verification_status || null,
      claimStatus: discovered?.claim_status || null,
      ingestionStatus: discovered?.ingestion_status || null,
      platformVerificationStatus: recruiterProfile?.verification_status || null,
    };

    return rawVideoJob;
  });
}

function dedupeJobs(jobs: ClassifiedVideoJob[], exclusionCounts: Map<string, number>) {
  const seen = new Map<string, string>();
  const deduped: ClassifiedVideoJob[] = [];

  for (const job of jobs) {
    const normalizedTitle = job.title.toLowerCase().trim();
    const normalizedCompany = normalizeCompanyName(job.company);
    const normalizedUrl =
      normalizeUrlForDedup(job.originalJobUrl) ||
      normalizeUrlForDedup(job.applicationUrl) ||
      job.applyEmail?.toLowerCase() ||
      job.jobUrl.toLowerCase();
    const key = [normalizedTitle, normalizedCompany, job.sourceName?.toLowerCase() || 'unknown', normalizedUrl].join('|');

    if (seen.has(key)) {
      countReason(exclusionCounts, 'duplicate_job');
      continue;
    }

    seen.set(key, job.id);
    deduped.push(job);
  }

  return deduped;
}

function filterPublishableJobs(
  jobs: ClassifiedVideoJob[],
  existingUsage: ExistingBatchUsage,
  exclusionCounts: Map<string, number>
) {
  const filtered: ClassifiedVideoJob[] = [];

  for (const job of jobs) {
    if (!job.title) {
      countReason(exclusionCounts, 'missing_title');
      continue;
    }

    if (!job.company) {
      countReason(exclusionCounts, 'missing_company');
      continue;
    }

    if (!isJobPubliclyListable(job)) {
      countReason(exclusionCounts, 'not_publicly_listable');
      continue;
    }

    if ((job.scamScore || 0) > MAX_ALLOWED_SCAM_SCORE) {
      countReason(exclusionCounts, 'high_scam_score');
      continue;
    }

    if (!job.directPlatformJob && (job.trustScore || 0) < MIN_ACCEPTABLE_TRUST_SCORE) {
      countReason(exclusionCounts, 'low_trust_score');
      continue;
    }

    if (!job.applicationUrl && !job.jobUrl) {
      countReason(exclusionCounts, 'missing_application_route');
      continue;
    }

    const suspiciousSource =
      job.sourceType === 'scraped_external' &&
      (!job.sourceName || (!job.originalJobUrl && !job.sourceUrl && !job.applyEmail));

    if (suspiciousSource) {
      countReason(exclusionCounts, 'suspicious_source');
      continue;
    }

    if (existingUsage.jobIds.has(job.id) && !job.trustedByJoblinca && !job.featuredCompany) {
      countReason(exclusionCounts, 'already_used_today');
      continue;
    }

    filtered.push(job);
  }

  return filtered;
}

function serializeCaptions(captions: ReturnType<typeof generateCaption>) {
  return [
    `Default: ${captions.default}`,
    '',
    `TikTok: ${captions.tiktok}`,
    '',
    `Facebook: ${captions.facebook}`,
    '',
    `Instagram: ${captions.instagram}`,
    '',
    `LinkedIn: ${captions.linkedin}`,
    '',
    `WhatsApp: ${captions.whatsapp}`,
  ].join('\n');
}

async function writeBatchOutput(outputRoot: string, index: number, batch: VideoBatchOutput, providerPayload: unknown) {
  const folderName = `${String(index + 1).padStart(2, '0')}-${batch.slug}`;
  const batchDir = path.join(outputRoot, folderName);
  await fs.mkdir(batchDir, { recursive: true });

  const files = {
    batchJson: path.join(batchDir, 'batch.json'),
    script: path.join(batchDir, 'script.txt'),
    caption: path.join(batchDir, 'caption.txt'),
    hashtags: path.join(batchDir, 'hashtags.txt'),
    heygenPayload: path.join(batchDir, 'heygen-payload.json'),
  };

  await Promise.all([
    fs.writeFile(files.batchJson, `${JSON.stringify(batch, null, 2)}\n`, 'utf8'),
    fs.writeFile(files.script, `${batch.script}\n`, 'utf8'),
    fs.writeFile(files.caption, `${serializeCaptions(batch.captionsByPlatform)}\n`, 'utf8'),
    fs.writeFile(files.hashtags, `${batch.hashtags.join(' ')}\n`, 'utf8'),
    fs.writeFile(files.heygenPayload, `${JSON.stringify(providerPayload, null, 2)}\n`, 'utf8'),
  ]);

  return {
    batchDir,
    files,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputRoot = path.join(ROOT, 'ads', 'videos', 'daily', options.date);
  await fs.mkdir(outputRoot, { recursive: true });

  const exclusionCounts = new Map<string, number>();
  const existingUsage = await readExistingBatchUsage(outputRoot);
  const rawJobs = await fetchJobs(options);

  console.log(`[videos:daily] Loaded ${rawJobs.length} job row(s) for ${options.date}.`);

  const classifiedJobs = rawJobs.map(classifyVideoJob);
  const languageFiltered = options.language
    ? classifiedJobs.filter((job) => job.language === options.language)
    : classifiedJobs;
  const publishableJobs = filterPublishableJobs(languageFiltered, existingUsage, exclusionCounts);
  const dedupedJobs = dedupeJobs(publishableJobs, exclusionCounts);
  const limitedJobs = options.limit ? dedupedJobs.slice(0, options.limit) : dedupedJobs;

  const batches = createDailyVideoBatches(limitedJobs, {
    date: options.date,
  });

  const provider = createHeyGenProvider();
  const writtenBatches: Array<{
    id: string;
    type: string;
    language: string;
    folder: string;
    files: Record<string, string>;
  }> = [];

  for (const [index, batch] of batches.entries()) {
    const script = batch.language === 'fr' ? generateFrenchScript(batch) : generateEnglishScript(batch);
    const captionsByPlatform = generateCaption(batch);
    const hashtags = generateHashtags(batch);
    const scenePlan = generateScenePlan(batch);

    const batchOutput: VideoBatchOutput = {
      ...batch,
      script,
      caption: captionsByPlatform.default,
      captionsByPlatform,
      hashtags,
      scenePlan,
    };

    const providerPayload = provider.createVideoPayload(batchOutput);
    const { batchDir, files } = await writeBatchOutput(outputRoot, index, batchOutput, providerPayload);

    writtenBatches.push({
      id: batch.id,
      type: batch.batchType,
      language: batch.language,
      folder: batchDir,
      files,
    });
  }

  const summary = {
    date: options.date,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    jobsFound: rawJobs.length,
    jobsAfterLanguageFilter: languageFiltered.length,
    jobsProcessed: limitedJobs.length,
    excluded: Object.fromEntries(exclusionCounts.entries()),
    batchesCreated: batches.length,
    outputFolder: path.relative(ROOT, outputRoot).replace(/\\/g, '/'),
    batches: writtenBatches.map((batch) => ({
      id: batch.id,
      type: batch.type,
      language: batch.language,
      folder: path.relative(ROOT, batch.folder).replace(/\\/g, '/'),
      files: Object.fromEntries(
        Object.entries(batch.files).map(([key, value]) => [key, path.relative(ROOT, value).replace(/\\/g, '/')])
      ),
    })),
  };

  await fs.writeFile(
    path.join(outputRoot, 'manifest.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );

  console.log('Daily job video generation completed.');
  console.log(`Jobs processed: ${summary.jobsProcessed}`);
  console.log(`Batches created: ${summary.batchesCreated}`);
  console.log(`Output folder: ${summary.outputFolder}`);
}

main().catch((error) => {
  console.error('[videos:daily] Failed to generate daily job videos.');
  console.error(error);
  process.exit(1);
});
