'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RegistrationLeadListItem } from '@/lib/field-registration/types';
import type { SupportTicketListItem } from '@/lib/support-tickets/types';

type TicketFormState = {
  registrationLeadId: string;
  subjectFullName: string;
  subjectPhone: string;
  subjectEmail: string;
  targetRole: 'job_seeker' | 'talent' | 'recruiter';
  category: 'login' | 'verification' | 'profile' | 'payment' | 'application' | 'bug' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedTeam: 'operations' | 'engineering';
  subject: string;
  description: string;
};

const INITIAL_FORM: TicketFormState = {
  registrationLeadId: '',
  subjectFullName: '',
  subjectPhone: '',
  subjectEmail: '',
  targetRole: 'job_seeker',
  category: 'other',
  priority: 'normal',
  assignedTeam: 'operations',
  subject: '',
  description: '',
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

function getRoleLabel(role: TicketFormState['targetRole']) {
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

function getStatusClasses(status: SupportTicketListItem['status']) {
  switch (status) {
    case 'resolved':
      return 'border-emerald-700 bg-emerald-900/30 text-emerald-200';
    case 'closed':
      return 'border-gray-700 bg-gray-800 text-gray-300';
    case 'in_progress':
    case 'escalated':
      return 'border-blue-700 bg-blue-900/30 text-blue-200';
    case 'waiting_on_user':
      return 'border-yellow-700 bg-yellow-900/30 text-yellow-100';
    default:
      return 'border-neutral-700 bg-neutral-800 text-neutral-200';
  }
}

function getPriorityClasses(priority: SupportTicketListItem['priority']) {
  switch (priority) {
    case 'urgent':
      return 'text-red-300';
    case 'high':
      return 'text-orange-300';
    case 'low':
      return 'text-gray-400';
    default:
      return 'text-gray-300';
  }
}

export default function FieldSupportTicketsPanel({
  initialTickets,
  recentLeads,
  locale,
  isActive,
}: {
  initialTickets: SupportTicketListItem[];
  recentLeads: RegistrationLeadListItem[];
  locale: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<TicketFormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function updateForm<K extends keyof TicketFormState>(
    key: K,
    value: TicketFormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyLeadSelection(leadId: string) {
    const lead = recentLeads.find((item) => item.id === leadId);
    if (!lead) {
      setForm((current) => ({
        ...current,
        registrationLeadId: '',
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      registrationLeadId: lead.id,
      subjectFullName: lead.full_name || current.subjectFullName,
      subjectPhone: lead.phone_e164 || current.subjectPhone,
      subjectEmail: lead.email || current.subjectEmail,
      targetRole: lead.intended_role,
    }));
  }

  async function submitTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !isActive) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/field-agent/support-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create support ticket');
      }

      setMessage('Support ticket filed successfully.');
      setForm(INITIAL_FORM);
      router.refresh();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to create support ticket'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">Support escalations</h2>
        <p className="mt-1 text-sm text-gray-400">
          File a case when a field issue needs operations or engineering follow-up.
        </p>
      </div>

      <div className="grid gap-6 p-6 xl:grid-cols-[0.94fr,1.06fr]">
        <div className="space-y-5">
          {!isActive && (
            <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
              This field agent account is inactive. Ticket filing is disabled.
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

          <form onSubmit={submitTicket} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Related lead (optional)</span>
              <select
                value={form.registrationLeadId}
                onChange={(event) => applyLeadSelection(event.target.value)}
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">No linked lead</option>
                {recentLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.full_name} — {lead.phone_e164}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Full name</span>
              <input
                type="text"
                value={form.subjectFullName}
                onChange={(event) => updateForm('subjectFullName', event.target.value)}
                required
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">WhatsApp number</span>
                <input
                  type="tel"
                  value={form.subjectPhone}
                  onChange={(event) => updateForm('subjectPhone', event.target.value)}
                  disabled={!isActive}
                  placeholder="+237 6xx xxx xxx"
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">Email (optional)</span>
                <input
                  type="email"
                  value={form.subjectEmail}
                  onChange={(event) => updateForm('subjectEmail', event.target.value)}
                  disabled={!isActive}
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">Account type</span>
                <select
                  value={form.targetRole}
                  onChange={(event) =>
                    updateForm('targetRole', event.target.value as TicketFormState['targetRole'])
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
                <span className="mb-2 block text-sm text-gray-300">Category</span>
                <select
                  value={form.category}
                  onChange={(event) =>
                    updateForm('category', event.target.value as TicketFormState['category'])
                  }
                  disabled={!isActive}
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="login">Login</option>
                  <option value="verification">Verification</option>
                  <option value="profile">Profile</option>
                  <option value="payment">Payment</option>
                  <option value="application">Application</option>
                  <option value="bug">Bug</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">Priority</span>
                <select
                  value={form.priority}
                  onChange={(event) =>
                    updateForm('priority', event.target.value as TicketFormState['priority'])
                  }
                  disabled={!isActive}
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">Escalate to</span>
                <select
                  value={form.assignedTeam}
                  onChange={(event) =>
                    updateForm(
                      'assignedTeam',
                      event.target.value as TicketFormState['assignedTeam']
                    )
                  }
                  disabled={!isActive}
                  className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="operations">Operations</option>
                  <option value="engineering">Engineering</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">Issue summary</span>
              <input
                type="text"
                value={form.subject}
                onChange={(event) => updateForm('subject', event.target.value)}
                required
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-gray-300">What happened?</span>
              <textarea
                value={form.description}
                onChange={(event) => updateForm('description', event.target.value)}
                rows={5}
                required
                disabled={!isActive}
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <button
              type="submit"
              disabled={submitting || !isActive}
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Filing ticket...' : 'File support ticket'}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-700 bg-gray-900/50">
          <div className="border-b border-gray-700 px-5 py-4">
            <h3 className="text-base font-semibold text-white">Recent tickets</h3>
            <p className="mt-1 text-sm text-gray-400">
              Track what is still open and what has already been resolved.
            </p>
          </div>

          {initialTickets.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400">
              No support tickets filed yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {initialTickets.map((ticket) => (
                <div key={ticket.id} className="grid gap-4 px-5 py-5 xl:grid-cols-[1.15fr,0.95fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="text-base font-semibold text-white">{ticket.subject}</h4>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                          ticket.status
                        )}`}
                      >
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-300">
                      {ticket.subject_full_name}
                      {ticket.subject_phone_e164 ? ` • ${ticket.subject_phone_e164}` : ''}
                    </p>
                    <p className="mt-2 text-sm text-gray-400">{ticket.description}</p>
                    {ticket.latestMessage && ticket.latestMessage.body !== ticket.description && (
                      <p className="mt-3 rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-sm text-gray-300">
                        Latest update: {ticket.latestMessage.body}
                      </p>
                    )}
                    {ticket.resolution_summary && (
                      <p className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
                        Resolution: {ticket.resolution_summary}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 text-sm text-gray-400">
                    <p>Filed: {formatDate(ticket.created_at, locale)}</p>
                    <p>Type: {getRoleLabel(ticket.target_role)}</p>
                    <p>Category: {ticket.category}</p>
                    <p className={getPriorityClasses(ticket.priority)}>
                      Priority: {ticket.priority}
                    </p>
                    <p>Team: {ticket.assigned_team}</p>
                    <p>
                      Assigned admin:{' '}
                      {ticket.assignedAdmin?.fullName || 'Pending assignment'}
                    </p>
                    {ticket.registrationLead && (
                      <p>Lead link: {ticket.registrationLead.full_name}</p>
                    )}
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
