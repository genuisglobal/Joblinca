'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CopyTextButton from '@/components/field-agents/CopyTextButton';

interface AgentMetrics {
  registrationCount: number;
  onboardingCompletedCount: number;
  applicationsSubmittedCount: number;
  latestRegistrationAt: string | null;
}

interface FieldAgentRecord {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  officerCode: string;
  isActive: boolean;
  region: string;
  town: string;
  notes: string;
  createdAt: string;
  deactivatedAt: string | null;
  shareUrl: string;
  metrics: AgentMetrics;
}

interface CreateResult {
  email: string;
  temporaryPassword: string;
  shareUrl: string;
  officerCode: string;
}

interface FieldAgentsClientProps {
  agents: FieldAgentRecord[];
}

const INITIAL_FORM = {
  fullName: '',
  email: '',
  phone: '',
  region: '',
  town: '',
  officerCode: '',
  notes: '',
};

export default function FieldAgentsClient({ agents }: FieldAgentsClientProps) {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);

  const totals = useMemo(() => {
    return agents.reduce(
      (accumulator, agent) => {
        accumulator.activeCount += agent.isActive ? 1 : 0;
        accumulator.registrationCount += agent.metrics.registrationCount;
        accumulator.applicationsSubmittedCount += agent.metrics.applicationsSubmittedCount;
        return accumulator;
      },
      {
        activeCount: 0,
        registrationCount: 0,
        applicationsSubmittedCount: 0,
      }
    );
  }, [agents]);

  function updateForm<K extends keyof typeof INITIAL_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setCreateResult(null);

    try {
      const response = await fetch('/api/admin/registration-officers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to create field agent account');
      }

      setCreateResult({
        email: payload.account.email,
        temporaryPassword: payload.account.temporaryPassword,
        shareUrl: payload.account.shareUrl,
        officerCode: payload.officer.officer_code,
      });
      setForm(INITIAL_FORM);
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Failed to create field agent account'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(agent: FieldAgentRecord) {
    if (actionLoadingId) {
      return;
    }

    setActionLoadingId(agent.id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/registration-officers/${agent.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !agent.isActive }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update field agent account');
      }

      router.refresh();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : 'Failed to update field agent account'
      );
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Field Agents" value={agents.length} detail={`${totals.activeCount} active`} />
        <SummaryCard
          label="Attributed Registrations"
          value={totals.registrationCount}
          detail="Tracked through officer codes"
        />
        <SummaryCard
          label="Submitted Applications"
          value={totals.applicationsSubmittedCount}
          detail="From attributed registrations"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <section className="rounded-2xl border border-gray-700 bg-gray-800 p-6">
          <h2 className="text-lg font-semibold text-white">Create field agent</h2>
          <p className="mt-1 text-sm text-gray-400">
            Creates an active field agent account with a temporary password and share link.
          </p>

          <form onSubmit={handleCreate} className="mt-6 grid gap-4">
            <Input
              label="Full name"
              value={form.fullName}
              onChange={(value) => updateForm('fullName', value)}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => updateForm('email', value)}
              required
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(value) => updateForm('phone', value)}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Region"
                value={form.region}
                onChange={(value) => updateForm('region', value)}
              />
              <Input
                label="Town"
                value={form.town}
                onChange={(value) => updateForm('town', value)}
              />
            </div>
            <Input
              label="Officer code"
              value={form.officerCode}
              onChange={(value) => updateForm('officerCode', value.toUpperCase())}
              placeholder="Optional"
            />
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(value) => updateForm('notes', value)}
            />

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating...' : 'Create field agent'}
            </button>
          </form>

          {createResult && (
            <div className="mt-6 rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
              <h3 className="text-sm font-semibold text-emerald-300">Account created</h3>
              <div className="mt-3 space-y-3 text-sm text-emerald-100">
                <div className="flex flex-wrap items-center gap-3">
                  <span>Email: {createResult.email}</span>
                  <CopyTextButton value={createResult.email} label="Copy email" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span>Temporary password: {createResult.temporaryPassword}</span>
                  <CopyTextButton value={createResult.temporaryPassword} label="Copy password" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span>Officer code: {createResult.officerCode}</span>
                  <CopyTextButton value={createResult.officerCode} label="Copy code" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="break-all">Share link: {createResult.shareUrl}</span>
                  <CopyTextButton value={createResult.shareUrl} label="Copy link" />
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-700 bg-gray-800">
          <div className="border-b border-gray-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Existing field agents</h2>
            <p className="text-sm text-gray-400">
              Track code usage, onboarding completion, and application conversion.
            </p>
          </div>

          {error && (
            <div className="mx-6 mt-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {agents.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-400">
              No field agents have been created yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {agents.map((agent) => (
                <div key={agent.id} className="grid gap-4 px-6 py-5 xl:grid-cols-[1.3fr,1fr,1fr,auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold text-white">{agent.fullName}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          agent.isActive
                            ? 'bg-emerald-900/40 text-emerald-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-400">{agent.email || 'No email'}</p>
                    <p className="text-sm text-gray-500">{agent.phone || 'No phone'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="text-sm text-gray-300">Code: {agent.officerCode}</span>
                      <CopyTextButton value={agent.officerCode} label="Copy code" />
                      <CopyTextButton value={agent.shareUrl} label="Copy link" />
                    </div>
                    {(agent.region || agent.town) && (
                      <p className="mt-3 text-sm text-gray-400">
                        {agent.region || 'Region not set'}
                        {agent.town ? `, ${agent.town}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 text-sm text-gray-300">
                    <p>Registrations: {agent.metrics.registrationCount}</p>
                    <p>Onboarding complete: {agent.metrics.onboardingCompletedCount}</p>
                    <p>Applied: {agent.metrics.applicationsSubmittedCount}</p>
                  </div>

                  <div className="space-y-2 text-sm text-gray-400">
                    <p>Created: {new Date(agent.createdAt).toLocaleDateString()}</p>
                    <p>
                      Latest registration:{' '}
                      {agent.metrics.latestRegistrationAt
                        ? new Date(agent.metrics.latestRegistrationAt).toLocaleDateString()
                        : 'None'}
                    </p>
                    {agent.deactivatedAt && (
                      <p>Deactivated: {new Date(agent.deactivatedAt).toLocaleDateString()}</p>
                    )}
                  </div>

                  <div className="flex items-start justify-end">
                    <button
                      type="button"
                      onClick={() => handleToggle(agent)}
                      disabled={actionLoadingId === agent.id}
                      className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingId === agent.id
                        ? 'Saving...'
                        : agent.isActive
                          ? 'Deactivate'
                          : 'Reactivate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
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

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
      />
    </label>
  );
}
