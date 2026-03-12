'use client';

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { AdminSponsorCampaignRecord } from '@/lib/sponsorship-schema';
import {
  SPONSOR_PLACEMENTS,
  SPONSOR_STATUSES,
  SPONSOR_TYPES,
  type SponsorPlacement,
  type SponsorStatus,
  type SponsorType,
} from '@/lib/sponsorship-schema';

interface CampaignFormState {
  sponsor_type: SponsorType;
  placement: SponsorPlacement;
  status: SponsorStatus;
  sponsor_name: string;
  title: string;
  short_copy: string;
  cta_label: string;
  cta_url: string;
  image_url: string;
  sponsor_logo_url: string;
  job_id: string;
  recruiter_id: string;
  partner_course_id: string;
  audience_roles: string;
  city_targets: string;
  priority: string;
  price_xaf: string;
  starts_at: string;
  ends_at: string;
}

function createEmptyForm(): CampaignFormState {
  return {
    sponsor_type: 'job',
    placement: 'homepage_shelf',
    status: 'draft',
    sponsor_name: '',
    title: '',
    short_copy: '',
    cta_label: '',
    cta_url: '',
    image_url: '',
    sponsor_logo_url: '',
    job_id: '',
    recruiter_id: '',
    partner_course_id: '',
    audience_roles: '',
    city_targets: '',
    priority: '0',
    price_xaf: '0',
    starts_at: '',
    ends_at: '',
  };
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
}

function parseIntegerOrZero(value: string) {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCampaignPayload(form: CampaignFormState) {
  return {
    ...form,
    priority: parseIntegerOrZero(form.priority),
    price_xaf: parseIntegerOrZero(form.price_xaf),
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
  };
}

function formFromCampaign(campaign: AdminSponsorCampaignRecord): CampaignFormState {
  return {
    sponsor_type: campaign.sponsor_type,
    placement: campaign.placement,
    status: campaign.status,
    sponsor_name: campaign.sponsor_name,
    title: campaign.title,
    short_copy: campaign.short_copy || '',
    cta_label: campaign.cta_label || '',
    cta_url: campaign.cta_url || '',
    image_url: campaign.image_url || '',
    sponsor_logo_url: campaign.sponsor_logo_url || '',
    job_id: campaign.job_id || '',
    recruiter_id: campaign.recruiter_id || '',
    partner_course_id: campaign.partner_course_id || '',
    audience_roles: campaign.audience_roles.join(', '),
    city_targets: campaign.city_targets.join(', '),
    priority: `${campaign.priority}`,
    price_xaf: `${campaign.price_xaf}`,
    starts_at: toDatetimeLocalValue(campaign.starts_at),
    ends_at: toDatetimeLocalValue(campaign.ends_at),
  };
}

function statusClasses(status: SponsorStatus) {
  if (status === 'active') {
    return 'border border-emerald-600/40 bg-emerald-900/30 text-emerald-300';
  }
  if (status === 'paused' || status === 'pending_approval') {
    return 'border border-yellow-600/40 bg-yellow-900/30 text-yellow-300';
  }
  if (status === 'rejected') {
    return 'border border-red-600/40 bg-red-900/30 text-red-300';
  }
  return 'border border-gray-600 bg-gray-700/60 text-gray-300';
}

function getSeedKey(campaign: AdminSponsorCampaignRecord) {
  const seedKey = campaign.metadata?.seed_key;
  return typeof seedKey === 'string' ? seedKey : null;
}

function isSeededCampaign(campaign: AdminSponsorCampaignRecord) {
  return Boolean(getSeedKey(campaign));
}

function formatCtr(value: number) {
  return `${value.toFixed(1)}%`;
}

type ReportingRange = 'all_time' | 'last_7_days';

function getCampaignStatsForRange(
  campaign: AdminSponsorCampaignRecord,
  range: ReportingRange
) {
  return campaign.stats[range];
}

interface CampaignEditorProps {
  title: string;
  description: string;
  form: CampaignFormState;
  setForm: Dispatch<SetStateAction<CampaignFormState>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function CampaignEditor({
  title,
  description,
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
}: CampaignEditorProps) {
  function updateField<K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-gray-700 bg-gray-800 p-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Type">
          <select
            value={form.sponsor_type}
            onChange={(event) => updateField('sponsor_type', event.target.value as SponsorType)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          >
            {SPONSOR_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Placement">
          <select
            value={form.placement}
            onChange={(event) => updateField('placement', event.target.value as SponsorPlacement)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          >
            {SPONSOR_PLACEMENTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(event) => updateField('status', event.target.value as SponsorStatus)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          >
            {SPONSOR_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <input
            type="number"
            value={form.priority}
            onChange={(event) => updateField('priority', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </Field>
        <Field label="Sponsor Name">
          <input
            type="text"
            value={form.sponsor_name}
            onChange={(event) => updateField('sponsor_name', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            required
          />
        </Field>
        <Field label="Title">
          <input
            type="text"
            value={form.title}
            onChange={(event) => updateField('title', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            required
          />
        </Field>
        <Field label="CTA Label">
          <input
            type="text"
            value={form.cta_label}
            onChange={(event) => updateField('cta_label', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="View Job"
          />
        </Field>
        <Field label="CTA URL">
          <input
            type="text"
            value={form.cta_url}
            onChange={(event) => updateField('cta_url', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="/jobs?location=Douala or https://..."
          />
        </Field>
        <Field label="Job ID">
          <input
            type="text"
            value={form.job_id}
            onChange={(event) => updateField('job_id', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="Optional linked job UUID"
          />
        </Field>
        <Field label="Recruiter ID">
          <input
            type="text"
            value={form.recruiter_id}
            onChange={(event) => updateField('recruiter_id', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="Optional linked recruiter UUID"
          />
        </Field>
        <Field label="Partner Course ID">
          <input
            type="text"
            value={form.partner_course_id}
            onChange={(event) => updateField('partner_course_id', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="Optional linked academy UUID"
          />
        </Field>
        <Field label="Price (XAF)">
          <input
            type="number"
            value={form.price_xaf}
            onChange={(event) => updateField('price_xaf', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </Field>
        <Field label="Audience Roles">
          <input
            type="text"
            value={form.audience_roles}
            onChange={(event) => updateField('audience_roles', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="candidate, talent"
          />
        </Field>
        <Field label="City Targets">
          <input
            type="text"
            value={form.city_targets}
            onChange={(event) => updateField('city_targets', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="Douala, Yaounde"
          />
        </Field>
        <Field label="Starts At">
          <input
            type="datetime-local"
            value={form.starts_at}
            onChange={(event) => updateField('starts_at', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </Field>
        <Field label="Ends At">
          <input
            type="datetime-local"
            value={form.ends_at}
            onChange={(event) => updateField('ends_at', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </Field>
        <Field label="Logo URL">
          <input
            type="text"
            value={form.sponsor_logo_url}
            onChange={(event) => updateField('sponsor_logo_url', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="Optional image URL"
          />
        </Field>
        <Field label="Image URL">
          <input
            type="text"
            value={form.image_url}
            onChange={(event) => updateField('image_url', event.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="Optional fallback image URL"
          />
        </Field>
      </div>

      <Field label="Short Copy" className="mt-4">
        <textarea
          value={form.short_copy}
          onChange={(event) => updateField('short_copy', event.target.value)}
          rows={4}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          placeholder="Short sponsor message for the card"
        />
      </Field>

      <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900/60 p-3 text-xs text-gray-400">
        Link a job, recruiter, or academy record when you want the homepage card to reflect live
        data. Otherwise provide a custom CTA URL and campaign copy.
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-600 px-5 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function SponsorshipsClient() {
  const [campaigns, setCampaigns] = useState<AdminSponsorCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CampaignFormState>(() => createEmptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CampaignFormState>(() => createEmptyForm());
  const [savingMode, setSavingMode] = useState<'create' | 'edit' | null>(null);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [seedAction, setSeedAction] = useState<'load' | 'clear' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'all' | SponsorStatus>('all');
  const [reportingRange, setReportingRange] = useState<ReportingRange>('all_time');

  async function fetchCampaigns() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/sponsorships', { cache: 'no-store' });
      const payload = (await response.json()) as {
        sponsorships?: AdminSponsorCampaignRecord[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to fetch sponsorships');
      }
      setCampaigns(Array.isArray(payload.sponsorships) ? payload.sponsorships : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sponsorships');
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchCampaigns();
  }, []);

  const visibleCampaigns = useMemo(() => {
    if (filter === 'all') return campaigns;
    return campaigns.filter((campaign) => campaign.status === filter);
  }, [campaigns, filter]);

  const performanceSummary = useMemo(() => {
    const totals = visibleCampaigns.reduce(
      (accumulator, campaign) => {
        const stats = getCampaignStatsForRange(campaign, reportingRange);
        accumulator.impressions += stats.impressions;
        accumulator.clicks += stats.clicks;
        accumulator.ctaClicks += stats.cta_clicks;
        return accumulator;
      },
      { impressions: 0, clicks: 0, ctaClicks: 0 }
    );

    return {
      campaigns: visibleCampaigns.length,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctaClicks: totals.ctaClicks,
      ctrPercent:
        totals.impressions > 0
          ? Number(((totals.clicks / totals.impressions) * 100).toFixed(1))
          : 0,
    };
  }, [reportingRange, visibleCampaigns]);

  function resetCreateForm() {
    setCreateForm(createEmptyForm());
  }

  function closeEditForm() {
    setEditingId(null);
    setEditForm(createEmptyForm());
  }

  function openCreateForm() {
    setNotice('');
    setError('');
    closeEditForm();
    resetCreateForm();
    setShowCreate(true);
  }

  function toggleCreateForm() {
    if (showCreate) {
      setShowCreate(false);
      resetCreateForm();
      return;
    }
    openCreateForm();
  }

  function beginEdit(campaign: AdminSponsorCampaignRecord) {
    setNotice('');
    setError('');
    setShowCreate(false);
    setEditingId(campaign.id);
    setEditForm(formFromCampaign(campaign));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingMode('create');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/sponsorships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCampaignPayload(createForm)),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create campaign');
      }
      setNotice('Campaign created.');
      setShowCreate(false);
      resetCreateForm();
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setSavingMode(null);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSavingMode('edit');
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/sponsorships/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCampaignPayload(editForm)),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update campaign');
      }
      setNotice('Campaign updated.');
      closeEditForm();
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign');
    } finally {
      setSavingMode(null);
    }
  }

  async function updateStatus(id: string, nextStatus: SponsorStatus) {
    setRowActionId(id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/sponsorships/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update status');
      }
      setNotice(`Campaign marked ${nextStatus.replace(/_/g, ' ')}.`);
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign');
    } finally {
      setRowActionId(null);
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this sponsorship campaign?')) return;
    setRowActionId(id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/sponsorships/${id}`, { method: 'DELETE' });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete campaign');
      }
      if (editingId === id) {
        closeEditForm();
      }
      setNotice('Campaign deleted.');
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete campaign');
    } finally {
      setRowActionId(null);
    }
  }

  async function seedDemoCampaigns() {
    setSeedAction('load');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/sponsorships/seed', { method: 'POST' });
      const payload = (await response.json()) as {
        inserted?: number;
        updated?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to seed demo campaigns');
      }
      setNotice(
        `Demo homepage shelf synced. Inserted ${payload.inserted || 0}, updated ${payload.updated || 0}.`
      );
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed demo campaigns');
    } finally {
      setSeedAction(null);
    }
  }

  async function clearDemoCampaigns() {
    if (!confirm('Remove the seeded demo sponsorship campaigns?')) return;
    setSeedAction('clear');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/sponsorships/seed', { method: 'DELETE' });
      const payload = (await response.json()) as { deleted?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to clear demo campaigns');
      }
      setNotice(`Removed ${payload.deleted || 0} demo campaigns.`);
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear demo campaigns');
    } finally {
      setSeedAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            All
          </button>
          {SPONSOR_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${filter === status ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              {status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void seedDemoCampaigns()}
            disabled={seedAction !== null}
            className="rounded-lg border border-emerald-600/40 bg-emerald-600/15 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-600/25 disabled:opacity-50"
          >
            {seedAction === 'load' ? 'Loading Demo Shelf...' : 'Load Demo Shelf'}
          </button>
          <button
            type="button"
            onClick={() => void clearDemoCampaigns()}
            disabled={seedAction !== null}
            className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {seedAction === 'clear' ? 'Clearing Demo Shelf...' : 'Clear Demo Shelf'}
          </button>
          <button
            type="button"
            onClick={toggleCreateForm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {showCreate ? 'Cancel New Campaign' : 'Create Campaign'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-700 bg-emerald-900/20 p-4 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2 xl:col-span-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReportingRange('all_time')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${reportingRange === 'all_time' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            All Time
          </button>
          <button
            type="button"
            onClick={() => setReportingRange('last_7_days')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${reportingRange === 'last_7_days' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            Last 7 Days
          </button>
        </div>
        <SummaryCard label="Visible Campaigns" value={performanceSummary.campaigns.toLocaleString()} />
        <SummaryCard label="Impressions" value={performanceSummary.impressions.toLocaleString()} />
        <SummaryCard label="Clicks" value={performanceSummary.clicks.toLocaleString()} />
        <SummaryCard label="CTA Clicks" value={performanceSummary.ctaClicks.toLocaleString()} />
        <SummaryCard
          label={reportingRange === 'all_time' ? 'All-Time CTR' : '7-Day CTR'}
          value={formatCtr(performanceSummary.ctrPercent)}
        />
      </div>

      {showCreate && (
        <CampaignEditor
          title="New Sponsorship Campaign"
          description="Create a paid placement for the homepage shelf or future sponsor surfaces."
          form={createForm}
          setForm={setCreateForm}
          onSubmit={handleCreate}
          onCancel={() => {
            setShowCreate(false);
            resetCreateForm();
          }}
          submitLabel="Create Campaign"
          submitting={savingMode === 'create'}
        />
      )}

      {editingId && (
        <CampaignEditor
          title="Edit Sponsorship Campaign"
          description="Update campaign copy, targeting, dates, and placement without recreating the record."
          form={editForm}
          setForm={setEditForm}
          onSubmit={handleUpdate}
          onCancel={closeEditForm}
          submitLabel="Save Changes"
          submitting={savingMode === 'edit'}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-sm font-medium text-gray-400">Campaign</th>
              <th className="p-4 text-left text-sm font-medium text-gray-400">Placement</th>
              <th className="p-4 text-left text-sm font-medium text-gray-400">Linked Record</th>
              <th className="p-4 text-left text-sm font-medium text-gray-400">Performance</th>
              <th className="p-4 text-left text-sm font-medium text-gray-400">Timing</th>
              <th className="p-4 text-left text-sm font-medium text-gray-400">Status</th>
              <th className="p-4 text-right text-sm font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-gray-400">
                  Loading campaigns...
                </td>
              </tr>
            ) : visibleCampaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-gray-400">
                  No sponsorship campaigns found.
                </td>
              </tr>
            ) : (
              visibleCampaigns.map((campaign) => {
                const linkedLabel =
                  campaign.job?.title ||
                  campaign.recruiter?.company_name ||
                  campaign.partner_course?.title ||
                  'Custom CTA';
                const seeded = isSeededCampaign(campaign);
                const seedKey = getSeedKey(campaign);
                const rowBusy = rowActionId === campaign.id;
                const stats = getCampaignStatsForRange(campaign, reportingRange);

                return (
                  <tr
                    key={campaign.id}
                    className={`border-b border-gray-700/50 align-top hover:bg-gray-700/20 ${editingId === campaign.id ? 'bg-blue-950/20' : ''}`}
                  >
                    <td className="p-4">
                      <p className="font-medium text-white">{campaign.title}</p>
                      <p className="text-sm text-gray-400">{campaign.sponsor_name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[11px] text-gray-300">
                          {campaign.sponsor_type}
                        </span>
                        <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[11px] text-gray-400">
                          Priority {campaign.priority}
                        </span>
                        <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[11px] text-gray-400">
                          {campaign.price_xaf.toLocaleString()} XAF
                        </span>
                        {seeded && (
                          <span className="rounded-full border border-emerald-700/60 bg-emerald-900/20 px-2 py-0.5 text-[11px] text-emerald-300">
                            demo
                          </span>
                        )}
                      </div>
                      {seedKey && <p className="mt-2 text-xs text-gray-500">Seed key: {seedKey}</p>}
                    </td>
                    <td className="p-4 text-sm text-gray-300">
                      <p>{campaign.placement}</p>
                      {campaign.city_targets.length > 0 && (
                        <p className="mt-2 text-xs text-gray-500">{campaign.city_targets.join(', ')}</p>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-300">
                      <p>{linkedLabel}</p>
                      {campaign.cta_url && <p className="mt-1 break-all text-xs text-gray-500">{campaign.cta_url}</p>}
                    </td>
                    <td className="p-4 text-sm text-gray-300">
                      <p>{stats.impressions.toLocaleString()} impressions</p>
                      <p className="mt-1">{stats.clicks.toLocaleString()} clicks</p>
                      <p className="mt-1 text-xs text-gray-500">
                        CTR {formatCtr(stats.ctr_percent)}
                        {stats.cta_clicks > 0
                          ? ` • CTA ${stats.cta_clicks.toLocaleString()}`
                          : ''}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        {stats.last_event_at
                          ? `Last event ${new Date(stats.last_event_at).toLocaleString()}`
                          : 'No tracked events yet'}
                      </p>
                    </td>
                    <td className="p-4 text-sm text-gray-400">
                      <p>{campaign.starts_at ? new Date(campaign.starts_at).toLocaleString() : 'No start'}</p>
                      <p className="mt-1">{campaign.ends_at ? new Date(campaign.ends_at).toLocaleString() : 'No end'}</p>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(campaign.status)}`}>
                        {campaign.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(campaign)}
                          disabled={rowBusy || savingMode !== null}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        {campaign.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => void updateStatus(campaign.id, 'active')}
                            disabled={rowBusy}
                            className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                          >
                            Activate
                          </button>
                        )}
                        {campaign.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => void updateStatus(campaign.id, 'paused')}
                            disabled={rowBusy}
                            className="rounded-lg bg-yellow-600 px-3 py-1 text-sm text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
                          >
                            Pause
                          </button>
                        )}
                        {campaign.status !== 'ended' && (
                          <button
                            type="button"
                            onClick={() => void updateStatus(campaign.id, 'ended')}
                            disabled={rowBusy}
                            className="rounded-lg bg-gray-600 px-3 py-1 text-sm text-white transition-colors hover:bg-gray-500 disabled:opacity-50"
                          >
                            End
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void deleteCampaign(campaign.id)}
                          disabled={rowBusy}
                          className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 text-sm text-gray-400">
        Demo shelf actions are admin-only and intended for non-production use. In production they
        remain blocked unless `ALLOW_SPONSORSHIP_DEMO_SEED=true`.
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/80 p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
