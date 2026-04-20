'use client';

import { useState } from 'react';

type BlastRole = 'job_seeker' | 'talent';

interface RecipientSample {
  userId: string;
  phone: string;
  name: string | null;
  role: string;
  location: string | null;
}

interface PreviewResponse {
  ok: boolean;
  count: number;
  sample: RecipientSample[];
  error?: string;
}

interface SendResponse {
  ok: boolean;
  matched?: number;
  attempted?: number;
  total?: number;
  sent?: number;
  failed?: number;
  errors?: Array<{ userId: string; phone: string; error: string }>;
  error?: string;
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function BlastClient() {
  const [keywords, setKeywords] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [locations, setLocations] = useState('');
  const [roles, setRoles] = useState<BlastRole[]>(['job_seeker', 'talent']);
  const [seekerIds, setSeekerIds] = useState('');
  const [message, setMessage] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('en');
  const [batchSize, setBatchSize] = useState(20);
  const [delayMs, setDelayMs] = useState(1000);
  const [maxRecipients, setMaxRecipients] = useState(2000);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [sendResult, setSendResult] = useState<SendResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSend, setLoadingSend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildFilters = () => ({
    keywords: splitCsv(keywords),
    qualifications: splitCsv(qualifications),
    locations: splitCsv(locations),
    roles,
    seekerIds: splitCsv(seekerIds),
  });

  const toggleRole = (role: BlastRole) => {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role]
    );
  };

  const handlePreview = async () => {
    setError(null);
    setSendResult(null);
    setLoadingPreview(true);
    try {
      const filters = buildFilters();
      const params = new URLSearchParams();
      if (filters.keywords.length)
        params.set('keywords', filters.keywords.join(','));
      if (filters.qualifications.length)
        params.set('qualifications', filters.qualifications.join(','));
      if (filters.locations.length)
        params.set('locations', filters.locations.join(','));
      if (filters.roles.length) params.set('roles', filters.roles.join(','));
      if (filters.seekerIds.length)
        params.set('seekerIds', filters.seekerIds.join(','));

      const res = await fetch(
        `/api/admin/whatsapp/blast?${params.toString()}`,
        { method: 'GET' }
      );
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Preview failed');
      }
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim() && !templateName.trim()) {
      setError('Enter a message or a template name before sending.');
      return;
    }
    if (!preview || preview.count === 0) {
      setError('Preview recipients first. The audience must not be empty.');
      return;
    }
    const confirmed = window.confirm(
      `Send WhatsApp blast to ${Math.min(preview.count, maxRecipients)} recipient(s)? This cannot be undone.`
    );
    if (!confirmed) return;

    setError(null);
    setSendResult(null);
    setLoadingSend(true);
    try {
      const res = await fetch('/api/admin/whatsapp/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildFilters(),
          message: message.trim() || undefined,
          templateName: templateName.trim() || undefined,
          templateLanguage: templateLanguage.trim() || 'en',
          batchSize,
          delayMs,
          maxRecipients,
        }),
      });
      const data = (await res.json()) as SendResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Send failed');
      }
      setSendResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setLoadingSend(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Audience filters</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Field
            label="Keywords (comma separated)"
            hint="Matches headline, career info, skills, and resume text. Any one match keeps the seeker."
            value={keywords}
            onChange={setKeywords}
            placeholder="e.g. sales, customer service, react"
          />
          <Field
            label="Qualifications"
            hint="Matches field of study, school, resume education."
            value={qualifications}
            onChange={setQualifications}
            placeholder="e.g. computer science, HND, bachelor"
          />
          <Field
            label="Locations"
            hint="Matches residence, preferred work locations."
            value={locations}
            onChange={setLocations}
            placeholder="e.g. Douala, Yaoundé, remote"
          />
          <Field
            label="Specific seeker IDs (optional)"
            hint="If set, only these user IDs are considered. Still subject to other filters."
            value={seekerIds}
            onChange={setSeekerIds}
            placeholder="uuid, uuid, ..."
          />
        </div>

        <div className="mt-4">
          <p className="text-sm text-gray-400 mb-2">Roles</p>
          <div className="flex gap-4">
            {(['job_seeker', 'talent'] as BlastRole[]).map((role) => (
              <label
                key={role}
                className="flex items-center gap-2 text-sm text-gray-200"
              >
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="rounded bg-gray-700 border-gray-600"
                />
                {role === 'job_seeker' ? 'Job seekers' : 'Talents (students)'}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={handlePreview}
            disabled={loadingPreview}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingPreview ? 'Counting...' : 'Preview recipients'}
          </button>
        </div>
      </section>

      {/* Preview result */}
      {preview && (
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white">
            Matched {preview.count} recipient(s)
          </h2>
          {preview.sample.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r) => (
                    <tr key={r.userId} className="border-b border-gray-700/50">
                      <td className="py-2 pr-3 text-white">
                        {r.name || '—'}
                      </td>
                      <td className="py-2 pr-3 text-gray-300">{r.phone}</td>
                      <td className="py-2 pr-3 text-gray-400">{r.role}</td>
                      <td className="py-2 pr-3 text-gray-400">
                        {r.location || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.count > preview.sample.length && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing first {preview.sample.length} of {preview.count}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-2">
              No seekers match these filters.
            </p>
          )}
        </section>
      )}

      {/* Message composer */}
      <section className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Message</h2>
        <p className="text-xs text-gray-500 mb-3">
          Use <code className="text-gray-300">{'{{name}}'}</code> or{' '}
          <code className="text-gray-300">{'{{location}}'}</code> in the body to
          personalise. Plain-text only works inside the 24-hour session window;
          otherwise provide an approved template name.
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Hi {{name}}, new jobs just dropped in {{location}}. Check them at https://joblinca.com/jobs"
          className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="grid md:grid-cols-3 gap-4 mt-4">
          <Field
            label="Template name (optional)"
            value={templateName}
            onChange={setTemplateName}
            placeholder="e.g. weekly_roundup_v1"
          />
          <Field
            label="Template language"
            value={templateLanguage}
            onChange={setTemplateLanguage}
            placeholder="en"
          />
          <NumberField
            label="Max recipients"
            value={maxRecipients}
            onChange={setMaxRecipients}
          />
          <NumberField
            label="Batch size"
            value={batchSize}
            onChange={setBatchSize}
          />
          <NumberField
            label="Delay between batches (ms)"
            value={delayMs}
            onChange={setDelayMs}
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={loadingSend || !preview || preview.count === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loadingSend ? 'Sending...' : 'Send blast'}
          </button>
        </div>
      </section>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {sendResult && (
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white">Send result</h2>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
            <Stat label="Matched" value={sendResult.matched} />
            <Stat label="Attempted" value={sendResult.attempted} />
            <Stat label="Sent" value={sendResult.sent} tone="good" />
            <Stat label="Failed" value={sendResult.failed} tone="bad" />
          </dl>
          {sendResult.errors && sendResult.errors.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-gray-400 cursor-pointer">
                {sendResult.errors.length} failure(s) — expand
              </summary>
              <ul className="mt-2 text-xs text-gray-400 space-y-1">
                {sendResult.errors.slice(0, 100).map((err, idx) => (
                  <li key={idx} className="font-mono">
                    {err.phone}: {err.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-300 mb-1">{props.label}</label>
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {props.hint && (
        <p className="text-xs text-gray-500 mt-1">{props.hint}</p>
      )}
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-300 mb-1">{props.label}</label>
      <input
        type="number"
        min={0}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function Stat(props: {
  label: string;
  value: number | undefined;
  tone?: 'good' | 'bad';
}) {
  const color =
    props.tone === 'good'
      ? 'text-green-400'
      : props.tone === 'bad'
        ? 'text-red-400'
        : 'text-white';
  return (
    <div>
      <dt className="text-xs text-gray-500 uppercase">{props.label}</dt>
      <dd className={`text-xl font-semibold ${color}`}>
        {props.value ?? '—'}
      </dd>
    </div>
  );
}
