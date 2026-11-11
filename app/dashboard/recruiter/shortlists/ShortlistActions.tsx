'use client';

import { useState } from 'react';
import PaymentModal from '@/app/components/PaymentModal';

export interface ShortlistPlan {
  id: string;
  slug: string;
  name: string;
  amount_xaf: number;
  duration_days: number | null;
  description: string | null;
}

const SUCCESS_HREF = '/dashboard/recruiter/shortlists?paid=1';

function fcfa(amount: number) {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

export function GetShortlist({
  jobs,
  plans,
  copy,
}: {
  jobs: Array<{ id: string; title: string }>;
  plans: ShortlistPlan[];
  copy: { title: string; subtitle: string; job: string; noJobs: string };
}) {
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '');
  const [plan, setPlan] = useState<ShortlistPlan | null>(null);

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-800 p-5">
      <h2 className="text-lg font-semibold text-white">{copy.title}</h2>
      <p className="mt-1 text-sm text-gray-400">{copy.subtitle}</p>

      {jobs.length === 0 || plans.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{copy.noJobs}</p>
      ) : (
        <>
          <label className="mt-4 block max-w-md">
            <span className="mb-1 block text-xs text-gray-400">{copy.job}</span>
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setPlan(p)}
                disabled={!jobId}
                className="rounded-xl border border-gray-700 bg-gray-900 p-4 text-left transition-colors hover:border-primary-500/60 disabled:opacity-50"
              >
                <p className="font-semibold text-white">{p.name}</p>
                <p className="mt-1 text-xl font-bold text-primary-300">{fcfa(p.amount_xaf)}</p>
                {p.description && <p className="mt-2 text-sm text-gray-400">{p.description}</p>}
              </button>
            ))}
          </div>
        </>
      )}

      {plan && jobId && (
        <PaymentModal
          plan={plan}
          jobId={jobId}
          successHref={SUCCESS_HREF}
          onClose={() => setPlan(null)}
        />
      )}
    </section>
  );
}

export function PayFeeButton({
  hireId,
  amountXaf,
  label,
  planName,
}: {
  hireId: string;
  amountXaf: number;
  label: string;
  planName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-500"
      >
        {label} {fcfa(amountXaf)}
      </button>
      {open && (
        <PaymentModal
          plan={{ id: hireId, slug: 'hire_fee', name: planName, amount_xaf: amountXaf, duration_days: null }}
          hireFeeId={hireId}
          successHref={SUCCESS_HREF}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
