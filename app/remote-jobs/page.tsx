'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import {
  Globe,
  MapPin,
  Briefcase,
  Clock,
  ExternalLink,
  DollarSign,
  Tag,
  ArrowRight,
  Search,
  Filter,
  X,
  AlertTriangle,
  Bell,
  ChevronDown,
  Loader2,
  Info,
} from 'lucide-react';

interface ExternalJob {
  id: string;
  external_id: string;
  source: string;
  title: string;
  company_name: string | null;
  company_logo: string | null;
  location: string | null;
  salary: string | null;
  job_type: string | null;
  category: string | null;
  url: string;
  fetched_at: string;
}

const CATEGORY_TABS = [
  'All',
  'Engineering',
  'Marketing',
  'Design',
  'Customer Support',
  'Sales',
  'Product',
  'Data & Analytics',
  'Finance',
  'HR & Recruiting',
  'Writing',
  'Teaching',
  'QA & Testing',
  'Security',
  'Operations',
  'Internships & Entry Level',
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'remotive', label: 'Remotive' },
  { value: 'jobicy', label: 'Jobicy' },
  { value: 'findwork', label: 'Findwork' },
];

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sourceLabel(source: string) {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export default function RemoteJobsPage() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (activeCategory !== 'All') params.set('category', activeCategory);
      if (sourceFilter) params.set('source', sourceFilter);
      params.set('limit', '200');

      const res = await fetch(`/api/external-jobs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeCategory, sourceFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(30);
  }, [searchQuery, activeCategory, sourceFilter]);

  const visibleJobs = useMemo(() => jobs.slice(0, visibleCount), [jobs, visibleCount]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJobs();
  };

  const clearFilters = () => {
    setSearchQuery('');
    setActiveCategory('All');
    setSourceFilter('');
  };

  const hasActiveFilters = searchQuery || activeCategory !== 'All' || sourceFilter;

  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Header */}
      <section className="bg-gradient-to-b from-primary-600/10 to-neutral-950 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary-400" />
            </div>
            <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm font-medium">
              {t("remote.badge")}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            {t("remote.title")}
          </h1>
          <p className="text-neutral-400 max-w-2xl text-lg mb-6">
            {t("remote.subtitle")}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500">
            <span className="flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              {total} {t("remote.opportunities", { count: total }).replace(String(total), '').trim()}
            </span>
            <span className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Remotive + Jobicy + Findwork
            </span>
          </div>
        </div>
      </section>

      {/* Disclaimer Notice */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-neutral-400">
            <p>
              <span className="text-amber-300 font-medium">How it works:</span>{' '}
              Remote jobs are sourced from trusted partner platforms (Remotive, Jobicy, Findwork).
              When you apply, you will be redirected to the original listing. Joblinca vets sources
              but cannot guarantee hiring outcomes. Always verify employers independently.
            </p>
          </div>
        </div>
      </section>

      {/* Search & Filters - Sticky on mobile */}
      <section className="sticky top-0 z-30 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search remote jobs by title..."
                className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-primary-600/10 border-primary-500/30 text-primary-400'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
            </button>
          </form>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="flex flex-wrap items-center gap-3 mb-4 pb-4 border-b border-neutral-800/50">
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-300 focus:outline-none focus:border-primary-500"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all
                </button>
              )}
            </div>
          )}

          {/* Category Tabs - Horizontally scrollable */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${
                  activeCategory === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-neutral-800/60 text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Job Listings */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-4" />
            <p className="text-neutral-500">Loading remote opportunities...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-6">
              <Globe className="w-10 h-10 text-neutral-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">
              {hasActiveFilters ? 'No matching jobs' : t("remote.noJobs")}
            </h2>
            <p className="text-neutral-400 mb-8 max-w-md mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search or filters to see more results.'
                : t("remote.noJobsDesc")}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
              >
                Clear Filters
              </button>
            ) : (
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
              >
                {t("remote.browseLocal")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Results count */}
            <p className="text-sm text-neutral-500 mb-4">
              Showing {visibleJobs.length} of {jobs.length} jobs
              {hasActiveFilters && ' (filtered)'}
            </p>

            <div className="space-y-3">
              {visibleJobs.map((job) => (
                <div
                  key={`${job.source}-${job.external_id}`}
                  className="group bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6 hover:border-primary-600/50 hover:bg-neutral-800/50 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Company Icon */}
                    <div className="hidden sm:flex w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600/20 to-accent-500/20 border border-primary-600/30 items-center justify-center shrink-0">
                      {job.company_logo ? (
                        <img src={job.company_logo} alt="" className="w-8 h-8 rounded object-contain" />
                      ) : (
                        <Globe className="w-6 h-6 text-primary-400" />
                      )}
                    </div>

                    {/* Job Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2 className="text-lg font-semibold text-white line-clamp-1">
                          {job.title}
                        </h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full text-xs font-medium">
                          <Globe className="w-3 h-3" />
                          {t("remote.remote")}
                        </span>
                      </div>

                      <p className="text-neutral-300 text-sm font-medium mb-2">
                        {job.company_name || 'Unknown company'}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500 mb-3">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{job.location || t("remote.worldwide")}</span>
                        </div>
                        {job.category && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5" />
                            <span>{job.category}</span>
                          </div>
                        )}
                        {job.job_type && (
                          <div className="flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5" />
                            <span>{job.job_type}</span>
                          </div>
                        )}
                        {job.salary && (
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{job.salary}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatDate(job.fetched_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Apply Button */}
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-xs text-neutral-600 hidden lg:inline">
                        via {sourceLabel(job.source)}
                      </span>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all"
                      >
                        {t("remote.applyOn", { source: sourceLabel(job.source) })}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More */}
            {visibleCount < jobs.length && (
              <div className="text-center mt-8">
                <button
                  type="button"
                  onClick={() => setVisibleCount((v) => v + 30)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-medium transition-colors"
                >
                  Show More
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Attribution */}
      {jobs.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
          <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg text-center">
            <p className="text-sm text-neutral-500">
              {t("remote.attribution")}{' '}
              <a href="https://remotive.com" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">Remotive</a>,{' '}
              <a href="https://jobicy.com" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">Jobicy</a>, and{' '}
              <a href="https://findwork.dev" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300">Findwork</a>.{' '}
              {t("remote.attributionSuffix")}
            </p>
          </div>
        </section>
      )}

      {/* Remote Job Alerts CTA */}
      <section className="bg-gradient-to-b from-neutral-950 to-neutral-900 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="bg-gradient-to-br from-primary-600/10 to-accent-500/10 border border-primary-600/20 rounded-2xl p-6 sm:p-10 text-center">
            <div className="w-14 h-14 rounded-xl bg-primary-600/20 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-7 h-7 text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Get Remote Job Alerts</h2>
            <p className="text-neutral-400 mb-6 max-w-md mx-auto">
              Be the first to know when new remote opportunities match your skills.
              Sign up to receive daily alerts via email or WhatsApp.
            </p>
            <Link
              href="/auth/register?role=candidate"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
            >
              <Bell className="w-5 h-5" />
              Sign Up for Alerts
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Local Jobs CTA */}
      <section className="bg-neutral-900 border-t border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            {t("remote.ctaTitle")}
          </h2>
          <p className="text-neutral-400 mb-8 max-w-lg mx-auto">
            {t("remote.ctaDesc")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold transition-all"
            >
              Browse Local Jobs
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/register?role=candidate"
              className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium"
            >
              {t("remote.createProfile")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
