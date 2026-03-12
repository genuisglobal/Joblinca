'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TrendingUp, MapPin, Briefcase, BarChart3 } from 'lucide-react';

interface SalaryStats {
  count: number;
  min: number;
  max: number;
  median: number;
  avg: number;
  p25: number;
  p75: number;
}

interface CategoryStat extends SalaryStats {
  category: string;
}

interface LocationStat extends SalaryStats {
  location: string;
}

interface Props {
  overall: SalaryStats | null;
  byCategory: CategoryStat[];
  byLocation: LocationStat[];
  totalJobs: number;
}

function formatSalary(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return amount.toLocaleString();
}

function SalaryBar({ stat, maxVal }: { stat: SalaryStats; maxVal: number }) {
  const leftPct = (stat.p25 / maxVal) * 100;
  const widthPct = ((stat.p75 - stat.p25) / maxVal) * 100;
  const medianPct = (stat.median / maxVal) * 100;

  return (
    <div className="relative h-6 w-full rounded-full bg-neutral-800">
      {/* P25-P75 range */}
      <div
        className="absolute top-0 h-full rounded-full bg-primary-600/30"
        style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` }}
      />
      {/* Median marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-primary-400"
        style={{ left: `${medianPct}%` }}
      />
    </div>
  );
}

export default function SalaryInsightsClient({
  overall,
  byCategory,
  byLocation,
  totalJobs,
}: Props) {
  const [tab, setTab] = useState<'category' | 'location'>('category');

  const maxCategorySalary = byCategory.reduce((m, s) => Math.max(m, s.p75), 0);
  const maxLocationSalary = byLocation.reduce((m, s) => Math.max(m, s.p75), 0);

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Header */}
      <section className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_30%),linear-gradient(180deg,_#101826_0%,_#09090b_100%)]">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600/10">
              <TrendingUp className="h-6 w-6 text-primary-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Salary Insights</h1>
              <p className="text-neutral-400">
                Cameroon job market salary data from {totalJobs} job postings
              </p>
            </div>
          </div>

          {/* Overall stats */}
          {overall && (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Median Salary</p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {formatSalary(overall.median)} <span className="text-sm font-normal text-neutral-500">XAF</span>
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Average</p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {formatSalary(overall.avg)} <span className="text-sm font-normal text-neutral-500">XAF</span>
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">25th Percentile</p>
                <p className="mt-1 text-2xl font-bold text-neutral-300">
                  {formatSalary(overall.p25)} <span className="text-sm font-normal text-neutral-500">XAF</span>
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">75th Percentile</p>
                <p className="mt-1 text-2xl font-bold text-neutral-300">
                  {formatSalary(overall.p75)} <span className="text-sm font-normal text-neutral-500">XAF</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Breakdown */}
      <section className="mx-auto max-w-4xl px-6 py-10">
        {/* Tab switcher */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setTab('category')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'category'
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            By Industry
          </button>
          <button
            onClick={() => setTab('location')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'location'
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <MapPin className="h-4 w-4" />
            By City
          </button>
        </div>

        {tab === 'category' && (
          <div className="space-y-4">
            {byCategory.length === 0 ? (
              <p className="text-neutral-500 text-sm">Not enough salary data yet.</p>
            ) : (
              byCategory.map((stat) => (
                <div
                  key={stat.category}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-white">{stat.category}</h3>
                      <p className="text-xs text-neutral-500">{stat.count} jobs</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary-400">
                        {formatSalary(stat.median)} XAF
                      </p>
                      <p className="text-xs text-neutral-500">median</p>
                    </div>
                  </div>
                  <SalaryBar stat={stat} maxVal={maxCategorySalary * 1.1} />
                  <div className="mt-2 flex justify-between text-xs text-neutral-500">
                    <span>{formatSalary(stat.min)}</span>
                    <span>P25: {formatSalary(stat.p25)} — P75: {formatSalary(stat.p75)}</span>
                    <span>{formatSalary(stat.max)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'location' && (
          <div className="space-y-4">
            {byLocation.length === 0 ? (
              <p className="text-neutral-500 text-sm">Not enough salary data yet.</p>
            ) : (
              byLocation.map((stat) => (
                <div
                  key={stat.location}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-white">{stat.location}</h3>
                      <p className="text-xs text-neutral-500">{stat.count} jobs</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary-400">
                        {formatSalary(stat.median)} XAF
                      </p>
                      <p className="text-xs text-neutral-500">median</p>
                    </div>
                  </div>
                  <SalaryBar stat={stat} maxVal={maxLocationSalary * 1.1} />
                  <div className="mt-2 flex justify-between text-xs text-neutral-500">
                    <span>{formatSalary(stat.min)}</span>
                    <span>P25: {formatSalary(stat.p25)} — P75: {formatSalary(stat.p75)}</span>
                    <span>{formatSalary(stat.max)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex items-start gap-3">
            <BarChart3 className="h-5 w-5 text-neutral-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-neutral-400">
                Salary data is aggregated from published job postings on Joblinca.
                Figures may not represent total compensation packages. Categories
                with fewer than 2 data points are excluded.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/jobs"
            className="text-sm text-neutral-400 hover:text-white transition-colors"
          >
            Browse all jobs on Joblinca
          </Link>
        </div>
      </section>
    </main>
  );
}
