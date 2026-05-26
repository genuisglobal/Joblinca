'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatsCard from '../../components/StatsCard';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import EligibilityBadge from '@/components/applications/EligibilityBadge';
import RankingExplanation from '@/components/applications/RankingExplanation';
import { buildRecruiterTemplateMessage } from '@/lib/ai/recruiterDecisionSupport';
import type { ApplicationCurrentStage } from '@/lib/hiring-pipeline/types';
import { useTranslation } from '@/lib/i18n/context';
import { addLocalePrefix } from '@/lib/i18n/locale';
import { formatLocalizedDate } from '@/lib/i18n/application-presentation';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter: string | null;
  status: string;
  current_stage_id: string | null;
  stage_entered_at: string | null;
  decision_status: string | null;
  eligibility_status: 'eligible' | 'needs_review' | 'ineligible' | null;
  overall_stage_score: number | null;
  created_at: string;
  updated_at: string;
  resume_url: string | null;
  recruiter_rating: number | null;
  tags: string[];
  viewed_at: string | null;
  is_pinned: boolean;
  ranking_score: number;
  ranking_breakdown: Record<string, number> | null;
  quiz_verified: boolean | null;
  quiz_verified_meta: {
    domain?: string | null;
    score?: number | null;
    week_key?: string | null;
    challenge_id?: string | null;
    rank?: number | null;
  } | null;
  jobs: Job;
  profiles: Profile;
  current_stage: ApplicationCurrentStage | null;
}

type SortOption = 'newest' | 'oldest' | 'ranking' | 'rating';
type EligibilityFilter = 'all' | 'eligible' | 'needs_review' | 'ineligible';
type StageFilter =
  | 'all'
  | 'applied'
  | 'screening'
  | 'review'
  | 'interview'
  | 'offer'
  | 'hire'
  | 'rejected';

export default function RecruiterApplicationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { t, locale } = useTranslation();
  const localize = useCallback((href: string) => addLocalePrefix(href, locale), [locale]);

  const stageOptions = useMemo(
    () => [
      { value: 'all' as StageFilter, label: t('recruiterApplications.stage.all'), color: 'gray' },
      { value: 'applied' as StageFilter, label: t('recruiterApplications.stage.applied'), color: 'blue' },
      { value: 'screening' as StageFilter, label: t('recruiterApplications.stage.screening'), color: 'blue' },
      { value: 'review' as StageFilter, label: t('recruiterApplications.stage.review'), color: 'yellow' },
      { value: 'interview' as StageFilter, label: t('recruiterApplications.stage.interview'), color: 'purple' },
      { value: 'offer' as StageFilter, label: t('recruiterApplications.stage.offer'), color: 'green' },
      { value: 'hire' as StageFilter, label: t('recruiterApplications.stage.hire'), color: 'green' },
      { value: 'rejected' as StageFilter, label: t('recruiterApplications.stage.rejected'), color: 'red' },
    ],
    [t]
  );

  const sortOptions = useMemo(
    () => [
      { value: 'newest' as SortOption, label: t('recruiterApplications.sort.newest') },
      { value: 'oldest' as SortOption, label: t('recruiterApplications.sort.oldest') },
      { value: 'ranking' as SortOption, label: t('recruiterApplications.sort.ranking') },
      { value: 'rating' as SortOption, label: t('recruiterApplications.sort.rating') },
    ],
    [t]
  );

  const eligibilityOptions = useMemo(
    () => [
      { value: 'all' as EligibilityFilter, label: t('recruiterApplications.eligibility.all') },
      { value: 'eligible' as EligibilityFilter, label: t('eligibility.eligible') },
      { value: 'needs_review' as EligibilityFilter, label: t('eligibility.needsReview') },
      { value: 'ineligible' as EligibilityFilter, label: t('eligibility.ineligible') },
    ],
    [t]
  );

  // State
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [quickUpdatingId, setQuickUpdatingId] = useState<string | null>(null);

  // Filters from URL params
  const stageFilter = (searchParams.get('stage') as StageFilter) || 'all';
  const jobFilter = searchParams.get('job') || 'all';
  const sortBy = (searchParams.get('sort') as SortOption) || 'newest';
  const eligibilityFilter = (searchParams.get('eligibility') as EligibilityFilter) || 'all';
  const searchQuery = searchParams.get('q') || '';

  // Stats counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: applications.length,
      applied: 0,
      screening: 0,
      review: 0,
      interview: 0,
      offer: 0,
      hire: 0,
      rejected: 0,
    };
    applications.forEach((app) => {
      const stageType = app.current_stage?.stageType;
      if (stageType && counts[stageType] !== undefined) {
        counts[stageType]++;
      }
    });
    return counts;
  }, [applications]);

  // Filter and sort applications
  const filteredApplications = useMemo(() => {
    let filtered = [...applications];

    // Status filter
    if (stageFilter !== 'all') {
      filtered = filtered.filter((app) => app.current_stage?.stageType === stageFilter);
    }

    // Job filter
    if (jobFilter !== 'all') {
      filtered = filtered.filter((app) => app.job_id === jobFilter);
    }

    if (eligibilityFilter !== 'all') {
      filtered = filtered.filter((app) => app.eligibility_status === eligibilityFilter);
    }

    // Search query (search in applicant name, job title)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((app) => {
        const applicantName = getApplicantName(app.profiles).toLowerCase();
        const jobTitle = app.jobs?.title?.toLowerCase() || '';
        return applicantName.includes(query) || jobTitle.includes(query);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      // Pinned items always first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      switch (sortBy) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'ranking':
          return (b.ranking_score || 0) - (a.ranking_score || 0);
        case 'rating':
          return (b.recruiter_rating || 0) - (a.recruiter_rating || 0);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return filtered;
  }, [applications, stageFilter, jobFilter, eligibilityFilter, sortBy, searchQuery]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace(
          `${localize('/auth/login')}?redirect=${encodeURIComponent(
            localize('/dashboard/recruiter/applications')
          )}`
        );
        return;
      }

      // Fetch recruiter's jobs
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, title, company_name')
        .eq('recruiter_id', user.id)
        .order('created_at', { ascending: false });

      setJobs(jobsData || []);

      // Fetch all applications for recruiter's jobs
      const jobIds = (jobsData || []).map((j) => j.id);

      if (jobIds.length === 0) {
        setApplications([]);
        setLoading(false);
        return;
      }

      const { data: appsData } = await supabase
        .from('applications')
        .select(
          `
          id,
          job_id,
          applicant_id,
          cover_letter,
          status,
          current_stage_id,
          stage_entered_at,
          decision_status,
          eligibility_status,
          overall_stage_score,
          created_at,
          updated_at,
          resume_url,
          recruiter_rating,
          tags,
          viewed_at,
          is_pinned,
          ranking_score,
          ranking_breakdown,
          quiz_verified,
          quiz_verified_meta,
          current_stage:current_stage_id (
            id,
            stage_key,
            label,
            stage_type,
            order_index,
            is_terminal,
            allows_feedback
          ),
          jobs:job_id (
            id,
            title,
            company_name
          ),
          profiles:applicant_id (
            id,
            full_name,
            first_name,
            last_name,
            avatar_url
          )
        `
        )
        .in('job_id', jobIds)
        .neq('status', 'draft')
        .order('quiz_verified', { ascending: false })
        .order('created_at', { ascending: false });

      const normalizedApps = (appsData || []).map((app: any) => ({
        ...app,
        jobs: Array.isArray(app.jobs) ? app.jobs[0] || null : app.jobs || null,
        profiles: Array.isArray(app.profiles) ? app.profiles[0] || null : app.profiles || null,
        current_stage: Array.isArray(app.current_stage)
          ? (() => {
              const stage = app.current_stage[0] || null;
              return stage
                ? {
                    id: stage.id,
                    stageKey: stage.stage_key,
                    label: stage.label,
                    stageType: stage.stage_type,
                    orderIndex: stage.order_index,
                    isTerminal: stage.is_terminal,
                    allowsFeedback: stage.allows_feedback,
                  }
                : null;
            })()
          : app.current_stage
            ? {
                id: app.current_stage.id,
                stageKey: app.current_stage.stage_key,
                label: app.current_stage.label,
                stageType: app.current_stage.stage_type,
                orderIndex: app.current_stage.order_index,
                isTerminal: app.current_stage.is_terminal,
                allowsFeedback: app.current_stage.allows_feedback,
              }
            : null,
      }));

      setApplications(normalizedApps as Application[]);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load applications:', err);
      setLoading(false);
    }
  }, [supabase, router, localize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update URL params
  const updateFilters = useCallback(
    (params: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value && value !== 'all' && value !== 'newest' && value !== '') {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      });
      const target = newParams.toString()
        ? `${localize('/dashboard/recruiter/applications')}?${newParams.toString()}`
        : localize('/dashboard/recruiter/applications');
      router.push(target);
    },
    [router, searchParams, localize]
  );

  // Bulk status update
  const handleBulkStageUpdate = async (stageKey: string) => {
    if (selectedIds.size === 0) return;

    setBulkUpdating(true);
    try {
      const ids = Array.from(selectedIds);

      for (const id of ids) {
        await fetch(`/api/applications/${id}/stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageKey }),
        });
      }

      // Refresh data
      await loadData();
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk update failed:', err);
    } finally {
      setBulkUpdating(false);
    }
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Select all visible
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredApplications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredApplications.map((a) => a.id)));
    }
  };

  // Helper: get applicant name
  function getApplicantName(profile: Profile | null): string {
    if (!profile) return t('recruiterApplications.unknownApplicant');
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile.full_name || t('recruiterApplications.anonymousApplicant');
  }

  function buildMessageHref(app: Application) {
    const draft = buildRecruiterTemplateMessage({
      applicantName: getApplicantName(app.profiles),
      jobTitle: app.jobs?.title || t('recruiterApplications.roleFallback'),
      companyName: app.jobs?.company_name,
      purpose: 'initial_contact',
      locale,
    });

    return `${localize('/dashboard/recruiter/messages')}?partner=${encodeURIComponent(app.applicant_id)}&draft=${encodeURIComponent(draft)}`;
  }

  function getSuggestedNextStep(app: Application) {
    switch (app.current_stage?.stageType) {
      case 'interview':
        return t('recruiterApplications.nextStep.interview');
      case 'review':
      case 'offer':
        return t('recruiterApplications.nextStep.reviewOrOffer');
      case 'screening':
        return t('recruiterApplications.nextStep.screening');
      case 'hire':
        return t('recruiterApplications.nextStep.hire');
      case 'rejected':
        return t('recruiterApplications.nextStep.rejected');
      case 'applied':
      default:
        return t('recruiterApplications.nextStep.applied');
    }
  }

  async function handleQuickStageAction(
    applicationId: string,
    stageKey: string,
    reason: string
  ) {
    if (quickUpdatingId) {
      return;
    }

    setQuickUpdatingId(applicationId);
    try {
      await fetch(`/api/applications/${applicationId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageKey, reason }),
      });

      await loadData();
    } catch (error) {
      console.error('Quick stage action failed:', error);
    } finally {
      setQuickUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">{t('recruiterApplications.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('recruiterApplications.title')}</h1>
          <p className="text-gray-400 mt-1">
            {t('recruiterApplications.subtitle')}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stageOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateFilters({ stage: opt.value })}
            className={`text-left transition-all ${
              stageFilter === opt.value ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <StatsCard
              title={opt.label}
              value={stageCounts[opt.value] || 0}
              color={opt.color as 'blue' | 'green' | 'yellow' | 'red' | 'purple'}
            />
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
                <input
                type="text"
                placeholder={t('recruiterApplications.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => updateFilters({ q: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Job Filter */}
          <select
            value={jobFilter}
            onChange={(e) => updateFilters({ job: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">{t('recruiterApplications.allJobs')}</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => updateFilters({ sort: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={eligibilityFilter}
            onChange={(e) => updateFilters({ eligibility: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {eligibilityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700 flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {t('recruiterApplications.selectedCount', { count: selectedIds.size })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkStageUpdate('phone_screen')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 disabled:opacity-50"
              >
                {t('recruiterApplications.bulk.phoneScreen')}
              </button>
              <button
                onClick={() => handleBulkStageUpdate('recruiter_review')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                {t('recruiterApplications.bulk.shortlist')}
              </button>
              <button
                onClick={() => handleBulkStageUpdate('interview')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {t('recruiterApplications.bulk.interview')}
              </button>
              <button
                onClick={() => handleBulkStageUpdate('hired')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {t('recruiterApplications.bulk.hire')}
              </button>
              <button
                onClick={() => handleBulkStageUpdate('rejected')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {t('recruiterApplications.bulk.reject')}
              </button>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-sm text-gray-400 hover:text-white"
            >
              {t('recruiterApplications.clearSelection')}
            </button>
          </div>
        )}
      </div>

      {/* Applications List */}
      {filteredApplications.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
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
          <h3 className="text-xl font-semibold text-white mb-2">
            {applications.length === 0
              ? t('recruiterApplications.empty.none')
              : t('recruiterApplications.empty.noMatches')}
          </h3>
          <p className="text-gray-400 mb-6">
            {applications.length === 0
              ? t('recruiterApplications.empty.noneDescription')
              : t('recruiterApplications.empty.noMatchesDescription')}
          </p>
          {applications.length > 0 && (
            <button
              onClick={() => router.push(localize('/dashboard/recruiter/applications'))}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t('common.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-gray-700 text-sm font-medium text-gray-400">
            <div className="col-span-1 flex items-center">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredApplications.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-3">{t('recruiterApplications.table.applicant')}</div>
            <div className="col-span-3">{t('recruiterApplications.table.job')}</div>
            <div className="col-span-2">{t('recruiterApplications.table.applied')}</div>
            <div className="col-span-2">{t('recruiterApplications.table.currentStage')}</div>
            <div className="col-span-1">{t('recruiterApplications.table.actions')}</div>
          </div>

          {/* Application Rows */}
          <div className="divide-y divide-gray-700/50">
            {filteredApplications.map((app) => (
              <div
                key={app.id}
                className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-4 hover:bg-gray-700/30 transition-colors ${
                  app.is_pinned ? 'bg-yellow-900/10' : ''
                } ${!app.viewed_at ? 'bg-blue-900/10' : ''}`}
              >
                {/* Checkbox */}
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(app.id)}
                    onChange={() => toggleSelection(app.id)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {/* Applicant */}
                <div className="col-span-3 flex items-center gap-3">
                  {app.profiles?.avatar_url ? (
                    <img
                      src={app.profiles.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                      {getApplicantName(app.profiles).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-white">
                      {getApplicantName(app.profiles)}
                      {!app.viewed_at && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">
                          {t('recruiterApplications.new')}
                        </span>
                      )}
                      {app.is_pinned && (
                        <span className="ml-1 text-yellow-400">
                          <svg className="inline w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </span>
                      )}
                      {app.quiz_verified ? (
                        <span
                          title={
                            app.quiz_verified_meta?.domain
                              ? `Quiz-Verified${
                                  app.quiz_verified_meta.score != null
                                    ? ' - ' + Math.round(app.quiz_verified_meta.score) + '/100'
                                    : ''
                                } in ${app.quiz_verified_meta.domain}`
                              : 'Quiz-Verified'
                          }
                          className="ml-2 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 align-middle"
                        >
                          Quiz-Verified
                          {app.quiz_verified_meta?.score != null
                            ? ` ${Math.round(app.quiz_verified_meta.score)}`
                            : ''}
                        </span>
                      ) : null}
                    </p>
                    {app.recruiter_rating && (
                      <div className="flex mt-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg
                            key={star}
                            className={`w-3 h-3 ${
                              star <= app.recruiter_rating!
                                ? 'text-yellow-400'
                                : 'text-gray-600'
                            }`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <EligibilityBadge status={app.eligibility_status} compact />
                      {typeof app.overall_stage_score === 'number' && app.overall_stage_score > 0 && (
                        <span className="text-xs text-gray-500">
                          {t('recruiterApplications.stageScore', {
                            score: app.overall_stage_score.toFixed(1),
                          })}
                        </span>
                      )}
                      {typeof app.ranking_score === 'number' && app.ranking_score > 0 && (
                        <span className="text-xs text-gray-500">
                          {t('recruiterApplications.rankScore', {
                            score: app.ranking_score.toFixed(1),
                          })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <RankingExplanation
                        compact
                        rankingScore={app.ranking_score}
                        rankingBreakdown={app.ranking_breakdown}
                        recruiterRating={app.recruiter_rating}
                        overallStageScore={app.overall_stage_score}
                        eligibilityStatus={app.eligibility_status}
                        decisionStatus={app.decision_status}
                        currentStageType={app.current_stage?.stageType || null}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={buildMessageHref(app)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
                      >
                        {t('recruiterApplications.action.contact')}
                      </Link>
                      <button
                        onClick={() =>
                          handleQuickStageAction(
                            app.id,
                            'recruiter_review',
                            'quick_shortlist_from_recruiter_inbox'
                          )
                        }
                        disabled={Boolean(quickUpdatingId)}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {t('recruiterApplications.action.shortlist')}
                      </button>
                      <button
                        onClick={() =>
                          handleQuickStageAction(
                            app.id,
                            'interview',
                            'quick_interview_from_recruiter_inbox'
                          )
                        }
                        disabled={Boolean(quickUpdatingId)}
                        className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        {t('recruiterApplications.action.interview')}
                      </button>
                      <button
                        onClick={() =>
                          handleQuickStageAction(
                            app.id,
                            'rejected',
                            'quick_reject_from_recruiter_inbox'
                          )
                        }
                        disabled={Boolean(quickUpdatingId)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {t('recruiterApplications.action.reject')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Job */}
                <div className="col-span-3 flex items-center">
                  <div>
                    <p className="text-white">{app.jobs?.title || t('recruiterApplications.unknownJob')}</p>
                    {app.jobs?.company_name && (
                      <p className="text-sm text-gray-400">{app.jobs.company_name}</p>
                    )}
                  </div>
                </div>

                {/* Applied Date */}
                <div className="col-span-2 flex items-center text-gray-400">
                  {formatLocalizedDate(app.created_at, locale) || app.created_at}
                </div>

                {/* Current Stage */}
                <div className="col-span-2 flex items-center">
                  <div>
                    <StageBadge
                      label={app.current_stage?.label || t('recruiterApplications.unassigned')}
                      stageType={app.current_stage?.stageType || 'applied'}
                    />
                    <div className="mt-2">
                      <EligibilityBadge status={app.eligibility_status} compact />
                    </div>
                    {app.stage_entered_at && (
                      <p className="mt-1 text-xs text-gray-500">
                        {t('recruiterApplications.sinceDate', {
                          date: formatLocalizedDate(app.stage_entered_at, locale) || app.stage_entered_at,
                        })}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      {getSuggestedNextStep(app)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center">
                  <Link
                    href={localize(`/dashboard/recruiter/applications/${app.id}`)}
                    className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    {t('common.view')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
