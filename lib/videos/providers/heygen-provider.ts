import type { HeyGenVideoPayload, VideoBatchOutput } from '../types';

export interface VideoProvider<TPayload> {
  createVideoPayload(batch: VideoBatchOutput): TPayload;
  submitVideoJob(payload: TPayload): Promise<{
    ok: boolean;
    mode: 'dry_run' | 'live';
    jobId: string | null;
    status: 'drafted' | 'submitted' | 'skipped';
  }>;
  checkVideoStatus(jobId: string): Promise<{
    ok: boolean;
    mode: 'dry_run' | 'live';
    jobId: string;
    status: 'drafted' | 'queued' | 'processing' | 'completed' | 'failed' | 'unknown';
  }>;
  downloadVideo(jobId: string): Promise<{
    ok: boolean;
    mode: 'dry_run' | 'live';
    jobId: string;
    downloadUrl: string | null;
  }>;
}

export class HeyGenDryRunProvider implements VideoProvider<HeyGenVideoPayload> {
  constructor(
    private readonly appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com'
  ) {}

  createVideoPayload(batch: VideoBatchOutput): HeyGenVideoPayload {
    return {
      provider: 'heygen',
      mode: 'dry_run',
      batchId: batch.id,
      title: batch.title,
      language: batch.language,
      output: {
        aspectRatio: batch.aspectRatio,
        resolution: batch.resolution,
        durationTarget: batch.durationTarget,
      },
      brand: {
        name: 'Joblinca',
        website: this.appUrl,
        cta: batch.cta,
      },
      style: {
        tone: 'professional, energetic, Cameroon-focused, simple, trustworthy',
        presenterStyle: 'short-form vertical explainer',
        countryFocus: 'Cameroon',
      },
      jobs: batch.jobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        city: job.city,
        category: job.category,
        experienceLevel: job.experienceLevel,
        applicationUrl: job.applicationUrl || job.jobUrl,
        sourceType: job.sourceType,
        trustedByJoblinca: job.trustedByJoblinca,
      })),
      script: batch.script,
      captions: batch.captionsByPlatform,
      hashtags: batch.hashtags,
      scenePlan: batch.scenePlan,
    };
  }

  async submitVideoJob(payload: HeyGenVideoPayload) {
    return {
      ok: true,
      mode: 'dry_run' as const,
      jobId: `dry-run-${payload.batchId}`,
      status: 'drafted' as const,
    };
  }

  async checkVideoStatus(jobId: string) {
    return {
      ok: true,
      mode: 'dry_run' as const,
      jobId,
      status: 'drafted' as const,
    };
  }

  async downloadVideo(jobId: string) {
    return {
      ok: true,
      mode: 'dry_run' as const,
      jobId,
      downloadUrl: null,
    };
  }
}

export function createHeyGenProvider() {
  return new HeyGenDryRunProvider();
}
