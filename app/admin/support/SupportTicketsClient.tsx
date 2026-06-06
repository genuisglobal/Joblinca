'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupportTicketListItem } from '@/lib/support-tickets/types';

interface SupportCounts {
  total: number;
  open: number;
  active: number;
  resolved: number;
}

interface LocalTicketState {
  status: SupportTicketListItem['status'];
  priority: SupportTicketListItem['priority'];
  assignedTeam: SupportTicketListItem['assigned_team'];
  resolutionSummary: string;
  messageBody: string;
  messageVisibility: 'internal' | 'public';
}

function buildInitialState(ticket: SupportTicketListItem): LocalTicketState {
  return {
    status: ticket.status,
    priority: ticket.priority,
    assignedTeam: ticket.assigned_team,
    resolutionSummary: ticket.resolution_summary || '',
    messageBody: '',
    messageVisibility: 'internal',
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString();
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

export default function SupportTicketsClient({
  tickets,
  counts,
}: {
  tickets: SupportTicketListItem[];
  counts: SupportCounts;
}) {
  const router = useRouter();
  const [stateMap, setStateMap] = useState<Record<string, LocalTicketState>>(
    Object.fromEntries(tickets.map((ticket) => [ticket.id, buildInitialState(ticket)]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function updateState<K extends keyof LocalTicketState>(
    ticketId: string,
    key: K,
    value: LocalTicketState[K]
  ) {
    setStateMap((current) => ({
      ...current,
      [ticketId]: {
        ...(current[ticketId] || buildInitialState(tickets.find((ticket) => ticket.id === ticketId)!)),
        [key]: value,
      },
    }));
  }

  async function saveTicket(ticketId: string) {
    if (savingId) {
      return;
    }

    const ticketState = stateMap[ticketId];
    if (!ticketState) {
      return;
    }

    setSavingId(ticketId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ticketState),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update support ticket');
      }

      setMessage('Support ticket updated.');
      setStateMap((current) => ({
        ...current,
        [ticketId]: {
          ...ticketState,
          messageBody: '',
          messageVisibility: 'internal',
        },
      }));
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to update support ticket'
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="All Tickets" value={counts.total} detail="Current queue size" />
        <SummaryCard label="Open" value={counts.open} detail="Needs first response" />
        <SummaryCard label="Active" value={counts.active} detail="In progress or escalated" />
        <SummaryCard label="Resolved" value={counts.resolved} detail="Resolved or closed" />
      </div>

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

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-gray-700 bg-gray-800 px-6 py-12 text-center text-sm text-gray-400">
          No support tickets have been filed yet.
        </div>
      ) : (
        <div className="space-y-5">
          {tickets.map((ticket) => {
            const localState = stateMap[ticket.id] || buildInitialState(ticket);
            return (
              <section key={ticket.id} className="rounded-2xl border border-gray-700 bg-gray-800">
                <div className="border-b border-gray-700 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-white">{ticket.subject}</h2>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                        ticket.status
                      )}`}
                    >
                      {ticket.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-400">
                    {ticket.subject_full_name}
                    {ticket.subject_phone_e164 ? ` • ${ticket.subject_phone_e164}` : ''}
                    {ticket.subject_email ? ` • ${ticket.subject_email}` : ''}
                  </p>
                </div>

                <div className="grid gap-6 px-6 py-5 xl:grid-cols-[1.05fr,0.95fr]">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Case details</p>
                      <p className="mt-2 text-sm text-gray-300">{ticket.description}</p>
                    </div>

                    {ticket.latestMessage && (
                      <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          Latest note
                        </p>
                        <p className="mt-2 text-sm text-gray-200">{ticket.latestMessage.body}</p>
                        <p className="mt-2 text-xs text-gray-500">
                          {ticket.latestMessage.author_kind}
                          {ticket.latestMessage.is_internal ? ' • internal' : ' • public'} •{' '}
                          {formatDate(ticket.latestMessage.created_at)}
                        </p>
                      </div>
                    )}

                    {ticket.resolution_summary && (
                      <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-emerald-400">
                          Resolution
                        </p>
                        <p className="mt-2 text-sm text-emerald-100">{ticket.resolution_summary}</p>
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <InfoItem label="Filed by" value={ticket.fieldAgent?.fullName || 'Unknown field agent'} />
                      <InfoItem
                        label="Officer code"
                        value={ticket.field_officer_code_snapshot || 'Not captured'}
                      />
                      <InfoItem label="Filed" value={formatDate(ticket.created_at)} />
                      <InfoItem label="Target role" value={ticket.target_role.replace(/_/g, ' ')} />
                      <InfoItem label="Category" value={ticket.category} />
                      <InfoItem
                        label="Lead link"
                        value={ticket.registrationLead?.full_name || 'No linked lead'}
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-gray-700 bg-gray-900/50 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <SelectField
                        label="Status"
                        value={localState.status}
                        onChange={(value) =>
                          updateState(
                            ticket.id,
                            'status',
                            value as LocalTicketState['status']
                          )
                        }
                        options={[
                          ['open', 'Open'],
                          ['in_progress', 'In progress'],
                          ['waiting_on_user', 'Waiting on user'],
                          ['escalated', 'Escalated'],
                          ['resolved', 'Resolved'],
                          ['closed', 'Closed'],
                        ]}
                      />

                      <SelectField
                        label="Priority"
                        value={localState.priority}
                        onChange={(value) =>
                          updateState(
                            ticket.id,
                            'priority',
                            value as LocalTicketState['priority']
                          )
                        }
                        options={[
                          ['low', 'Low'],
                          ['normal', 'Normal'],
                          ['high', 'High'],
                          ['urgent', 'Urgent'],
                        ]}
                      />
                    </div>

                    <SelectField
                      label="Assigned team"
                      value={localState.assignedTeam}
                      onChange={(value) =>
                        updateState(
                          ticket.id,
                          'assignedTeam',
                          value as LocalTicketState['assignedTeam']
                        )
                      }
                      options={[
                        ['support', 'Support'],
                        ['operations', 'Operations'],
                        ['engineering', 'Engineering'],
                      ]}
                    />

                    <label className="block">
                      <span className="mb-2 block text-sm text-gray-300">Resolution summary</span>
                      <textarea
                        value={localState.resolutionSummary}
                        onChange={(event) =>
                          updateState(ticket.id, 'resolutionSummary', event.target.value)
                        }
                        rows={3}
                        className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-gray-300">Add note</span>
                      <textarea
                        value={localState.messageBody}
                        onChange={(event) =>
                          updateState(ticket.id, 'messageBody', event.target.value)
                        }
                        rows={4}
                        className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                      />
                    </label>

                    <SelectField
                      label="Note visibility"
                      value={localState.messageVisibility}
                      onChange={(value) =>
                        updateState(
                          ticket.id,
                          'messageVisibility',
                          value as LocalTicketState['messageVisibility']
                        )
                      }
                      options={[
                        ['internal', 'Internal only'],
                        ['public', 'Visible to field agent'],
                      ]}
                    />

                    <div className="space-y-2 text-sm text-gray-400">
                      <p>Assigned admin: {ticket.assignedAdmin?.fullName || 'Unassigned'}</p>
                      <p>Resolved at: {formatDate(ticket.resolved_at)}</p>
                      <p>Closed at: {formatDate(ticket.closed_at)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void saveTicket(ticket.id)}
                      disabled={savingId === ticket.id}
                      className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === ticket.id ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
      <p className="text-sm uppercase tracking-[0.25em] text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-gray-400">{detail}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-300">{value}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
