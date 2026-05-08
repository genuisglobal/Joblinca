import type {
  ClassifiedVideoJob,
  NormalizedVideoLocation,
  VideoBatchDraft,
  VideoBatchType,
  VideoJobCategory,
  VideoLanguage,
} from './types';
import { VIDEO_ASPECT_RATIO, VIDEO_RESOLUTION } from './types';

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'batch'
  );
}

function uniqueJobs(jobs: ClassifiedVideoJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) {
      return false;
    }

    seen.add(job.id);
    return true;
  });
}

function sortByPriority(jobs: ClassifiedVideoJob[]) {
  return [...jobs].sort((left, right) => {
    if (right.videoPriority !== left.videoPriority) {
      return right.videoPriority - left.videoPriority;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function durationTargetFor(count: number) {
  if (count <= 1) {
    return 35;
  }

  if (count <= 3) {
    return 40;
  }

  if (count <= 5) {
    return 45;
  }

  return 55;
}

function resolveCta(jobs: ClassifiedVideoJob[]) {
  return jobs.every((job) => job.directPlatformJob || job.trustedByJoblinca)
    ? 'Apply directly on Joblinca.com'
    : 'View details and apply through Joblinca.com';
}

function createBatch(params: {
  date: string;
  batchType: VideoBatchType;
  language: VideoLanguage;
  title: string;
  jobs: ClassifiedVideoJob[];
  city?: NormalizedVideoLocation | null;
  category?: VideoJobCategory | null;
  slugHint?: string;
  notes?: string[];
}): VideoBatchDraft {
  const jobs = uniqueJobs(params.jobs);
  const slugSeed = [params.batchType, params.language, params.slugHint || params.title].filter(Boolean).join('-');

  return {
    id: `${params.date}-${params.batchType}-${params.language}-${slugify(slugSeed)}`,
    slug: slugify(slugSeed),
    date: params.date,
    batchType: params.batchType,
    language: params.language,
    title: params.title,
    durationTarget: durationTargetFor(jobs.length),
    aspectRatio: VIDEO_ASPECT_RATIO,
    resolution: VIDEO_RESOLUTION,
    cta: resolveCta(jobs),
    jobs,
    city: params.city || null,
    category: params.category || null,
    notes: params.notes || [],
  };
}

function buildSingleJobTitle(job: ClassifiedVideoJob) {
  if (job.language === 'fr') {
    return `${job.company} recrute ${job.title} a ${job.city}`;
  }

  return `${job.company} is hiring ${job.title} in ${job.city}`;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }
  return groups;
}

function dominantLanguage(jobs: ClassifiedVideoJob[]): VideoLanguage {
  const frCount = jobs.filter((job) => job.language === 'fr').length;
  return frCount > jobs.length / 2 ? 'fr' : 'en';
}

export function createSingleJobBatches(
  jobs: ClassifiedVideoJob[],
  date: string,
  maxBatches = 3
) {
  const candidates = sortByPriority(jobs).filter(
    (job) => job.trustedByJoblinca || job.directPlatformJob || job.featuredCompany || job.videoPriority >= 750
  );

  return candidates.slice(0, maxBatches).map((job) =>
    createBatch({
      date,
      batchType: 'single_job_alert',
      language: job.language,
      title: buildSingleJobTitle(job),
      jobs: [job],
      city: job.city,
      category: job.category,
      slugHint: `${job.company}-${job.title}`,
      notes: job.trustedByJoblinca
        ? ['Direct trusted platform job prioritized for its own alert.']
        : ['High-priority single job alert.'],
    })
  );
}

export function createTrustedJoblincaBatches(
  jobs: ClassifiedVideoJob[],
  date: string
) {
  const trustedJobs = sortByPriority(jobs).filter((job) => job.directPlatformJob || job.trustedByJoblinca);
  const batches: VideoBatchDraft[] = [];

  for (const language of ['en', 'fr'] as const) {
    const languageJobs = trustedJobs.filter((job) => job.language === language).slice(0, 5);
    if (languageJobs.length === 0) {
      continue;
    }

    batches.push(
      createBatch({
        date,
        batchType: 'trusted_joblinca_jobs',
        language,
        title:
          language === 'fr'
            ? "Offres verifiees publiees directement sur Joblinca aujourd'hui"
            : 'Verified Jobs Posted Directly on Joblinca Today',
        jobs: languageJobs,
        slugHint: `trusted-joblinca-${language}`,
        notes: ['Trusted direct-platform jobs are intentionally separated from external scraped jobs.'],
      })
    );
  }

  return batches;
}

export function createUrgentBatch(
  jobs: ClassifiedVideoJob[],
  date: string
) {
  const urgentJobs = sortByPriority(jobs).filter((job) => job.urgent || job.category === 'Mass Recruitment');
  const batches: VideoBatchDraft[] = [];

  for (const language of ['en', 'fr'] as const) {
    const languageJobs = urgentJobs.filter((job) => job.language === language).slice(0, 6);
    if (languageJobs.length < 2) {
      continue;
    }

    batches.push(
      createBatch({
        date,
        batchType: 'urgent_jobs',
        language,
        title:
          language === 'fr'
            ? "Recrutement urgent au Cameroun aujourd'hui"
            : 'Urgent Recruitment Alert in Cameroon Today',
        jobs: languageJobs,
        slugHint: `urgent-${language}`,
      })
    );
  }

  return batches;
}

export function createCityBatches(
  jobs: ClassifiedVideoJob[],
  date: string,
  maxBatches = 2
) {
  const eligible = jobs.filter((job) => job.city !== 'Cameroon' && job.city !== 'Multiple Locations');
  const grouped = [...groupBy(eligible, (job) => `${job.language}:${job.city}`).entries()]
    .map(([key, group]) => ({ key, jobs: sortByPriority(group) }))
    .filter((entry) => entry.jobs.length >= 3)
    .sort((left, right) => {
      if (right.jobs.length !== left.jobs.length) {
        return right.jobs.length - left.jobs.length;
      }

      return right.jobs[0].videoPriority - left.jobs[0].videoPriority;
    });

  return grouped.slice(0, maxBatches).map((entry) => {
    const sample = entry.jobs[0];
    const city = sample.city;
    const language = sample.language;

    return createBatch({
      date,
      batchType: 'city_jobs',
      language,
      title:
        language === 'fr'
          ? `Nouveaux emplois a ${city} aujourd'hui`
          : `New Jobs in ${city} Today`,
      jobs: entry.jobs.slice(0, 6),
      city,
      slugHint: `${city}-${language}`,
    });
  });
}

export function createCategoryBatches(
  jobs: ClassifiedVideoJob[],
  date: string,
  maxBatches = 2
) {
  const eligible = jobs.filter((job) => job.category !== 'Other');
  const grouped = [...groupBy(eligible, (job) => `${job.language}:${job.category}`).entries()]
    .map(([key, group]) => ({ key, jobs: sortByPriority(group) }))
    .filter((entry) => entry.jobs.length >= 3)
    .sort((left, right) => {
      if (right.jobs.length !== left.jobs.length) {
        return right.jobs.length - left.jobs.length;
      }

      return right.jobs[0].videoPriority - left.jobs[0].videoPriority;
    });

  return grouped.slice(0, maxBatches).map((entry) => {
    const sample = entry.jobs[0];
    const language = sample.language;
    const category = sample.category;

    return createBatch({
      date,
      batchType: 'category_jobs',
      language,
      title:
        language === 'fr'
          ? `Emplois ${category} au Cameroun aujourd'hui`
          : `${category} Jobs Hiring in Cameroon Today`,
      jobs: entry.jobs.slice(0, 6),
      category,
      slugHint: `${category}-${language}`,
    });
  });
}

export function createLanguageBatches(
  jobs: ClassifiedVideoJob[],
  date: string
) {
  const batches: VideoBatchDraft[] = [];

  for (const language of ['en', 'fr'] as const) {
    const languageJobs = sortByPriority(jobs.filter((job) => job.language === language)).slice(0, 7);
    if (languageJobs.length < 3) {
      continue;
    }

    batches.push(
      createBatch({
        date,
        batchType: language === 'fr' ? 'french_daily_jobs' : 'english_daily_jobs',
        language,
        title:
          language === 'fr'
            ? "Voici les nouvelles offres d'emploi au Cameroun aujourd'hui"
            : 'Here Are New Job Opportunities in Cameroon Today',
        jobs: languageJobs,
        slugHint: `${language}-daily`,
      })
    );
  }

  return batches;
}

export function createTopJobsBatch(
  jobs: ClassifiedVideoJob[],
  date: string
) {
  const sorted = sortByPriority(jobs);
  if (sorted.length === 0) {
    return [];
  }

  const language = dominantLanguage(sorted);
  const languageJobs = sorted.filter((job) => job.language === language).slice(0, 7);
  if (languageJobs.length < 3) {
    return [];
  }

  return [
    createBatch({
      date,
      batchType: 'top_jobs_today',
      language,
      title:
        language === 'fr'
          ? "Top offres d'emploi au Cameroun aujourd'hui"
          : 'Top Jobs Hiring in Cameroon Today',
      jobs: languageJobs,
      slugHint: `top-jobs-${language}`,
    }),
  ];
}

export function createDailyVideoBatches(
  jobs: ClassifiedVideoJob[],
  options: {
    date: string;
    maxSingleBatches?: number;
    maxCityBatches?: number;
    maxCategoryBatches?: number;
  }
) {
  const date = options.date;
  const sorted = sortByPriority(uniqueJobs(jobs));
  const result: VideoBatchDraft[] = [];
  const groupUsedIds = new Set<string>();

  const markUsed = (batchJobs: ClassifiedVideoJob[]) => {
    for (const job of batchJobs) {
      groupUsedIds.add(job.id);
    }
  };

  const remainingGroupJobs = () => sorted.filter((job) => !groupUsedIds.has(job.id));

  result.push(...createSingleJobBatches(sorted, date, options.maxSingleBatches || 3));

  const trustedBatches = createTrustedJoblincaBatches(remainingGroupJobs(), date);
  for (const batch of trustedBatches) {
    result.push(batch);
  }

  const urgentBatches = createUrgentBatch(remainingGroupJobs(), date);
  for (const batch of urgentBatches) {
    result.push(batch);
  }

  const cityBatches = createCityBatches(remainingGroupJobs(), date, options.maxCityBatches || 2);
  for (const batch of cityBatches) {
    markUsed(batch.jobs);
    result.push(batch);
  }

  const categoryBatches = createCategoryBatches(
    remainingGroupJobs(),
    date,
    options.maxCategoryBatches || 2
  );
  for (const batch of categoryBatches) {
    markUsed(batch.jobs);
    result.push(batch);
  }

  const topJobsBatch = createTopJobsBatch(remainingGroupJobs(), date);
  for (const batch of topJobsBatch) {
    markUsed(batch.jobs);
    result.push(batch);
  }

  const languageBatches = createLanguageBatches(remainingGroupJobs(), date);
  for (const batch of languageBatches) {
    markUsed(batch.jobs);
    result.push(batch);
  }

  return result;
}
