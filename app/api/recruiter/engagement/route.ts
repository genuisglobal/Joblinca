import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

type EngagementWindow = '7d' | '30d' | '90d';
type ExternalApplyMethod =
  | 'external_url'
  | 'email'
  | 'phone'
  | 'whatsapp'
  | 'copy_link';

interface RecruiterJobRow {
  id: string;
  title: string | null;
  apply_method: string | null;
}

interface ExternalApplyClickRow {
  job_id: string;
  method: ExternalApplyMethod;
  clicked_at: string;
}

interface SavedJobRow {
  job_id: string;
  saved_at: string;
}

interface JobEngagementAccumulator {
  jobId: string;
  title: string;
  applyMethod: string | null;
  currentSavedCount: number;
  externalClicks: Record<EngagementWindow, number>;
  lastExternalClickAt: string | null;
}

const WINDOW_DAYS: Record<EngagementWindow, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const EXTERNAL_METHODS: ExternalApplyMethod[] = [
  'external_url',
  'email',
  'phone',
  'whatsapp',
  'copy_link',
];

function createWindowCounts(): Record<EngagementWindow, number> {
  return {
    '7d': 0,
    '30d': 0,
    '90d': 0,
  };
}

function createMethodCounts(): Record<EngagementWindow, Record<ExternalApplyMethod, number>> {
  return {
    '7d': {
      external_url: 0,
      email: 0,
      phone: 0,
      whatsapp: 0,
      copy_link: 0,
    },
    '30d': {
      external_url: 0,
      email: 0,
      phone: 0,
      whatsapp: 0,
      copy_link: 0,
    },
    '90d': {
      external_url: 0,
      email: 0,
      phone: 0,
      whatsapp: 0,
      copy_link: 0,
    },
  };
}

function incrementWindows(
  counts: Record<EngagementWindow, number>,
  timestamp: string,
  now: number
) {
  const eventTime = new Date(timestamp).getTime();
  if (Number.isNaN(eventTime)) {
    return;
  }

  for (const [windowKey, days] of Object.entries(WINDOW_DAYS) as [EngagementWindow, number][]) {
    const windowStart = now - days * 86400000;
    if (eventTime >= windowStart) {
      counts[windowKey] += 1;
    }
  }
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const serviceSupabase = createServiceSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: recruiterJobs, error: jobsError } = await serviceSupabase
    .from('jobs')
    .select('id, title, apply_method')
    .eq('recruiter_id', user.id)
    .order('created_at', { ascending: false });

  if (jobsError) {
    return NextResponse.json({ error: 'Failed to load recruiter jobs' }, { status: 500 });
  }

  const jobs = (recruiterJobs || []) as RecruiterJobRow[];
  const jobIds = jobs.map((job) => job.id);
  const emptyMethodCounts = createMethodCounts();

  if (jobIds.length === 0) {
    return NextResponse.json({
      totals: {
        currentSavedJobs: 0,
        externalClicks: createWindowCounts(),
      },
      methods: Object.fromEntries(
        (Object.keys(emptyMethodCounts) as EngagementWindow[]).map((windowKey) => [
          windowKey,
          EXTERNAL_METHODS.map((method) => ({
            method,
            count: emptyMethodCounts[windowKey][method],
          })),
        ])
      ),
      jobs: [],
    });
  }

  const ninetyDaysAgo = new Date(Date.now() - WINDOW_DAYS['90d'] * 86400000).toISOString();
  const [clicksResult, savedJobsResult] = await Promise.all([
    serviceSupabase
      .from('external_apply_clicks')
      .select('job_id, method, clicked_at')
      .in('job_id', jobIds)
      .gte('clicked_at', ninetyDaysAgo),
    serviceSupabase
      .from('saved_jobs')
      .select('job_id, saved_at')
      .in('job_id', jobIds),
  ]);

  if (clicksResult.error) {
    return NextResponse.json(
      { error: 'Failed to load external engagement signals' },
      { status: 500 }
    );
  }

  if (savedJobsResult.error) {
    return NextResponse.json(
      { error: 'Failed to load saved job engagement signals' },
      { status: 500 }
    );
  }

  const engagementByJob = new Map<string, JobEngagementAccumulator>();
  jobs.forEach((job) => {
    engagementByJob.set(job.id, {
      jobId: job.id,
      title: job.title || 'Untitled job',
      applyMethod: job.apply_method,
      currentSavedCount: 0,
      externalClicks: createWindowCounts(),
      lastExternalClickAt: null,
    });
  });

  const totals = {
    currentSavedJobs: 0,
    externalClicks: createWindowCounts(),
  };
  const methodCounts = createMethodCounts();
  const now = Date.now();

  ((clicksResult.data || []) as ExternalApplyClickRow[]).forEach((click) => {
    const job = engagementByJob.get(click.job_id);
    if (!job) {
      return;
    }

    incrementWindows(totals.externalClicks, click.clicked_at, now);
    incrementWindows(job.externalClicks, click.clicked_at, now);

    for (const [windowKey, days] of Object.entries(WINDOW_DAYS) as [EngagementWindow, number][]) {
      const windowStart = now - days * 86400000;
      const eventTime = new Date(click.clicked_at).getTime();
      if (!Number.isNaN(eventTime) && eventTime >= windowStart) {
        methodCounts[windowKey][click.method] += 1;
      }
    }

    if (!job.lastExternalClickAt || job.lastExternalClickAt < click.clicked_at) {
      job.lastExternalClickAt = click.clicked_at;
    }
  });

  ((savedJobsResult.data || []) as SavedJobRow[]).forEach((savedJob) => {
    const job = engagementByJob.get(savedJob.job_id);
    if (!job) {
      return;
    }

    job.currentSavedCount += 1;
    totals.currentSavedJobs += 1;
  });

  const serializedMethods = Object.fromEntries(
    (Object.keys(methodCounts) as EngagementWindow[]).map((windowKey) => [
      windowKey,
      EXTERNAL_METHODS.map((method) => ({
        method,
        count: methodCounts[windowKey][method],
      })),
    ])
  );

  const serializedJobs = Array.from(engagementByJob.values()).sort((a, b) => {
    if (b.externalClicks['90d'] !== a.externalClicks['90d']) {
      return b.externalClicks['90d'] - a.externalClicks['90d'];
    }

    if (b.currentSavedCount !== a.currentSavedCount) {
      return b.currentSavedCount - a.currentSavedCount;
    }

    return a.title.localeCompare(b.title);
  });

  return NextResponse.json({
    totals,
    methods: serializedMethods,
    jobs: serializedJobs,
  });
}
