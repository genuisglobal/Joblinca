'use client';

import { useMemo, useState } from 'react';
import StatsCard from '@/app/dashboard/components/StatsCard';
import RecruiterAnalyticsChart from '@/components/applications/RecruiterAnalyticsChart';
import SegmentedFunnelComparison from '@/components/applications/SegmentedFunnelComparison';
import {
  buildRecruiterAnalyticsTimeline,
  buildRecruiterFunnelTimeline,
  summarizeSegmentedFunnel,
  summarizeRecruiterAnalytics,
  summarizeFunnelConversions,
  type RecruiterAnalyticsInput,
  type RecruiterAnalyticsWindow,
  type RecruiterFunnelEvent,
  type SegmentedFunnelEvent,
} from '@/lib/applications/ranking';
import {
  getApplicationChannelSegment,
  getOpportunityAnalyticsSegment,
} from '@/lib/applications/segments';

interface AdminAnalyticsApplication {
  id: string;
  created_at: string;
  application_channel: string | null;
  viewed_at: string | null;
  decision_status: string | null;
  eligibility_status: 'eligible' | 'needs_review' | 'ineligible' | null;
  ranking_score: number | null;
  ranking_breakdown: Record<string, number> | null;
  overall_stage_score: number | null;
  job: {
    job_type: string | null;
    internship_track: string | null;
  } | null;
  current_stage: {
    stage_type: string | null;
  } | null;
}

interface AdminAnalyticsStageEvent {
  application_id: string;
  created_at: string;
  application_channel: string | null;
  job: {
    job_type: string | null;
    internship_track: string | null;
  } | null;
  to_stage: {
    stage_type: string | null;
  } | null;
}

const ANALYTICS_WINDOWS: { value: RecruiterAnalyticsWindow; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export default function AdminRecruitingOverview({
  applications,
  stageEvents,
}: {
  applications: AdminAnalyticsApplication[];
  stageEvents: AdminAnalyticsStageEvent[];
}) {
  const [analyticsWindow, setAnalyticsWindow] = useState<RecruiterAnalyticsWindow>('30d');

  const analyticsInputs = useMemo<RecruiterAnalyticsInput[]>(
    () =>
      applications.map((app) => ({
        createdAt: app.created_at,
        decisionStatus: app.decision_status,
        eligibilityStatus: app.eligibility_status,
        rankingScore: app.ranking_score,
        rankingBreakdown: app.ranking_breakdown,
        overallStageScore: app.overall_stage_score,
        viewedAt: app.viewed_at,
        currentStageType: app.current_stage?.stage_type || null,
      })),
    [applications]
  );

  const funnelEvents = useMemo<RecruiterFunnelEvent[]>(
    () => [
      ...applications.flatMap((app) => {
        const events: RecruiterFunnelEvent[] = [{ createdAt: app.created_at, type: 'apply' }];
        if (app.eligibility_status === 'eligible') {
          events.push({ createdAt: app.created_at, type: 'eligible' });
        }
        return events;
      }),
      ...stageEvents.flatMap((event) => {
        const stageType = event.to_stage?.stage_type;
        if (stageType === 'interview' || stageType === 'offer' || stageType === 'hire') {
          return [{ createdAt: event.created_at, type: stageType as RecruiterFunnelEvent['type'] }];
        }
        return [];
      }),
    ],
    [applications, stageEvents]
  );
  const sourceChannelEvents = useMemo<SegmentedFunnelEvent[]>(
    () => [
      ...applications.flatMap((app) => {
        const segment = getApplicationChannelSegment(app.application_channel);
        const events: SegmentedFunnelEvent[] = [
          {
            createdAt: app.created_at,
            type: 'apply',
            segmentKey: segment.key,
            segmentLabel: segment.label,
          },
        ];
        if (app.eligibility_status === 'eligible') {
          events.push({
            createdAt: app.created_at,
            type: 'eligible',
            segmentKey: segment.key,
            segmentLabel: segment.label,
          });
        }
        return events;
      }),
      ...stageEvents.flatMap((event) => {
        const stageType = event.to_stage?.stage_type;
        if (stageType !== 'interview' && stageType !== 'offer' && stageType !== 'hire') {
          return [];
        }

        const segment = getApplicationChannelSegment(event.application_channel);
        return [
          {
            createdAt: event.created_at,
            type: stageType,
            segmentKey: segment.key,
            segmentLabel: segment.label,
          } satisfies SegmentedFunnelEvent,
        ];
      }),
    ],
    [applications, stageEvents]
  );
  const opportunityEvents = useMemo<SegmentedFunnelEvent[]>(
    () => [
      ...applications.flatMap((app) => {
        const segment = getOpportunityAnalyticsSegment(
          app.job?.job_type,
          app.job?.internship_track
        );
        const events: SegmentedFunnelEvent[] = [
          {
            createdAt: app.created_at,
            type: 'apply',
            segmentKey: segment.key,
            segmentLabel: segment.label,
          },
        ];
        if (app.eligibility_status === 'eligible') {
          events.push({
            createdAt: app.created_at,
            type: 'eligible',
            segmentKey: segment.key,
            segmentLabel: segment.label,
          });
        }
        return events;
      }),
      ...stageEvents.flatMap((event) => {
        const stageType = event.to_stage?.stage_type;
        if (stageType !== 'interview' && stageType !== 'offer' && stageType !== 'hire') {
          return [];
        }

        const segment = getOpportunityAnalyticsSegment(
          event.job?.job_type,
          event.job?.internship_track
        );
        return [
          {
            createdAt: event.created_at,
            type: stageType,
            segmentKey: segment.key,
            segmentLabel: segment.label,
          } satisfies SegmentedFunnelEvent,
        ];
      }),
    ],
    [applications, stageEvents]
  );

  const analytics = useMemo(
    () => summarizeRecruiterAnalytics(analyticsInputs),
    [analyticsInputs]
  );
  const timeline = useMemo(
    () => buildRecruiterAnalyticsTimeline(analyticsInputs, analyticsWindow),
    [analyticsInputs, analyticsWindow]
  );
  const funnelTimeline = useMemo(
    () => buildRecruiterFunnelTimeline(funnelEvents, analyticsWindow),
    [funnelEvents, analyticsWindow]
  );
  const funnelConversions = useMemo(
    () => summarizeFunnelConversions(funnelTimeline.totals),
    [funnelTimeline]
  );
  const sourceChannelSummary = useMemo(
    () => summarizeSegmentedFunnel(sourceChannelEvents, analyticsWindow),
    [analyticsWindow, sourceChannelEvents]
  );
  const opportunitySummary = useMemo(
    () => summarizeSegmentedFunnel(opportunityEvents, analyticsWindow),
    [analyticsWindow, opportunityEvents]
  );

  function formatRate(value: number) {
    return `${Math.round(value)}%`;
  }

  return (
    <div className="mb-8 rounded-xl border border-gray-700 bg-gray-800 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Recruiting Funnel</h2>
          <p className="mt-1 text-sm text-gray-400">
            Platform-wide ATS event analytics across apply, eligibility, interview, offer, and hire.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ANALYTICS_WINDOWS.map((windowOption) => (
            <button
              key={windowOption.value}
              type="button"
              onClick={() => setAnalyticsWindow(windowOption.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                analyticsWindow === windowOption.value
                  ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                  : 'border-gray-600 bg-gray-700/60 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {windowOption.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Window Applications"
          value={timeline.totals.applications}
          color="blue"
          description={`Created in the last ${timeline.windowDays} days`}
        />
        <StatsCard
          title="Eligible"
          value={timeline.totals.eligible}
          color="green"
          description={`${formatRate(analytics.eligibleRate)} pass eligibility`}
        />
        <StatsCard
          title="Unread"
          value={timeline.totals.unread}
          color="yellow"
          description="Still not opened"
        />
        <StatsCard
          title="Hires"
          value={funnelTimeline.totals.hire}
          color="green"
          description={`${formatRate(analytics.hireRate)} overall hire rate`}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatsCard title="Apply Events" value={funnelTimeline.totals.apply} color="blue" description="Applications created" />
        <StatsCard title="Eligible Events" value={funnelTimeline.totals.eligible} color="green" description="Passed eligibility" />
        <StatsCard title="Interview Events" value={funnelTimeline.totals.interview} color="purple" description="Moved into interview" />
        <StatsCard title="Offer Events" value={funnelTimeline.totals.offer} color="yellow" description="Moved into offer" />
        <StatsCard title="Hire Events" value={funnelTimeline.totals.hire} color="green" description="Moved into hire" />
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatsCard title="Eligible / Apply" value={formatRate(funnelConversions.eligibilityFromApply)} color="green" description="Submission pass-through" />
        <StatsCard title="Interview / Eligible" value={formatRate(funnelConversions.interviewFromEligible)} color="purple" description="Progress after eligibility" />
        <StatsCard title="Offer / Interview" value={formatRate(funnelConversions.offerFromInterview)} color="yellow" description="Interview-to-offer" />
        <StatsCard title="Hire / Offer" value={formatRate(funnelConversions.hireFromOffer)} color="green" description="Offer acceptance" />
        <StatsCard title="Hire / Apply" value={formatRate(funnelConversions.hireFromApply)} color="blue" description="Top-line funnel conversion" />
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <RecruiterAnalyticsChart
          title="Volume"
          description="Applications created versus unread load"
          buckets={timeline.buckets}
          series={[
            { key: 'applications', label: 'Applications', colorClass: 'bg-blue-500' },
            { key: 'unread', label: 'Unread', colorClass: 'bg-amber-400' },
          ]}
        />
        <RecruiterAnalyticsChart
          title="Quality and Outcome"
          description="Eligibility pass rate, interview progression, and hires"
          buckets={timeline.buckets}
          series={[
            { key: 'eligible', label: 'Eligible', colorClass: 'bg-emerald-500' },
            { key: 'advanced', label: 'Interview+', colorClass: 'bg-violet-500' },
            { key: 'hired', label: 'Hired', colorClass: 'bg-cyan-400' },
          ]}
        />
      </div>

      <div className="mt-5">
        <RecruiterAnalyticsChart
          title="Event Funnel"
          description="Actual ATS stage-movement events across the selected window"
          buckets={funnelTimeline.buckets}
          series={[
            { key: 'apply', label: 'Apply', colorClass: 'bg-blue-500' },
            { key: 'eligible', label: 'Eligible', colorClass: 'bg-emerald-500' },
            { key: 'interview', label: 'Interview', colorClass: 'bg-violet-500' },
            { key: 'offer', label: 'Offer', colorClass: 'bg-amber-400' },
            { key: 'hire', label: 'Hire', colorClass: 'bg-cyan-400' },
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SegmentedFunnelComparison
          title="Opportunity Type Comparison"
          description="Compare event funnel performance across jobs, educational internships, professional internships, and gigs."
          segments={opportunitySummary}
          emptyLabel="No opportunity-type funnel activity for this window yet."
        />
        <SegmentedFunnelComparison
          title="Source Channel Comparison"
          description="Compare platform-wide funnel quality across native, WhatsApp, email, and external channels."
          segments={sourceChannelSummary}
          emptyLabel="No source-channel funnel activity for this window yet."
        />
      </div>
    </div>
  );
}
