'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type CandidateRole = 'job_seeker' | 'talent';

interface CandidateDetailRecord {
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
  internshipEligible: boolean | null;
  skills: Array<{ name: string; rating: number | null }>;
  hasResume: boolean;
  resumeUrl: string | null;
  hasPortfolio: boolean;
  portfolioUrl: string | null;
  careerSummary: string;
  profileStrength: number;
}

interface CandidateDetailResponse {
  candidate: CandidateDetailRecord;
  outreach: {
    trackingAvailable: boolean;
    total: number;
    lastContactedAt: string | null;
    bySource: {
      candidate_search: number;
      candidate_detail: number;
    };
  };
}

function getFirstName(name: string) {
  const compact = name.trim();
  return compact ? compact.split(/\s+/)[0] || 'there' : 'there';
}

function buildOutreachDraft(candidate: CandidateDetailRecord) {
  const firstName = getFirstName(candidate.fullName);
  const roleLabel = candidate.role === 'talent' ? 'profile' : 'background';
  return `Hi ${firstName}, I came across your ${roleLabel} on JobLinca and would like to discuss a role that may match your experience. If you are open to hearing more, reply here and I will share the details.`;
}

function formatRoleLabel(role: CandidateRole) {
  return role === 'talent' ? 'Talent' : 'Job Seeker';
}

function formatDate(dateString: string | null) {
  if (!dateString) {
    return 'Not available';
  }

  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RecruiterCandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const candidateId = typeof params?.id === 'string' ? params.id : '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CandidateDetailResponse | null>(null);

  useEffect(() => {
    if (!candidateId) {
      setLoading(false);
      setError('Candidate id is missing.');
      return;
    }

    let mounted = true;

    async function loadCandidate() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/recruiter/candidates/${candidateId}`, {
          cache: 'no-store',
        });
        const responseBody = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(responseBody?.error || 'Failed to load candidate profile');
        }

        if (!mounted) {
          return;
        }

        setPayload(responseBody as CandidateDetailResponse);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setPayload(null);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load candidate profile');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadCandidate();

    return () => {
      mounted = false;
    };
  }, [candidateId]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading candidate profile...</p>
        </div>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/recruiter/candidates"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          Back to candidate search
        </Link>
        <div className="rounded-xl border border-red-700/40 bg-red-900/20 p-6">
          <h1 className="text-xl font-semibold text-red-100">Candidate profile unavailable</h1>
          <p className="mt-2 text-sm text-red-200">{error || 'Unable to load candidate profile.'}</p>
          {error?.toLowerCase().includes('subscription') && (
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
      </div>
    );
  }

  const { candidate, outreach } = payload;
  const draft = buildOutreachDraft(candidate);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/recruiter/candidates"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
      >
        Back to candidate search
      </Link>

      <section className="rounded-2xl border border-gray-700 bg-gray-800 p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            {candidate.avatarUrl ? (
              <Image
                src={candidate.avatarUrl}
                alt={candidate.fullName}
                width={88}
                height={88}
                className="h-[5.5rem] w-[5.5rem] rounded-full object-cover"
              />
            ) : (
              <div className="flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-full bg-blue-600 text-3xl font-semibold text-white">
                {candidate.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{candidate.fullName}</h1>
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-100">
                  {formatRoleLabel(candidate.role)}
                </span>
                <span className="rounded-full border border-gray-600 px-2.5 py-1 text-xs text-gray-300">
                  Profile {candidate.profileStrength}/10
                </span>
              </div>
              <p className="mt-2 text-base text-gray-200">
                {candidate.role === 'job_seeker'
                  ? candidate.headline || 'Job seeker profile'
                  : candidate.fieldOfStudy || candidate.headline || 'Talent profile'}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-400">
                {candidate.location && <span>{candidate.location}</span>}
                {candidate.schoolName && <span>{candidate.schoolName}</span>}
                {candidate.graduationYear && <span>Class of {candidate.graduationYear}</span>}
                <span>Updated {formatDate(candidate.updatedAt)}</span>
              </div>
              <p className="mt-4 max-w-3xl text-sm text-gray-300">
                Contact begins in the JobLinca inbox. Personal phone and email stay hidden here until the candidate responds or explicitly opts in.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:max-w-sm xl:justify-end">
            <Link
              href={`/dashboard/recruiter/messages?partner=${encodeURIComponent(candidate.id)}&draft=${encodeURIComponent(draft)}&source=candidate_detail`}
              className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              Message candidate
            </Link>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(draft)}
              className="rounded-lg border border-gray-600 px-4 py-2.5 text-sm text-gray-300 hover:text-white"
            >
              Copy intro
            </button>
            {candidate.resumeUrl && (
              <a
                href={candidate.resumeUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 hover:border-emerald-400/40"
              >
                Open resume
              </a>
            )}
            {candidate.portfolioUrl && (
              <a
                href={candidate.portfolioUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-sm font-medium text-purple-100 hover:border-purple-400/40"
              >
                Open portfolio
              </a>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-700 bg-gray-800 p-5 xl:col-span-2">
          <h2 className="text-lg font-semibold text-white">Profile summary</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Location</p>
              <p className="mt-2 text-sm text-gray-200">{candidate.location || 'Not specified'}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Resume</p>
              <p className="mt-2 text-sm text-gray-200">
                {candidate.hasResume ? 'Resume on file' : 'No resume uploaded yet'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Portfolio</p>
              <p className="mt-2 text-sm text-gray-200">
                {candidate.hasPortfolio ? 'Portfolio available' : 'No portfolio linked'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Availability lane</p>
              <p className="mt-2 text-sm text-gray-200">
                {candidate.role === 'talent'
                  ? candidate.internshipEligible === false
                    ? 'Talent profile'
                    : 'Talent / internship-ready profile'
                  : 'Experienced job seeker profile'}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs uppercase tracking-wide text-gray-500">Location interests</p>
            {candidate.locationInterests.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {candidate.locationInterests.map((interest) => (
                  <span
                    key={`${candidate.id}-interest-${interest}`}
                    className="rounded-full border border-gray-600 px-2.5 py-1 text-xs text-gray-300"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-400">No preferred locations listed yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h2 className="text-lg font-semibold text-white">Outreach history</h2>
          {!outreach.trackingAvailable ? (
            <p className="mt-4 text-sm text-gray-400">
              Outreach history will appear here after the recruiter sourcing tracking migration is applied.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Total outreach</p>
                <p className="mt-2 text-2xl font-semibold text-white">{outreach.total}</p>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Last contacted</p>
                <p className="mt-2 text-sm text-gray-200">{formatDate(outreach.lastContactedAt)}</p>
              </div>
              <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Sources</p>
                <div className="mt-3 space-y-2 text-sm text-gray-200">
                  <p>Candidate search: {outreach.bySource.candidate_search}</p>
                  <p>Candidate profile: {outreach.bySource.candidate_detail}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h2 className="text-lg font-semibold text-white">
            {candidate.role === 'job_seeker' ? 'Career summary' : 'Education and fit'}
          </h2>
          {candidate.role === 'job_seeker' ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-300">
              {candidate.careerSummary || 'No career summary has been added yet.'}
            </p>
          ) : (
            <div className="mt-4 space-y-4 text-sm text-gray-300">
              <p>
                Field of study: {candidate.fieldOfStudy || 'Not specified'}
              </p>
              <p>
                School: {candidate.schoolName || 'Not specified'}
              </p>
              <p>
                Graduation year: {candidate.graduationYear || 'Not specified'}
              </p>
              <p>
                Internship eligible: {candidate.internshipEligible === false ? 'No' : 'Yes or not specified'}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h2 className="text-lg font-semibold text-white">Skills</h2>
          {candidate.skills.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {candidate.skills.map((skill) => (
                <span
                  key={`${candidate.id}-skill-${skill.name}`}
                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-100"
                >
                  {skill.name}
                  {typeof skill.rating === 'number' ? ` ${skill.rating}/5` : ''}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              No structured skills have been added yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
