import type {
  ClassifiedVideoJob,
  VideoBatchDraft,
  VideoCaptionSet,
  VideoScenePlan,
} from './types';

function formatJobHighlight(job: ClassifiedVideoJob, language: 'en' | 'fr') {
  if (language === 'fr') {
    return `${job.company} recrute ${job.title} a ${job.city}.`;
  }

  return `${job.company} is hiring ${job.title} in ${job.city}.`;
}

function buildHook(batch: VideoBatchDraft) {
  if (batch.batchType === 'trusted_joblinca_jobs') {
    return batch.language === 'fr'
      ? "Vous cherchez des opportunites fiables au Cameroun? Voici des offres publiees directement sur Joblinca aujourd'hui."
      : 'Looking for trusted job opportunities in Cameroon? Here are verified jobs posted directly on Joblinca today.';
  }

  if (batch.batchType === 'urgent_jobs') {
    return batch.language === 'fr'
      ? "Alerte recrutement urgent au Cameroun. Voici les offres a regarder aujourd'hui sur Joblinca."
      : 'Urgent recruitment alert in Cameroon. Here are the jobs to watch today on Joblinca.';
  }

  if (batch.batchType === 'city_jobs' && batch.city) {
    return batch.language === 'fr'
      ? `Vous cherchez du travail a ${batch.city}? Voici les nouvelles offres disponibles aujourd'hui sur Joblinca.`
      : `Looking for work in ${batch.city}? Here are the new jobs available today on Joblinca.`;
  }

  if (batch.batchType === 'category_jobs' && batch.category) {
    return batch.language === 'fr'
      ? `Les offres ${batch.category} recrutent au Cameroun aujourd'hui sur Joblinca.`
      : `${batch.category} jobs are hiring in Cameroon today on Joblinca.`;
  }

  if (batch.batchType === 'single_job_alert') {
    const job = batch.jobs[0];
    return batch.language === 'fr'
      ? `Alerte emploi: ${job.company} recrute ${job.title} a ${job.city} aujourd'hui.`
      : `Job alert: ${job.company} is hiring ${job.title} in ${job.city} today.`;
  }

  if (batch.batchType === 'french_daily_jobs') {
    return "Voici les nouvelles offres d'emploi disponibles au Cameroun aujourd'hui sur Joblinca.";
  }

  if (batch.batchType === 'english_daily_jobs') {
    return 'Here are new job opportunities available in Cameroon today on Joblinca.';
  }

  return batch.language === 'fr'
    ? "Voici les meilleures offres d'emploi disponibles au Cameroun aujourd'hui sur Joblinca."
    : 'Looking for a job in Cameroon? Here are the top opportunities available today on Joblinca.';
}

function buildTrustLine(batch: VideoBatchDraft) {
  if (batch.jobs.every((job) => job.trustedByJoblinca)) {
    return batch.language === 'fr'
      ? "Ces offres ont ete publiees directement par des employeurs et verifiees par notre equipe."
      : 'These jobs were posted directly by employers and reviewed by our team.';
  }

  if (batch.jobs.every((job) => job.directPlatformJob)) {
    return batch.language === 'fr'
      ? "Ces offres sont deja en ligne sur Joblinca avec des details d'application clairs."
      : 'These jobs are already live on Joblinca with clear application details.';
  }

  return batch.language === 'fr'
    ? "Nous avons retenu uniquement les offres du jour avec des details d'application exploitables."
    : "We've selected only today's publishable jobs with usable application details.";
}

function buildCta(batch: VideoBatchDraft) {
  if (batch.cta === 'Apply directly on Joblinca.com') {
    return batch.language === 'fr'
      ? "Postulez directement sur Joblinca.com. Creez votre compte gratuitement et commencez aujourd'hui."
      : 'Apply directly on Joblinca.com. Create your free account and start today.';
  }

  return batch.language === 'fr'
    ? "Consultez les details et postulez via Joblinca.com. Creez votre compte gratuitement aujourd'hui."
    : 'View details and apply through Joblinca.com. Create your free account today.';
}

export function generateEnglishScript(batch: VideoBatchDraft) {
  const hook = buildHook({ ...batch, language: 'en' });
  const highlights = batch.jobs
    .slice(0, batch.batchType === 'single_job_alert' ? 1 : 6)
    .map((job) => formatJobHighlight(job, 'en'))
    .join(' ');
  const trustLine = buildTrustLine({ ...batch, language: 'en' });
  const cta = buildCta({ ...batch, language: 'en' });

  return [hook, highlights, trustLine, cta].filter(Boolean).join(' ');
}

export function generateFrenchScript(batch: VideoBatchDraft) {
  const hook = buildHook({ ...batch, language: 'fr' });
  const highlights = batch.jobs
    .slice(0, batch.batchType === 'single_job_alert' ? 1 : 6)
    .map((job) => formatJobHighlight(job, 'fr'))
    .join(' ');
  const trustLine = buildTrustLine({ ...batch, language: 'fr' });
  const cta = buildCta({ ...batch, language: 'fr' });

  return [hook, highlights, trustLine, cta].filter(Boolean).join(' ');
}

export function generateCaption(batch: VideoBatchDraft): VideoCaptionSet {
  const trusted = batch.jobs.some((job) => job.trustedByJoblinca);

  const defaultCaption =
    batch.language === 'fr'
      ? trusted
        ? "Des offres verifiees sont disponibles sur Joblinca. Creez votre compte gratuitement et postulez aujourd'hui."
        : "De nouvelles offres sont disponibles sur Joblinca aujourd'hui. Creez votre compte gratuitement et postulez maintenant."
      : trusted
        ? 'Verified jobs are now available on Joblinca. Create your free account and apply today.'
        : 'New jobs are available today on Joblinca. Create your free account and apply now.';

  return {
    default: defaultCaption,
    tiktok:
      batch.language === 'fr'
        ? `${defaultCaption} ${batch.cta}`
        : `${defaultCaption} ${batch.cta}`,
    facebook:
      batch.language === 'fr'
        ? `${defaultCaption} Consultez les details sur Joblinca.com.`
        : `${defaultCaption} Check the details on Joblinca.com.`,
    instagram:
      batch.language === 'fr'
        ? `${defaultCaption} Lien en bio ou Joblinca.com.`
        : `${defaultCaption} Link in bio or visit Joblinca.com.`,
    linkedin:
      batch.language === 'fr'
        ? `${defaultCaption} Selection du jour pour les candidats au Cameroun.`
        : `${defaultCaption} Today's shortlist for candidates in Cameroon.`,
    whatsapp:
      batch.language === 'fr'
        ? `${defaultCaption} Joblinca.com`
        : `${defaultCaption} Joblinca.com`,
  };
}

function hashtagFromCity(city: string) {
  return city === 'Yaounde' ? '#YaoundeJobs' : `#${city.replace(/\s+/g, '')}Jobs`;
}

function hashtagFromCategory(category: string) {
  const map: Record<string, string> = {
    'Marketing & Digital': '#MarketingJobs',
    'Accounting & Finance': '#AccountingJobs',
    'Customer Service': '#CustomerServiceJobs',
    'Sales & Commercial': '#SalesJobs',
    'IT & Tech': '#TechJobs',
    'Admin & Office': '#AdminJobs',
  };

  return map[category] || `#${category.replace(/[^A-Za-z]/g, '')}Jobs`;
}

export function generateHashtags(batch: VideoBatchDraft) {
  const hashtags = new Set([
    '#Joblinca',
    '#JobsInCameroon',
    '#CameroonJobs',
    '#HiringNow',
  ]);

  if (batch.language === 'fr') {
    hashtags.add('#RecrutementCameroun');
    hashtags.add('#EmploiCameroun');
  }

  for (const job of batch.jobs) {
    if (job.city !== 'Cameroon' && job.city !== 'Multiple Locations') {
      hashtags.add(hashtagFromCity(job.city));
    }

    if (job.category !== 'Other') {
      hashtags.add(hashtagFromCategory(job.category));
    }
  }

  if (batch.jobs.some((job) => job.trustedByJoblinca)) {
    hashtags.add('#VerifiedJobs');
    hashtags.add('#TrustedJobs');
    hashtags.add('#JoblincaVerified');
    hashtags.add('#DirectHiring');
    hashtags.add('#EmploiVerifie');
    hashtags.add('#RecrutementFiable');
  }

  return [...hashtags];
}

export function generateScenePlan(batch: VideoBatchDraft): VideoScenePlan[] {
  const language = batch.language;
  const hook = buildHook(batch);
  const trustLine = buildTrustLine(batch);
  const cta = buildCta(batch);
  const jobChunks: ClassifiedVideoJob[][] = [];

  const chunkSize = batch.jobs.length > 4 ? 3 : 2;
  for (let index = 0; index < batch.jobs.length; index += chunkSize) {
    jobChunks.push(batch.jobs.slice(index, index + chunkSize));
  }

  const scenePlan: VideoScenePlan[] = [
    {
      id: 'hook',
      label: 'Hook',
      durationSeconds: 5,
      voiceover: hook,
      onScreenText: [batch.title, language === 'fr' ? "Nouvelles offres aujourd'hui" : 'New jobs today'],
      visualNotes: ['Use bold Joblinca brand opener.', 'Show vertical title card with Cameroon-focused styling.'],
    },
  ];

  const jobSceneDuration = Math.max(8, Math.floor((batch.durationTarget - 15) / Math.max(1, jobChunks.length)));
  for (const [index, chunk] of jobChunks.entries()) {
    scenePlan.push({
      id: `jobs-${index + 1}`,
      label: `Job Highlights ${index + 1}`,
      durationSeconds: jobSceneDuration,
      voiceover: chunk.map((job) => formatJobHighlight(job, language)).join(' '),
      onScreenText: chunk.map((job) => `${job.title} | ${job.company} | ${job.city}`),
      visualNotes: [
        'Use one card per job with company, role, city, and trust badge when available.',
        'Keep motion simple and legible for short-form mobile viewing.',
      ],
    });
  }

  scenePlan.push(
    {
      id: 'trust',
      label: 'Trust Line',
      durationSeconds: 5,
      voiceover: trustLine,
      onScreenText: batch.jobs.some((job) => job.trustedByJoblinca)
        ? ['Verified by Joblinca', 'Employer-posted jobs']
        : ['Publishable daily jobs', 'Clear application details'],
      visualNotes: ['Show trust badges and Joblinca review framing without overstating verification.'],
    },
    {
      id: 'cta',
      label: 'CTA',
      durationSeconds: 5,
      voiceover: cta,
      onScreenText: [batch.cta, 'Joblinca.com'],
      visualNotes: ['Close with strong website CTA and clean branded footer.'],
    }
  );

  return scenePlan;
}
