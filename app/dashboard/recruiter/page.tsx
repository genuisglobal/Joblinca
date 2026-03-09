'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';
import PaymentModal from '@/app/components/PaymentModal';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import EligibilityBadge from '@/components/applications/EligibilityBadge';
import RankingExplanation from '@/components/applications/RankingExplanation';
import RecruiterAnalyticsChart from '@/components/applications/RecruiterAnalyticsChart';
import SegmentedFunnelComparison from '@/components/applications/SegmentedFunnelComparison';
import {
  buildRecruiterAnalyticsTimeline,
  buildRecruiterFunnelTimeline,
  summarizeSegmentedFunnel,
  summarizeRecruiterAnalytics,
  summarizeFunnelConversions,
  type RecruiterAnalyticsInput,
  type RecruiterFunnelEvent,
  type RecruiterAnalyticsWindow,
  type SegmentedFunnelEvent,
} from '@/lib/applications/ranking';
import { getApplicationChannelSegment } from '@/lib/applications/segments';
import type { ApplicationCurrentStage } from '@/lib/hiring-pipeline/types';

interface Job {
  id: string;
  title: string;
  location: string;
  published: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface Application {
  id: string;
  status: string;
  created_at: string;
  job_id: string;
  application_channel: string | null;
  viewed_at: string | null;
  decision_status: string | null;
  eligibility_status: 'eligible' | 'needs_review' | 'ineligible' | null;
  overall_stage_score: number | null;
  ranking_score: number | null;
  ranking_breakdown: Record<string, number> | null;
  profiles: Profile | null;
  jobs: { title: string } | null;
  current_stage: ApplicationCurrentStage | null;
}

interface Verification {
  status: string;
}

interface ApplicationStageEventRow {
  application_id: string;
  created_at: string;
  to_stage: {
    stage_type: string | null;
  } | null;
}

interface RecruiterVerificationPlan {
  id: string;
  slug: string;
  name: string;
  description: string;
  amount_xaf: number;
  duration_days: number | null;
  plan_type: string;
  sort_order: number;
}

interface SubscriptionStatus {
  isActive: boolean;
  plan: {
    role: string;
    name: string;
  } | null;
  expiresAt: string | null;
}

const ANALYTICS_WINDOWS: { value: RecruiterAnalyticsWindow; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export default function RecruiterDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [stageEvents, setStageEvents] = useState<ApplicationStageEventRow[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [postingAccess, setPostingAccess] = useState(false);
  const [activeRecruiterPlanName, setActiveRecruiterPlanName] = useState<string | null>(null);
  const [activeRecruiterPlanExpiry, setActiveRecruiterPlanExpiry] = useState<string | null>(null);
  const [verificationPlans, setVerificationPlans] = useState<RecruiterVerificationPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<RecruiterVerificationPlan | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [analyticsWindow, setAnalyticsWindow] = useState<RecruiterAnalyticsWindow>('30d');

  useEffect(() => {
    let mounted = true;

    function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
      if (Array.isArray(value)) {
        return value[0] || null;
      }

      return value || null;
    }

    async function loadDashboardData() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (!mounted) return;

        if (authError || !user) {
          router.replace('/auth/login');
          return;
        }

        // Fetch recruiter's jobs
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('*')
          .eq('recruiter_id', user.id)
          .order('created_at', { ascending: false });

        if (!mounted) return;

        const fetchedJobs = jobsData || [];
        setJobs(fetchedJobs);

        // Fetch applications for recruiter's jobs
        const jobIds = fetchedJobs.map((j) => j.id);
        if (jobIds.length > 0) {
          const { data: appsData } = await supabase
            .from('applications')
            .select(`
              id,
              status,
              created_at,
              job_id,
              application_channel,
              viewed_at,
              decision_status,
              eligibility_status,
              overall_stage_score,
              ranking_score,
              ranking_breakdown,
              profiles:applicant_id (
                id,
                full_name,
                first_name,
                last_name
              ),
              jobs:job_id (
                title
              ),
              current_stage:current_stage_id (
                id,
                stage_key,
                label,
                stage_type,
                order_index,
                is_terminal,
                allows_feedback
              )
            `)
            .in('job_id', jobIds)
            .neq('status', 'draft')
            .order('created_at', { ascending: false });

          if (!mounted) return;
          const normalizedApps = (appsData || []).map((app: any) => ({
            ...app,
            jobs: normalizeRelation(app.jobs),
            profiles: normalizeRelation(app.profiles),
            current_stage: (() => {
              const stage = normalizeRelation(app.current_stage);
              if (!stage) return null;

              return {
                id: stage.id,
                stageKey: stage.stage_key,
                label: stage.label,
                stageType: stage.stage_type,
                orderIndex: stage.order_index,
                isTerminal: stage.is_terminal,
                allowsFeedback: stage.allows_feedback,
              };
            })(),
          }));
          setApplications(normalizedApps as Application[]);

          const applicationIds = normalizedApps.map((app: Application) => app.id);
          if (applicationIds.length > 0) {
            const ninetyDaysAgo = new Date(Date.now() - 89 * 86400000).toISOString();
            const { data: stageEventData } = await supabase
              .from('application_stage_events')
              .select(
                `
                application_id,
                created_at,
                to_stage:to_stage_id (
                  stage_type
                )
              `
              )
              .in('application_id', applicationIds)
              .gte('created_at', ninetyDaysAgo)
              .order('created_at', { ascending: false });

            if (!mounted) return;
            const normalizedStageEvents = (stageEventData || []).map((event: any) => ({
              application_id: event.application_id,
              created_at: event.created_at,
              to_stage: normalizeRelation(event.to_stage),
            }));
            setStageEvents(normalizedStageEvents as ApplicationStageEventRow[]);
          } else {
            setStageEvents([]);
          }
        } else {
          setApplications([]);
          setStageEvents([]);
        }

        // Fetch verification status
        const { data: verificationData } = await supabase
          .from('verifications')
          .select('status')
          .eq('user_id', user.id)
          .single();

        // Fetch active recruiter subscription to gate posting access.
        const subscriptionRes = await fetch('/api/subscriptions/me');
        if (subscriptionRes.ok) {
          const subscriptionData = (await subscriptionRes.json()) as SubscriptionStatus;
          const hasRecruiterSubscription =
            Boolean(subscriptionData?.isActive) &&
            subscriptionData?.plan?.role === 'recruiter';
          setPostingAccess(hasRecruiterSubscription);
          setActiveRecruiterPlanName(
            hasRecruiterSubscription ? subscriptionData.plan?.name || null : null
          );
          setActiveRecruiterPlanExpiry(subscriptionData?.expiresAt || null);
        } else {
          setPostingAccess(false);
          setActiveRecruiterPlanName(null);
          setActiveRecruiterPlanExpiry(null);
        }

        // Fetch recruiter verification tiers (basic/trusted/premium).
        const plansRes = await fetch('/api/pricing-plans?role=recruiter');
        if (plansRes.ok) {
          const plansPayload = await plansRes.json();
          const recruiterPlans = Array.isArray(plansPayload?.plans?.recruiter)
            ? plansPayload.plans.recruiter
            : [];
          const verificationTierPlans = recruiterPlans
            .filter(
              (plan: RecruiterVerificationPlan) =>
                plan.plan_type !== 'per_job' && !plan.slug.startsWith('job_')
            )
            .sort(
              (a: RecruiterVerificationPlan, b: RecruiterVerificationPlan) =>
                (a.sort_order || 0) - (b.sort_order || 0)
            );
          setVerificationPlans(verificationTierPlans);
        } else {
          setVerificationPlans([]);
        }

        if (!mounted) return;
        setVerification(verificationData);

        setLoading(false);
      } catch (err) {
        console.error('Dashboard load error:', err);
        if (mounted) {
          router.replace('/auth/login');
        }
      }
    }

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  const totalJobs = jobs.length;
  const publishedJobs = jobs.filter((j) => j.published).length;
  const totalApplications = applications.length;
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
        currentStageType: app.current_stage?.stageType || null,
      })),
    [applications]
  );
  const funnelEvents = useMemo<RecruiterFunnelEvent[]>(
    () => [
      ...applications.flatMap((app) => {
        const events: RecruiterFunnelEvent[] = [
          { createdAt: app.created_at, type: 'apply' },
        ];

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
  const applicationLookup = useMemo(
    () => new Map(applications.map((app) => [app.id, app])),
    [applications]
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
        const app = applicationLookup.get(event.application_id);
        if (!app) {
          return [];
        }

        const stageType = event.to_stage?.stage_type;
        if (stageType !== 'interview' && stageType !== 'offer' && stageType !== 'hire') {
          return [];
        }

        const segment = getApplicationChannelSegment(app.application_channel);
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
    [applicationLookup, applications, stageEvents]
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
  const newApplications = analytics.unreadCount;
  const eligibleApplications = analytics.eligibleCount;
  const needsReviewApplications = analytics.needsReviewCount;
  const ineligibleApplications = analytics.ineligibleCount;
  const hiredApplications = analytics.hiredCount;
  const recentJobs = jobs.slice(0, 5);
  const recentApplications = applications.slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  function getApplicantName(profile: Profile | null): string {
    if (!profile) return 'Unknown';
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile.full_name || 'Anonymous';
  }

  function openVerificationCheckout(plan: RecruiterVerificationPlan) {
    setSelectedPlan(plan);
    setShowPayment(true);
  }

  function formatRate(value: number) {
    return `${Math.round(value)}%`;
  }

  return (
    <div className="space-y-8">
      {/* Posting Access Gate */}
      <div
        className={`rounded-xl border p-6 ${
          postingAccess
            ? 'bg-emerald-900/20 border-emerald-700/40'
            : 'bg-red-900/20 border-red-700/40'
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Job Posting Access</h2>
            {postingAccess ? (
              <>
                <p className="mt-2 text-emerald-300">
                  Posting is enabled with your recruiter plan:{' '}
                  <span className="font-semibold">{activeRecruiterPlanName || 'Active Recruiter Plan'}</span>.
                </p>
                {activeRecruiterPlanExpiry && (
                  <p className="text-sm text-emerald-200 mt-1">
                    Expires on {new Date(activeRecruiterPlanExpiry).toLocaleDateString()}.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="mt-2 text-red-300">
                  You cannot post jobs yet. Activate at least <span className="font-semibold">Basic Recruiter Verification</span> first.
                </p>
                <p className="text-sm text-red-200 mt-1">
                  Without an active recruiter verification plan, job posting is locked.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {postingAccess ? (
              <Link
                href="/jobs/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Post New Job
              </Link>
            ) : (
              <Link
                href="/dashboard/subscription"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Activate Recruiter Plan
              </Link>
            )}
          </div>
        </div>

        {!postingAccess && verificationPlans.length > 0 && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {verificationPlans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => openVerificationCheckout(plan)}
                className={`text-left rounded-lg border p-4 transition-colors ${
                  plan.slug === 'recruiter_basic'
                    ? 'border-blue-500/50 bg-blue-900/25 hover:bg-blue-900/35'
                    : 'border-gray-700 bg-gray-800/70 hover:bg-gray-800'
                }`}
              >
                <p className="text-sm text-gray-300">{plan.name}</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {plan.amount_xaf.toLocaleString()} CFA
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {plan.duration_days ? `Valid for ${plan.duration_days} days` : 'One-time activation'}
                </p>
                {plan.slug === 'recruiter_basic' && (
                  <p className="text-xs text-blue-300 mt-2 font-medium">
                    Minimum required to unlock posting
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Jobs Posted"
          value={totalJobs}
          color="blue"
          icon={
            <svg
              className="w-6 h-6 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Published Jobs"
          value={publishedJobs}
          color="green"
          icon={
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Total Applications"
          value={totalApplications}
          color="purple"
          icon={
            <svg
              className="w-6 h-6 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        />
        <Link href="/dashboard/recruiter/applications">
          <StatsCard
            title="Unreviewed"
            value={newApplications}
            color="yellow"
            description="Applications not opened yet"
            icon={
              <svg
                className="w-6 h-6 text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
        </Link>
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/dashboard/recruiter/applications?eligibility=eligible">
          <StatsCard
            title="Eligible"
            value={eligibleApplications}
            color="green"
            description={`${formatRate(analytics.eligibleRate)} pass eligibility`}
          />
        </Link>
        <Link href="/dashboard/recruiter/applications?eligibility=needs_review">
          <StatsCard
            title="Needs Review"
            value={needsReviewApplications}
            color="yellow"
            description="Borderline or incomplete checks"
          />
        </Link>
        <Link href="/dashboard/recruiter/applications?eligibility=ineligible">
          <StatsCard
            title="Ineligible"
            value={ineligibleApplications}
            color="red"
            description="Blocked by current rules"
          />
        </Link>
        <Link href="/dashboard/recruiter/applications?stage=hire">
          <StatsCard
            title="Hired"
            value={hiredApplications}
            color="green"
            description={`${formatRate(analytics.hireRate)} overall hire rate`}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Average Rank"
          value={analytics.averageRankingScore.toFixed(1)}
          color="blue"
          description="Composite ATS ranking"
        />
        <StatsCard
          title="Average Stage Score"
          value={analytics.averageStageScore.toFixed(1)}
          color="purple"
          description="Structured feedback average"
        />
        <StatsCard
          title="Average AI Match"
          value={analytics.averageAiMatch.toFixed(1)}
          color="yellow"
          description="AI contribution inside ranking"
        />
        <StatsCard
          title="Interview and Beyond"
          value={analytics.advancedStageCount}
          color="blue"
          description={`${formatRate(analytics.advancedStageRate)} in interview, offer, or hire`}
        />
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">ATS Trend Window</h2>
            <p className="mt-1 text-sm text-gray-400">
              Track application volume, eligibility quality, unread load, and downstream hiring over a selected time range.
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
            title="Window Eligible"
            value={timeline.totals.eligible}
            color="green"
            description="Passed eligibility in window"
          />
          <StatsCard
            title="Window Hires"
            value={timeline.totals.hired}
            color="green"
            description="Hired decisions in window"
          />
          <StatsCard
            title="Window Unread"
            value={timeline.totals.unread}
            color="yellow"
            description="Still not opened"
          />
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard
            title="Apply Events"
            value={funnelTimeline.totals.apply}
            color="blue"
            description="Applications started in window"
          />
          <StatsCard
            title="Eligible Events"
            value={funnelTimeline.totals.eligible}
            color="green"
            description="Eligible at submission"
          />
          <StatsCard
            title="Interview Events"
            value={funnelTimeline.totals.interview}
            color="purple"
            description="Moved into interview"
          />
          <StatsCard
            title="Offer Events"
            value={funnelTimeline.totals.offer}
            color="yellow"
            description="Moved into offer"
          />
          <StatsCard
            title="Hire Events"
            value={funnelTimeline.totals.hire}
            color="green"
            description="Moved into hire stage"
          />
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatsCard
            title="Eligible / Apply"
            value={formatRate(funnelConversions.eligibilityFromApply)}
            color="green"
            description="Submission pass-through"
          />
          <StatsCard
            title="Interview / Eligible"
            value={formatRate(funnelConversions.interviewFromEligible)}
            color="purple"
            description="Progress after eligibility"
          />
          <StatsCard
            title="Offer / Interview"
            value={formatRate(funnelConversions.offerFromInterview)}
            color="yellow"
            description="Interview-to-offer conversion"
          />
          <StatsCard
            title="Hire / Offer"
            value={formatRate(funnelConversions.hireFromOffer)}
            color="green"
            description="Offer acceptance rate"
          />
          <StatsCard
            title="Hire / Apply"
            value={formatRate(funnelConversions.hireFromApply)}
            color="blue"
            description="Top-line funnel conversion"
          />
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
            description="Real stage-movement events across apply, eligibility, interview, offer, and hire"
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

        <div className="mt-5">
          <SegmentedFunnelComparison
            title="Source Channel Comparison"
            description="Compare ATS funnel quality across native, WhatsApp, email, and external application channels."
            segments={sourceChannelSummary}
            emptyLabel="No source-channel funnel activity for this window yet."
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
        {postingAccess ? (
          <Link
            href="/jobs/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Post New Job
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.push('/dashboard/subscription')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4zm0 0v2m-6 8h12a2 2 0 002-2v-4a2 2 0 00-2-2H6a2 2 0 00-2 2v4a2 2 0 002 2z"
              />
            </svg>
            Posting Locked (Activate Basic)
          </button>
        )}
        <Link
          href="/dashboard/recruiter/jobs"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          View All Jobs
        </Link>
        <Link
          href="/dashboard/recruiter/whatsapp-applications"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-600 transition-colors"
        >
          WhatsApp Screening
        </Link>
        {!verification && (
          <Link
            href="/dashboard/recruiter/verification"
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            Get Verified
          </Link>
        )}
      </div>

      {/* Recent Jobs */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Recent Jobs</h2>
          <Link
            href="/dashboard/recruiter/jobs"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            View All
          </Link>
        </div>
        {recentJobs.length === 0 ? (
          <p className="text-gray-400">No jobs posted yet.</p>
        ) : (
          <div className="space-y-4">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-white">{job.title}</h3>
                  <p className="text-sm text-gray-400">
                    {job.location || 'Location not specified'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status={job.published ? 'published' : 'pending'}
                  />
                  <Link
                    href={`/dashboard/recruiter/jobs/${job.id}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Applications */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            Recent Applications
          </h2>
          <Link
            href="/dashboard/recruiter/applications"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            View All
          </Link>
        </div>
        {recentApplications.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="w-16 h-16 mx-auto text-gray-600 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-400">No applications received yet.</p>
            <p className="text-sm text-gray-500 mt-1">
              Applications will appear here once candidates apply to your jobs.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentApplications.map((app) => (
              <Link
                key={app.id}
                href={`/dashboard/recruiter/applications/${app.id}`}
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                    {getApplicantName(app.profiles).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {getApplicantName(app.profiles)}
                      {!app.viewed_at && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">
                          New
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-400">
                      {app.jobs?.title || 'Job'} - {new Date(app.created_at).toLocaleDateString()}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <EligibilityBadge status={app.eligibility_status} compact />
                    </div>
                    <div className="mt-1">
                      <RankingExplanation
                        compact
                        rankingScore={app.ranking_score}
                        rankingBreakdown={app.ranking_breakdown}
                        overallStageScore={app.overall_stage_score}
                        eligibilityStatus={app.eligibility_status}
                        decisionStatus={app.decision_status}
                        currentStageType={app.current_stage?.stageType || null}
                      />
                    </div>
                  </div>
                </div>
                <StageBadge
                  label={app.current_stage?.label || app.status}
                  stageType={app.current_stage?.stageType || 'applied'}
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      {showPayment && selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          onClose={() => {
            setShowPayment(false);
            setSelectedPlan(null);
          }}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
