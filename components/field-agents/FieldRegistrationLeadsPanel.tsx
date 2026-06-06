'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CopyTextButton from '@/components/field-agents/CopyTextButton';
import type { RegistrationLeadListItem } from '@/lib/field-registration/types';

const INITIAL_FORM = {
  fullName: '',
  phone: '',
  intendedRole: 'job_seeker',
  captureMode: 'quick_capture',
  email: '',
  notes: '',
  consentWhatsapp: false,
} as const;

type LeadFormState = {
  fullName: string;
  phone: string;
  intendedRole: 'job_seeker' | 'talent' | 'recruiter';
  captureMode: 'quick_capture' | 'assisted_signup';
  email: string;
  notes: string;
  consentWhatsapp: boolean;
};

function getRoleLabel(role: RegistrationLeadListItem['intended_role'] | LeadFormState['intendedRole']) {
  switch (role) {
    case 'job_seeker':
      return 'Job seeker';
    case 'talent':
      return 'Talent';
    case 'recruiter':
      return 'Recruiter';
    default:
      return 'Account';
  }
}

function getCaptureModeLabel(mode: RegistrationLeadListItem['capture_mode'] | LeadFormState['captureMode']) {
  return mode === 'assisted_signup' ? 'Assisted signup' : 'Quick capture';
}

function getStatusClasses(status: RegistrationLeadListItem['status']) {
  switch (status) {
    case 'completed':
      return 'border-emerald-700 bg-emerald-900/30 text-emerald-200';
    case 'invite_sent':
    case 'opened':
      return 'border-blue-700 bg-blue-900/30 text-blue-200';
    case 'duplicate_existing_user':
      return 'border-yellow-700 bg-yellow-900/30 text-yellow-100';
    case 'cancelled':
    case 'expired':
      return 'border-gray-700 bg-gray-800 text-gray-300';
    case 'opted_out':
      return 'border-orange-700 bg-orange-900/30 text-orange-100';
    default:
      return 'border-neutral-700 bg-neutral-800 text-neutral-200';
  }
}

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

export default function FieldRegistrationLeadsPanel({
  initialLeads,
  locale,
  isActive,
}: {
  initialLeads: RegistrationLeadListItem[];
  locale: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<LeadFormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [actionLeadId, setActionLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [latestClaimUrl, setLatestClaimUrl] = useState<string | null>(null);

  function updateForm<K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitLead(sendInvite: boolean) {
    if (submitting || !isActive) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    setLatestClaimUrl(null);

    try {
      const response = await fetch('/api/field-agent/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          sendInvite,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save registration lead');
      }

      setMessage(
        payload?.warning ||
          (sendInvite
            ? 'Lead saved and invite queued for WhatsApp delivery.'
            : 'Lead saved successfully.')
      );
      if (payload?.claimUrl) {
        setLatestClaimUrl(String(payload.claimUrl));
      }
      setForm(INITIAL_FORM);
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to save registration lead'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function resendInvite(leadId: string) {
    if (actionLeadId || !isActive) {
      return;
    }

    setActionLeadId(leadId);
    setError(null);
    setMessage(null);
    setLatestClaimUrl(null);

    try {
      const response = await fetch(`/api/field-agent/leads/${leadId}/invite`, {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to resend registration invite');
      }

      setMessage('Fresh registration invite sent.');
      if (payload?.claimUrl) {
        setLatestClaimUrl(String(payload.claimUrl));
      }
      router.refresh();
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : 'Failed to resend registration invite'
      );
    } finally {
      setActionLeadId(null);
    }
  }

  async function cancelLead(leadId: string) {
    if (actionLeadId || !isActive) {
      return;
    }

    setActionLeadId(leadId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/field-agent/leads/${leadId}/cancel`, {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to cancel registration lead');
      }

      setMessage('Lead cancelled.');
      router.refresh();
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Failed to cancel registration lead'
      );
    } finally {
      setActionLeadId(null);
    }
  }

  async function optOutLead(leadId: string) {
    if (actionLeadId || !isActive) {
      return;
    }

    setActionLeadId(leadId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/field-agent/leads/${leadId}/opt-out`, {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to mark lead as opted out');
      }

      setMessage('Lead marked as opted out.');
      router.refresh();
    } catch (optOutError) {
      setError(
        optOutError instanceof Error
          ? optOutError.message
          : 'Failed to mark lead as opted out'
      );
    } finally {
      setActionLeadId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">Field registration leads</h2>
        <p className="mt-1 text-sm text-gray-400">
          Capture busy contacts now, then send them a WhatsApp link to finish their
          account later.
        </p>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[0.92fr,1.08fr]">
        <div className="space-y-5">
          {!isActive && (
            <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
              This field agent account is inactive. Lead capture and invite actions are
              disabled.
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

          {latestClaimUrl && (
            <div className="rounded-xl border border-blue-700 bg-blue-950/20 p-4">
              <p className="text-sm font-medium text-blue-200">Latest completion link</p>
              <p className="mt-2 break-all text-sm text-blue-100">{latestClaimUrl}</p>
              <div className="mt-3">
                <CopyTextButton value={latestClaimUrl} label="Copy link" copiedLabel="Copied" />
              </div>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitLead(false);
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Full name</span>
              <input
                type="text"
                value={form.fullName}
                onChange={(event) => updateForm('fullName', event.target.value)}
                required
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">WhatsApp number</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => updateForm('phone', event.target.value)}
                required
                disabled={!isActive}
                placeholder="+237 6xx xxx xxx"
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">Account type</span>
                <select
                  value={form.intendedRole}
                  onChange={(event) =>
                    updateForm('intendedRole', event.target.value as LeadFormState['intendedRole'])
                  }
                  disabled={!isActive}
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="job_seeker">Job seeker</option>
                  <option value="talent">Talent</option>
                  <option value="recruiter">Recruiter</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">Capture mode</span>
                <select
                  value={form.captureMode}
                  onChange={(event) =>
                    updateForm('captureMode', event.target.value as LeadFormState['captureMode'])
                  }
                  disabled={!isActive}
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="quick_capture">Quick capture</option>
                  <option value="assisted_signup">Assisted signup</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Email (optional)</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                rows={4}
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-900/80 px-4 py-3">
              <input
                type="checkbox"
                checked={form.consentWhatsapp}
                onChange={(event) => updateForm('consentWhatsapp', event.target.checked)}
                disabled={!isActive}
                className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-950 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">
                The person agreed to receive a JobLinca WhatsApp registration follow-up.
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting || !isActive}
                className="rounded-lg border border-gray-600 px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Save lead only'}
              </button>
              <button
                type="button"
                onClick={() => void submitLead(true)}
                disabled={submitting || !isActive || !form.consentWhatsapp}
                className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Save and send WhatsApp invite'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h3 className="text-base font-semibold text-white">Recent leads</h3>
            <p className="mt-1 text-sm text-gray-400">
              Track which people still need to complete their account.
            </p>
          </div>

          {initialLeads.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">
              No leads captured yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {initialLeads.map((lead) => {
                const canInvite =
                  isActive &&
                  lead.consent_whatsapp &&
                  !['completed', 'duplicate_existing_user', 'cancelled', 'opted_out'].includes(lead.status);
                const canCancel = isActive && !['completed', 'cancelled'].includes(lead.status);
                const canOptOut =
                  isActive && !['completed', 'opted_out', 'cancelled'].includes(lead.status);

                return (
                  <div key={lead.id} className="grid gap-4 px-5 py-5 xl:grid-cols-[1.15fr,0.95fr,auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-base font-semibold text-white">{lead.full_name}</h4>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                            lead.status
                          )}`}
                        >
                          {lead.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-300">{lead.phone_e164}</p>
                      {lead.email && <p className="text-sm text-gray-500">{lead.email}</p>}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-gray-500">
                        <span>{getRoleLabel(lead.intended_role)}</span>
                        <span>{getCaptureModeLabel(lead.capture_mode)}</span>
                      </div>
                      {lead.notes && (
                        <p className="mt-3 text-sm text-gray-400">{lead.notes}</p>
                      )}
                    </div>

                    <div className="space-y-2 text-sm text-gray-400">
                      <p>Created: {formatDate(lead.created_at, locale)}</p>
                      <p>
                        Latest invite:{' '}
                        {lead.latestInvite
                          ? `${lead.latestInvite.status.replace(/_/g, ' ')} • ${formatDate(
                              lead.latestInvite.sent_at || lead.latestInvite.created_at,
                              locale
                            )}`
                          : 'None'}
                      </p>
                      <p>Consent: {lead.consent_whatsapp ? 'Yes' : 'No'}</p>
                    </div>

                    <div className="flex flex-col items-start gap-3 xl:items-end">
                      <button
                        type="button"
                        onClick={() => void resendInvite(lead.id)}
                        disabled={!canInvite || actionLeadId === lead.id}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLeadId === lead.id ? 'Working...' : 'Send fresh invite'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelLead(lead.id)}
                        disabled={!canCancel || actionLeadId === lead.id}
                        className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel lead
                      </button>
                      <button
                        type="button"
                        onClick={() => void optOutLead(lead.id)}
                        disabled={!canOptOut || actionLeadId === lead.id}
                        className="rounded-lg border border-orange-700 px-3 py-2 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Mark opted out
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
