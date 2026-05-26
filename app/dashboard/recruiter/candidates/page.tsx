'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StatsCard from '@/app/dashboard/components/StatsCard';

type CandidateRole = 'job_seeker' | 'talent';
type DirectorySort = 'best' | 'recent' | 'name';

interface QuizSignal {
  domain: string | null;
  bestScore: number;
  challengeTitle: string | null;
  earnedAt: string;
}

interface CandidateCardRecord {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: CandidateRole;
  updatedAt: string | null;
  headline: string | null;
  location: string | null;
  locationInterests: string[];
  fieldOfStudy: string | null;
  schoolName: string | null;
  graduationYear: number | null;
  skills: Array<{ name: string; rating: number | null }>;
  hasResume: boolean;
  hasPortfolio: boolean;
  profileStrength: number;
  quizSignal: QuizSignal | null;
}

const QUIZ_DOMAIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Any domain' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'admin_assistant', label: 'Admin Assistant' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'customer_service', label: 'Customer Service' },
  { value: 'field_officer', label: 'Field Officer' },
];

const QUIZ_RECENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Any time' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

interface CandidateDirectoryResponse {
  candidates: CandidateCardRecord[];
  total: number;
  limit: number;
  offset: number;
  counts: {
    all: number;
    job_seeker: number;
    talent: number;
    with_resume: number;
  };
}

function getFirstName(name: string) {
  const compact = name.trim();
  return compact ? compact.split(/\s+/)[0] || 'there' : 'there';
}

function buildOutreachDraft(candidate: CandidateCardRecord) {
  const firstName = getFirstName(candidate.fullName);
  const roleLabel = candidate.role === 'talent' ? 'profile' : 'background';
  return `Hi ${firstName}, I came across your ${roleLabel} on JobLinca and would like to discuss a role that may match your experience. If you are open to hearing more, reply here and I will share the details.`;
}

function formatRoleLabel(role: CandidateRole) {
  return role === 'talent' ? 'Talent' : 'Job Seeker';
}

function updateQueryParams(
  searchParams: { toString(): string },
  nextValues: Record<string, string>,
  router: ReturnType<typeof useRouter>
) {
  const params = new URLSearchParams(searchParams.toString());

  Object.entries(nextValues).forEach(([key, value]) => {
    if (!value || value === 'all' || value === 'best' || value === '0') {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  const query = params.toString();
  router.push(query ? `/dashboard/recruiter/candidates?${query}` : '/dashboard/recruiter/candidates');
}

export default function RecruiterCandidatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramsSignature = searchParams.toString();

  const roleFilter =
    searchParams.get('role') === 'job_seeker' || searchParams.get('role') === 'talent'
      ? (searchParams.get('role') as CandidateRole)
      : 'all';
  const sort =
    searchParams.get('sort') === 'recent' || searchParams.get('sort') === 'name'
      ? (searchParams.get('sort') as DirectorySort)
      : 'best';
  const hasResumeOnly = searchParams.get('has_resume') === '1';
  const currentOffset = Math.max(Number.parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
  const quizVerifiedOnly = searchParams.get('quiz_verified') === '1';
  const challengeDomain = searchParams.get('challenge_domain') || '';
  const challengeScoreMin = Math.max(
    0,
    Math.min(100, Number.parseInt(searchParams.get('challenge_score_min') || '0', 10) || 0)
  );
  const challengeSinceDays = searchParams.get('challenge_since_days') || '0';

  const [searchDraft, setSearchDraft] = useState(searchParams.get('q') || '');
  const [locationDraft, setLocationDraft] = useState(searchParams.get('location') || '');
  const [skillDraft, setSkillDraft] = useState(searchParams.get('skill') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CandidateDirectoryResponse | null>(null);

  useEffect(() => {
    setSearchDraft(searchParams.get('q') || '');
    setLocationDraft(searchParams.get('location') || '');
    setSkillDraft(searchParams.get('skill') || '');
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;

    async function loadCandidates() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/recruiter/candidates?${paramsSignature}`, {
          cache: 'no-store',
        });
        const responseBody = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(responseBody?.error || 'Failed to load candidate directory');
        }

        if (!mounted) {
          return;
        }

        setPayload(responseBody as CandidateDirectoryResponse);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setPayload(null);
        setError(
          loadError instanceof Error ? loadError.message : 'Failed to load candidate directory'
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadCandidates();

    return () => {
      mounted = false;
    };
  }, [paramsSignature]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateQueryParams(
      searchParams,
      {
        q: searchDraft.trim(),
        location: locationDraft.trim(),
        skill: skillDraft.trim(),
        offset: '0',
      },
      router
    );
  }

  function clearFilters() {
    setSearchDraft('');
    setLocationDraft('');
    setSkillDraft('');
    router.push('/dashboard/recruiter/candidates');
  }

  function movePage(direction: 'prev' | 'next') {
    const nextOffset =
      direction === 'prev'
        ? Math.max(currentOffset - (payload?.limit || 24), 0)
        : currentOffset + (payload?.limit || 24);

    updateQueryParams(
      searchParams,
      {
        offset: String(nextOffset),
      },
      router
    );
  }

  const pageStart = payload ? currentOffset + 1 : 0;
  const pageEnd = payload ? Math.min(currentOffset + payload.candidates.length, payload.total) : 0;
  const hasActiveFilters =
    Boolean(searchParams.get('q')) ||
    Boolean(searchParams.get('location')) ||
    Boolean(searchParams.get('skill')) ||
    hasResumeOnly ||
    roleFilter !== 'all' ||
    sort !== 'best' ||
    quizVerifiedOnly ||
    challengeDomain.length > 0 ||
    challengeScoreMin > 0 ||
    challengeSinceDays !== '0';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading candidate directory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Candidate Search</h1>
          <p className="mt-1 text-gray-400">
            Filter job seekers and talent profiles, then start outreach inside JobLinca.
          </p>
        </div>
        <div className="rounded-lg border border-blue-700/40 bg-blue-900/20 px-4 py-3 text-sm text-blue-100">
          Contact starts in the JobLinca inbox. Direct phone and email stay off this sourcing screen for now.
        </div>
      </div>

      {payload && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => updateQueryParams(searchParams, { role: 'all', offset: '0' }, router)}
            className={`text-left transition-all ${roleFilter === 'all' ? 'ring-2 ring-blue-500 rounded-xl' : ''}`}
          >
            <StatsCard
              title="All Matches"
              value={payload.counts.all}
              color="blue"
              description="Profiles matching your active filters"
            />
          </button>
          <button
            type="button"
            onClick={() =>
              updateQueryParams(searchParams, { role: 'job_seeker', offset: '0' }, router)
            }
            className={`text-left transition-all ${roleFilter === 'job_seeker' ? 'ring-2 ring-blue-500 rounded-xl' : ''}`}
          >
            <StatsCard
              title="Job Seekers"
              value={payload.counts.job_seeker}
              color="green"
              description="Local and role-ready candidate profiles"
            />
          </button>
          <button
            type="button"
            onClick={() =>
              updateQueryParams(searchParams, { role: 'talent', offset: '0' }, router)
            }
            className={`text-left transition-all ${roleFilter === 'talent' ? 'ring-2 ring-blue-500 rounded-xl' : ''}`}
          >
            <StatsCard
              title="Talent"
              value={payload.counts.talent}
              color="purple"
              description="Skills-forward internship and portfolio profiles"
            />
          </button>
          <button
            type="button"
            onClick={() =>
              updateQueryParams(
                searchParams,
                { has_resume: hasResumeOnly ? '0' : '1', offset: '0' },
                router
              )
            }
            className={`text-left transition-all ${hasResumeOnly ? 'ring-2 ring-blue-500 rounded-xl' : ''}`}
          >
            <StatsCard
              title="Resume Ready"
              value={payload.counts.with_resume}
              color="yellow"
              description="Profiles with a resume already on file"
            />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Search
            </label>
            <input
              type="text"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Name, headline, field of study"
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="xl:col-span-3">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Location
            </label>
            <input
              type="text"
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              placeholder="Douala, Yaounde, Remote"
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="xl:col-span-3">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Skill
            </label>
            <input
              type="text"
              value={skillDraft}
              onChange={(event) => setSkillDraft(event.target.value)}
              placeholder="Excel, React, UI Design"
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Sort
            </label>
            <select
              value={sort}
              onChange={(event) =>
                updateQueryParams(searchParams, { sort: event.target.value, offset: '0' }, router)
              }
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="best">Best profiles</option>
              <option value="recent">Recently updated</option>
              <option value="name">Alphabetical</option>
            </select>
          </div>
          <div className="xl:col-span-12 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Search candidates
            </button>
            <label className="inline-flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={hasResumeOnly}
                onChange={(event) =>
                  updateQueryParams(
                    searchParams,
                    { has_resume: event.target.checked ? '1' : '0', offset: '0' },
                    router
                  )
                }
                className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
              />
              Resume ready only
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-gray-600 px-4 py-2.5 text-sm text-gray-300 hover:text-white"
              >
                Clear filters
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-amber-700/30 bg-amber-900/10 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-amber-100">Quiz-verified candidates</h2>
            <p className="mt-1 text-xs text-amber-200/70">
              Filter to talents who have scored on weekly skill challenges. The score on
              the card is their best result in the selected domain.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-amber-100">
            <input
              type="checkbox"
              checked={quizVerifiedOnly}
              onChange={(event) =>
                updateQueryParams(
                  searchParams,
                  { quiz_verified: event.target.checked ? '1' : '0', offset: '0' },
                  router
                )
              }
              className="h-4 w-4 rounded border-amber-400 bg-gray-700 text-amber-500 focus:ring-amber-500"
            />
            Quiz-verified only
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-amber-100">Domain</label>
            <select
              value={challengeDomain}
              onChange={(event) =>
                updateQueryParams(
                  searchParams,
                  { challenge_domain: event.target.value, offset: '0' },
                  router
                )
              }
              className="w-full rounded-lg border border-amber-500/30 bg-gray-900/60 px-3 py-2 text-sm text-amber-50 focus:border-amber-400 focus:outline-none"
            >
              {QUIZ_DOMAIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-medium text-amber-100">
              <span>Minimum score</span>
              <span className="text-amber-200/80">{challengeScoreMin}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={challengeScoreMin}
              onChange={(event) =>
                updateQueryParams(
                  searchParams,
                  { challenge_score_min: event.target.value, offset: '0' },
                  router
                )
              }
              className="w-full accent-amber-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-amber-100">Recency</label>
            <select
              value={challengeSinceDays}
              onChange={(event) =>
                updateQueryParams(
                  searchParams,
                  { challenge_since_days: event.target.value, offset: '0' },
                  router
                )
              }
              className="w-full rounded-lg border border-amber-500/30 bg-gray-900/60 px-3 py-2 text-sm text-amber-50 focus:border-amber-400 focus:outline-none"
            >
              {QUIZ_RECENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-700/40 bg-red-900/20 p-6">
          <h2 className="text-lg font-semibold text-red-100">Candidate search unavailable</h2>
          <p className="mt-2 text-sm text-red-200">{error}</p>
          {error.toLowerCase().includes('subscription') && (
            <div className="mt-4">
              <Link
                href="/dashboard/subscription"
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Activate recruiter plan
              </Link>
            </div>
          )}
        </div>
      ) : payload && payload.candidates.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-700">
            <svg className="h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white">
            {hasActiveFilters ? 'No candidates match these filters' : 'No candidate profiles available yet'}
          </h3>
          <p className="mt-2 text-gray-400">
            {hasActiveFilters
              ? 'Try broadening your search, removing the skill filter, or turning off resume-only mode.'
              : 'Candidate profiles will appear here once job seekers and talent complete their profiles.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Reset filters
            </button>
          )}
        </div>
      ) : payload ? (
        <>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-gray-400">
              Showing {pageStart}-{pageEnd} of {payload.total} candidate profiles
            </p>
            <p className="text-sm text-gray-500">
              Best fit is ranked by profile completeness, resume readiness, and structured skills.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {payload.candidates.map((candidate) => {
              const draft = buildOutreachDraft(candidate);
              const primaryContext =
                candidate.role === 'job_seeker'
                  ? candidate.headline || 'Job seeker profile'
                  : candidate.fieldOfStudy || candidate.headline || 'Talent profile';
              const locationTags = candidate.locationInterests.slice(0, 3);
              const skillTags = candidate.skills.slice(0, 4);

              return (
                <div
                  key={candidate.id}
                  className="rounded-xl border border-gray-700 bg-gray-800 p-5"
                >
                  <div className="flex items-start gap-4">
                    {candidate.avatarUrl ? (
                      <Image
                        src={candidate.avatarUrl}
                        alt={candidate.fullName}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-semibold text-white">
                        {candidate.fullName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold text-white">
                          {candidate.fullName}
                        </h2>
                        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-100">
                          {formatRoleLabel(candidate.role)}
                        </span>
                        <span className="rounded-full border border-gray-600 px-2.5 py-1 text-xs text-gray-300">
                          Profile {candidate.profileStrength}/10
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-300">{primaryContext}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        {candidate.location && <span>{candidate.location}</span>}
                        {candidate.schoolName && <span>{candidate.schoolName}</span>}
                        {candidate.graduationYear && <span>Class of {candidate.graduationYear}</span>}
                        {candidate.updatedAt && (
                          <span>Updated {new Date(candidate.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {candidate.hasResume && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-100">
                        Resume ready
                      </span>
                    )}
                    {candidate.hasPortfolio && (
                      <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-100">
                        Portfolio ready
                      </span>
                    )}
                    {candidate.quizSignal ? (
                      <span
                        title={
                          candidate.quizSignal.challengeTitle
                            ? `${candidate.quizSignal.challengeTitle} - ${new Date(candidate.quizSignal.earnedAt).toLocaleDateString()}`
                            : new Date(candidate.quizSignal.earnedAt).toLocaleDateString()
                        }
                        className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-100"
                      >
                        Quiz-Verified
                        {candidate.quizSignal.domain ? ` - ${candidate.quizSignal.domain}` : ''}
                        {' '}
                        {Math.round(candidate.quizSignal.bestScore)}/100
                      </span>
                    ) : null}
                    {locationTags.map((interest) => (
                      <span
                        key={`${candidate.id}-location-${interest}`}
                        className="rounded-full border border-gray-600 px-2.5 py-1 text-xs text-gray-300"
                      >
                        {interest}
                      </span>
                    ))}
                    {skillTags.map((skill) => (
                      <span
                        key={`${candidate.id}-skill-${skill.name}`}
                        className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100"
                      >
                        {skill.name}
                        {typeof skill.rating === 'number' ? ` ${skill.rating}/5` : ''}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/dashboard/recruiter/candidates/${encodeURIComponent(candidate.id)}`}
                      className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:text-white"
                    >
                      View profile
                    </Link>
                    <Link
                      href={`/dashboard/recruiter/messages?partner=${encodeURIComponent(candidate.id)}&draft=${encodeURIComponent(draft)}&source=candidate_search`}
                      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                    >
                      Message candidate
                    </Link>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(draft)}
                      className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:text-white"
                    >
                      Copy intro
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 px-5 py-4">
            <button
              type="button"
              onClick={() => movePage('prev')}
              disabled={currentOffset === 0}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50"
            >
              Previous
            </button>
            <p className="text-sm text-gray-400">
              Page {Math.floor(currentOffset / payload.limit) + 1}
            </p>
            <button
              type="button"
              onClick={() => movePage('next')}
              disabled={currentOffset + payload.limit >= payload.total}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
