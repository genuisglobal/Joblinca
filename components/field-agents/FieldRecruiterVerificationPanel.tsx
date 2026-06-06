'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AttributedRecruiterForOfficer } from '@/lib/recruiter-verifications/service';

type VerificationFormState = {
  recruiterUserId: string;
  companyNameSnapshot: string;
  officeLocation: string;
  employerReference: string;
  fieldVisitNotes: string;
  fieldOfficerRecommendation: 'approve' | 'needs_review' | 'reject';
};

const INITIAL_FORM: VerificationFormState = {
  recruiterUserId: '',
  companyNameSnapshot: '',
  officeLocation: '',
  employerReference: '',
  fieldVisitNotes: '',
  fieldOfficerRecommendation: 'needs_review',
};

function formatDate(value: string | null, locale: string) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getSubmissionSourceLabel(
  value: AttributedRecruiterForOfficer['latestSubmissionSource']
) {
  if (value === 'field_agent') {
    return 'field intake';
  }
  if (value === 'self_service') {
    return 'self-service';
  }
  return 'none yet';
}

export default function FieldRecruiterVerificationPanel({
  recruiters,
  locale,
  isActive,
}: {
  recruiters: AttributedRecruiterForOfficer[];
  locale: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<VerificationFormState>(INITIAL_FORM);
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [businessRegistration, setBusinessRegistration] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function updateForm<K extends keyof VerificationFormState>(
    key: K,
    value: VerificationFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyRecruiterSelection(recruiterUserId: string) {
    const recruiter = recruiters.find((item) => item.userId === recruiterUserId);
    if (!recruiter) {
      setForm(INITIAL_FORM);
      return;
    }

    setForm((current) => ({
      ...current,
      recruiterUserId: recruiter.userId,
      companyNameSnapshot: recruiter.companyName || current.companyNameSnapshot,
      employerReference:
        recruiter.contactEmail || recruiter.email || current.employerReference,
    }));
  }

  async function submitVerification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !isActive) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const payload = new FormData();
      payload.append('recruiterUserId', form.recruiterUserId);
      payload.append('companyNameSnapshot', form.companyNameSnapshot);
      payload.append('officeLocation', form.officeLocation);
      payload.append('employerReference', form.employerReference);
      payload.append('fieldVisitNotes', form.fieldVisitNotes);
      payload.append('fieldOfficerRecommendation', form.fieldOfficerRecommendation);
      if (idDocument) {
        payload.append('idDocument', idDocument);
      }
      if (selfie) {
        payload.append('selfie', selfie);
      }
      if (businessRegistration) {
        payload.append('businessRegistration', businessRegistration);
      }

      const response = await fetch('/api/field-agent/recruiter-verifications', {
        method: 'POST',
        body: payload,
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to submit recruiter verification intake');
      }

      setMessage(
        'Recruiter verification intake submitted. Operations can review it now.'
      );
      setForm(INITIAL_FORM);
      setIdDocument(null);
      setSelfie(null);
      setBusinessRegistration(null);
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to submit recruiter verification intake'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">
          Recruiter verification intake
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Capture recruiter documents in the field and send the case into the same
          admin verification queue.
        </p>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[0.94fr,1.06fr]">
        <div className="space-y-5">
          {!isActive && (
            <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
              This field agent account is inactive. Verification intake is disabled.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          )}

          <form onSubmit={submitVerification} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">
                Recruiter account
              </span>
              <select
                value={form.recruiterUserId}
                onChange={(event) => applyRecruiterSelection(event.target.value)}
                required
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select an attributed recruiter</option>
                {recruiters.map((recruiter) => (
                  <option key={recruiter.userId} value={recruiter.userId}>
                    {recruiter.fullName} — {recruiter.companyName || 'No company'}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Company name</span>
              <input
                type="text"
                value={form.companyNameSnapshot}
                onChange={(event) => updateForm('companyNameSnapshot', event.target.value)}
                required
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">Office location</span>
                <input
                  type="text"
                  value={form.officeLocation}
                  onChange={(event) => updateForm('officeLocation', event.target.value)}
                  disabled={!isActive}
                  placeholder="Douala, Akwa..."
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">
                  Employer reference
                </span>
                <input
                  type="text"
                  value={form.employerReference}
                  onChange={(event) => updateForm('employerReference', event.target.value)}
                  disabled={!isActive}
                  placeholder="Website, LinkedIn, or contact"
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">
                Officer recommendation
              </span>
              <select
                value={form.fieldOfficerRecommendation}
                onChange={(event) =>
                  updateForm(
                    'fieldOfficerRecommendation',
                    event.target.value as VerificationFormState['fieldOfficerRecommendation']
                  )
                }
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="approve">Recommend approval</option>
                <option value="needs_review">Needs review</option>
                <option value="reject">Flag concerns</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">
                Visit notes
              </span>
              <textarea
                value={form.fieldVisitNotes}
                onChange={(event) => updateForm('fieldVisitNotes', event.target.value)}
                rows={4}
                disabled={!isActive}
                placeholder="What did you confirm on-site? Any issues or red flags?"
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <FilePicker
              label="ID document"
              accept="image/*,.pdf"
              file={idDocument}
              onChange={setIdDocument}
              disabled={!isActive}
              required
              helper="PDF, PNG, or JPG up to 5MB."
            />

            <FilePicker
              label="Selfie with ID"
              accept="image/*"
              file={selfie}
              onChange={setSelfie}
              disabled={!isActive}
              required
              helper="Clear photo of the recruiter holding the ID."
            />

            <FilePicker
              label="Business registration document"
              accept="image/*,.pdf"
              file={businessRegistration}
              onChange={setBusinessRegistration}
              disabled={!isActive}
              helper="Optional supporting company document."
            />

            <button
              type="submit"
              disabled={submitting || !isActive || !form.recruiterUserId}
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting intake...' : 'Submit verification intake'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h3 className="text-base font-semibold text-white">
              Attributed recruiters
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Only recruiters registered through this officer can be submitted here.
            </p>
          </div>

          {recruiters.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">
              No attributed recruiter accounts yet. The recruiter needs to complete
              signup first.
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {recruiters.map((recruiter) => (
                <div
                  key={recruiter.userId}
                  className="grid gap-4 px-5 py-5 xl:grid-cols-[1.1fr,0.9fr]"
                >
                  <div>
                    <h4 className="text-base font-semibold text-white">
                      {recruiter.fullName}
                    </h4>
                    <p className="mt-1 text-sm text-gray-300">
                      {recruiter.companyName || 'No company name yet'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {recruiter.email || recruiter.contactEmail || recruiter.phone || 'No contact'}
                    </p>
                  </div>

                  <div className="space-y-2 text-sm text-gray-400">
                    <p>Attribution: {formatDate(recruiter.attributedAt, locale)}</p>
                    <p>Profile status: {recruiter.verificationStatus}</p>
                    <p>
                      Latest intake: {recruiter.latestVerificationStatus || 'none'} •{' '}
                      {getSubmissionSourceLabel(recruiter.latestSubmissionSource)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FilePicker({
  label,
  accept,
  file,
  onChange,
  disabled,
  helper,
  required = false,
}: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled: boolean;
  helper: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-300">
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        className="block w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p className="mt-2 text-xs text-gray-500">
        {file ? file.name : helper}
      </p>
    </label>
  );
}
