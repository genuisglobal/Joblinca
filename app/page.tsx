'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from '@/lib/i18n';
import {
  Briefcase,
  MapPin,
  Clock,
  Users,
  FileText,
  CheckCircle,
  ArrowRight,
  Building2,
  Globe,
  Zap,
  Search,
  Star,
  TrendingUp,
  Shield,
  Sparkles,
  Quote
} from 'lucide-react';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  job_type: string | null;
  salary: number | null;
  created_at: string;
  is_remote: boolean | null;
  work_type: string | null;
  isSample?: boolean;
}

const SAMPLE_JOBS: Job[] = [
  {
    id: 'sample-1',
    title: 'Marketing Manager',
    company_name: 'TechHub Africa',
    location: 'Douala, Cameroon',
    job_type: 'job',
    salary: null,
    created_at: new Date().toISOString(),
    is_remote: false,
    work_type: 'onsite',
    isSample: true,
  },
  {
    id: 'sample-2',
    title: 'Full-Stack Developer',
    company_name: 'JobGenius Inc.',
    location: 'Yaound\u00e9, Cameroon',
    job_type: 'job',
    salary: null,
    created_at: new Date().toISOString(),
    is_remote: false,
    work_type: 'hybrid',
    isSample: true,
  },
  {
    id: 'sample-3',
    title: 'Customer Support Specialist',
    company_name: 'Orange Cameroon',
    location: 'Remote',
    job_type: 'job',
    salary: null,
    created_at: new Date().toISOString(),
    is_remote: true,
    work_type: 'remote',
    isSample: true,
  },
];

export default function HomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { t } = useTranslation();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalJobCount, setTotalJobCount] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLocation, setSearchLocation] = useState('');

  useEffect(() => {
    async function loadJobs() {
      // First, get total count of approved jobs
      const { count } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('published', true)
        .eq('approval_status', 'approved');

      const totalJobs = count || 0;
      let fetchedJobs: Job[] = [];

      if (totalJobs > 0 && totalJobs <= 10) {
        const { data } = await supabase
          .from('jobs')
          .select('id, title, company_name, location, job_type, salary, created_at, is_remote, work_type')
          .eq('published', true)
          .eq('approval_status', 'approved')
          .order('created_at', { ascending: false });

        fetchedJobs = data || [];
      } else if (totalJobs > 10) {
        const today = new Date();
        const dayOfYear = Math.floor(
          (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
        );

        const { data: allJobs } = await supabase
          .from('jobs')
          .select('id, title, company_name, location, job_type, salary, created_at, is_remote, work_type')
          .eq('published', true)
          .eq('approval_status', 'approved')
          .order('created_at', { ascending: false });

        if (allJobs && allJobs.length > 0) {
          const shuffled = [...allJobs].sort((a, b) => {
            const hashA = (a.id.charCodeAt(0) + dayOfYear) % 1000;
            const hashB = (b.id.charCodeAt(0) + dayOfYear) % 1000;
            return hashA - hashB;
          });

          const recentJobs = allJobs.slice(0, 2);
          const recentIds = new Set(recentJobs.map(j => j.id));
          const rotatedJobs = shuffled.filter(j => !recentIds.has(j.id)).slice(0, 4);
          fetchedJobs = [...recentJobs, ...rotatedJobs];
        }
      }

      if (fetchedJobs.length === 0) {
        setJobs(SAMPLE_JOBS);
        setTotalJobCount(SAMPLE_JOBS.length);
      } else {
        setJobs(fetchedJobs);
        setTotalJobCount(totalJobs);
      }

      setLoading(false);
    }
    loadJobs();
  }, [supabase]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchKeyword) params.set('q', searchKeyword);
    if (searchLocation) params.set('location', searchLocation);
    router.push(`/jobs?${params.toString()}`);
  };

  return (
    <main className="bg-neutral-950 text-neutral-100">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary-600/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-accent-500/8 rounded-full blur-[100px]" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          {/* Trust Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-800/60 border border-neutral-700/50 text-sm text-neutral-300">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span>{t("home.trustBadge")}</span>
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6 leading-tight text-center">
            {t("home.hero.title")}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-500">
              {t("home.hero.cameroon")}
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed text-center px-4">
            {t("home.hero.subtitle")}
          </p>

          {/* Job Search Bar */}
          <form onSubmit={handleSearch} className="max-w-3xl mx-auto mb-8">
            <div className="flex flex-col sm:flex-row gap-3 p-3 bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-2xl">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={t("home.hero.searchPlaceholder")}
                  className="w-full pl-12 pr-4 py-3.5 sm:py-4 bg-neutral-800/50 border border-neutral-700/50 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-base"
                />
              </div>
              <div className="flex-1 relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  type="text"
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  placeholder={t("home.hero.locationPlaceholder")}
                  className="w-full pl-12 pr-4 py-3.5 sm:py-4 bg-neutral-800/50 border border-neutral-700/50 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-base"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-8 py-3.5 sm:py-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-primary-600/25 text-base flex items-center justify-center gap-2"
              >
                <Search className="w-5 h-5" />
                <span>{t("home.hero.searchButton")}</span>
              </button>
            </div>

            {/* Popular Searches */}
            <div className="flex flex-wrap justify-center gap-2 mt-4 px-2">
              <span className="text-neutral-500 text-sm">{t("home.hero.popular")}</span>
              {['Developer', 'Marketing', 'Remote', 'Douala', 'Yaound\u00e9'].map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    if (term === 'Remote') {
                      setSearchLocation('Remote');
                    } else if (term === 'Douala' || term === 'Yaound\u00e9') {
                      setSearchLocation(term);
                    } else {
                      setSearchKeyword(term);
                    }
                  }}
                  className="px-3 py-1 text-sm text-neutral-400 hover:text-white bg-neutral-800/50 hover:bg-neutral-800 rounded-full transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </form>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-10">
            <Link
              href="/jobs"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25 text-base"
            >
              <Briefcase className="w-5 h-5" />
              {t("home.hero.browseAll")}
            </Link>
            <Link
              href="/recruiter/post-job"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-neutral-300 hover:text-white px-6 py-4 font-medium transition-colors text-base"
            >
              <Building2 className="w-5 h-5" />
              {t("home.hero.imHiring")}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Quick Value Props */}
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 text-sm text-neutral-400">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>{t("home.hero.freeForSeekers")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent-400" />
              <span>{t("home.hero.getMatched")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary-400" />
              <span>{t("home.hero.localRemote")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-8 sm:py-12 px-4 sm:px-6 bg-neutral-900/50 border-y border-neutral-800/50">
        <div className="max-w-5xl mx-auto">
          <p className="text-neutral-500 text-xs sm:text-sm uppercase tracking-wider text-center mb-6">
            {t("home.trust.title")}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12">
            <Image
              src="/partners/mtn.png"
              alt="MTN Cameroon"
              width={70}
              height={35}
              className="object-contain opacity-50 hover:opacity-80 transition-opacity"
            />
            <Image
              src="/partners/orange.png"
              alt="Orange Cameroon"
              width={70}
              height={40}
              className="object-contain opacity-50 hover:opacity-80 transition-opacity"
            />
            <span className="text-neutral-500 font-medium opacity-50 hover:opacity-80 transition-opacity">JobGenius</span>
            <span className="text-neutral-500 font-medium opacity-50 hover:opacity-80 transition-opacity">TechHub Africa</span>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <p className="text-neutral-500 text-xs sm:text-sm uppercase tracking-wider text-center mb-8">
            {t("home.testimonials.title")}
          </p>
          <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
            {([1, 2, 3] as const).map((i) => {
              const colors = { 1: 'primary', 2: 'accent', 3: 'green' } as const;
              const color = colors[i];
              return (
                <div
                  key={i}
                  className="relative bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 flex flex-col"
                >
                  <Quote
                    className={`w-8 h-8 mb-4 ${
                      color === 'primary'
                        ? 'text-primary-500/30'
                        : color === 'accent'
                        ? 'text-accent-500/30'
                        : 'text-green-500/30'
                    }`}
                  />
                  <p className="text-neutral-300 text-sm leading-relaxed mb-6 flex-1">
                    &ldquo;{t(`home.testimonials.${i}.quote`)}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                        color === 'primary'
                          ? 'bg-primary-600/20 text-primary-400'
                          : color === 'accent'
                          ? 'bg-accent-500/20 text-accent-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}
                    >
                      {t(`home.testimonials.${i}.name`).charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-200">{t(`home.testimonials.${i}.name`)}</p>
                      <p className="text-xs text-neutral-500">{t(`home.testimonials.${i}.role`)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured Jobs Section */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 sm:mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                {totalJobCount <= 10 ? t("home.featured.allAvailable") : t("home.featured.todaysFeatured")}
              </h2>
              <p className="text-neutral-400">
                {totalJobCount <= 10
                  ? t("home.featured.rolesFromVerified", { count: totalJobCount, label: totalJobCount === 1 ? 'role' : 'roles' })
                  : t("home.featured.freshPicks")}
              </p>
            </div>
            {totalJobCount > 10 && (
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium transition-colors"
              >
                {t("home.featured.viewAll", { count: totalJobCount })}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-neutral-800/30 rounded-xl p-6 animate-pulse">
                  <div className="h-12 w-12 bg-neutral-700 rounded-lg mb-4" />
                  <div className="h-6 bg-neutral-700 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-neutral-700 rounded w-1/2 mb-4" />
                  <div className="h-4 bg-neutral-700 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : jobs.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={job.isSample ? '/auth/register?role=candidate' : `/jobs/${job.id}`}
                  className="group bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 sm:p-6 hover:border-primary-600/50 hover:bg-neutral-800/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center">
                      <Briefcase className="w-6 h-6 text-primary-400" />
                    </div>
                    {(job.is_remote || job.work_type === 'remote') && (
                      <span className="px-2.5 py-1 text-xs font-medium bg-green-500/10 text-green-400 rounded-full">
                        {t("home.featured.remote")}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold mb-2 group-hover:text-primary-400 transition-colors line-clamp-1">
                    {job.title}
                  </h3>

                  {job.company_name && (
                    <p className="text-neutral-400 text-sm mb-3">{job.company_name}</p>
                  )}

                  <div className="flex flex-wrap gap-3 text-sm text-neutral-500">
                    {job.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>{job.location}</span>
                      </div>
                    )}
                    {job.job_type && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span className="capitalize">{job.job_type}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-800">
                    <span className="text-primary-400 text-sm font-medium group-hover:underline">
                      {job.isSample ? t("home.featured.signUpToApply") : t("home.featured.viewDetails")}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-neutral-900/30 rounded-xl border border-neutral-800/50">
              <Briefcase className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-400 mb-4">{t("home.featured.newJobsDaily")}</p>
              <Link
                href="/auth/register?role=candidate"
                className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium"
              >
                {t("home.featured.signUpNotified")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* CV Builder */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-gradient-to-b from-neutral-900 to-neutral-950">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-gradient-to-br from-primary-600/15 via-primary-600/10 to-accent-500/15 border border-primary-600/20 rounded-2xl p-6 sm:p-10 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8">
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-600/20 text-primary-400 text-sm font-medium mb-4">
                  <Sparkles className="w-4 h-4" />
                  {t("home.cv.freeTool")}
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t("home.cv.title")}
                </h2>
                <p className="text-neutral-300 mb-6 leading-relaxed">
                  {t("home.cv.subtitle")}
                </p>

                <ul className="space-y-2 text-neutral-300 mb-8 text-left">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span>{t("home.cv.benefit1")}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span>{t("home.cv.benefit2")}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span>{t("home.cv.benefit3")}</span>
                  </li>
                </ul>

                <Link
                  href="/resume"
                  className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25 text-base"
                >
                  <FileText className="w-5 h-5" />
                  {t("home.cv.cta")}
                </Link>
              </div>

              <div className="w-full lg:w-64 h-48 lg:h-72 bg-neutral-800/50 rounded-xl border border-neutral-700/50 flex items-center justify-center">
                <FileText className="w-16 h-16 text-neutral-600" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t("home.howItWorks.title")}</h2>
            <p className="text-neutral-400 max-w-xl mx-auto">
              {t("home.howItWorks.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                step: '1',
                title: t("home.howItWorks.step1.title"),
                description: t("home.howItWorks.step1.desc"),
                icon: Users,
                color: 'primary',
              },
              {
                step: '2',
                title: t("home.howItWorks.step2.title"),
                description: t("home.howItWorks.step2.desc"),
                icon: Zap,
                color: 'accent',
              },
              {
                step: '3',
                title: t("home.howItWorks.step3.title"),
                description: t("home.howItWorks.step3.desc"),
                icon: CheckCircle,
                color: 'green',
              },
            ].map((item, index) => (
              <div key={index} className="relative text-center">
                <div className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center ${
                  item.color === 'primary' ? 'bg-primary-600/15 border border-primary-600/30' :
                  item.color === 'accent' ? 'bg-accent-500/15 border border-accent-500/30' :
                  'bg-green-500/15 border border-green-500/30'
                }`}>
                  <item.icon className={`w-7 h-7 ${
                    item.color === 'primary' ? 'text-primary-400' :
                    item.color === 'accent' ? 'text-accent-400' :
                    'text-green-400'
                  }`} />
                </div>
                <div className="text-4xl font-bold text-neutral-800 absolute top-0 right-1/4 -translate-y-2">{item.step}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Job Seekers & Recruiters */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-900">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {/* Job Seekers */}
            <div className="bg-gradient-to-br from-primary-600/10 to-transparent border border-primary-600/20 rounded-2xl p-6 sm:p-8">
              <div className="w-14 h-14 rounded-xl bg-primary-600/20 flex items-center justify-center mb-6">
                <TrendingUp className="w-7 h-7 text-primary-400" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-4">{t("home.seekers.title")}</h3>
              <p className="text-neutral-400 mb-6">{t("home.seekers.subtitle")}</p>
              <ul className="space-y-3 text-neutral-300 mb-8">
                {[1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>{t(`home.seekers.benefit${i}`)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register?role=candidate"
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3.5 rounded-xl font-semibold transition-all text-base"
              >
                {t("home.seekers.cta")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Recruiters */}
            <div className="bg-gradient-to-br from-accent-500/10 to-transparent border border-accent-500/20 rounded-2xl p-6 sm:p-8">
              <div className="w-14 h-14 rounded-xl bg-accent-500/20 flex items-center justify-center mb-6">
                <Shield className="w-7 h-7 text-accent-400" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-4">{t("home.recruiters.title")}</h3>
              <p className="text-neutral-400 mb-6">{t("home.recruiters.subtitle")}</p>
              <ul className="space-y-3 text-neutral-300 mb-8">
                {[1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span>{t(`home.recruiters.benefit${i}`)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/recruiter/post-job"
                className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-neutral-900 px-6 py-3.5 rounded-xl font-semibold transition-all text-base"
              >
                {t("home.recruiters.cta")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6">
            {t("home.finalCta.title")}
          </h2>
          <p className="text-neutral-400 text-base sm:text-lg mb-10 max-w-xl mx-auto">
            {t("home.finalCta.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/jobs"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25 text-base"
            >
              <Search className="w-5 h-5" />
              {t("home.finalCta.findJobs")}
            </Link>
            <Link
              href="/recruiter/post-job"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-8 py-4 rounded-xl font-semibold transition-all text-base"
            >
              <Building2 className="w-5 h-5" />
              {t("home.finalCta.hireTalent")}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-900 border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-4">
                <Image
                  src="/joblinca-logo.png"
                  alt="JobLinca"
                  width={36}
                  height={36}
                />
                <span className="text-xl font-bold">Joblinca</span>
              </Link>
              <p className="text-neutral-400 text-sm leading-relaxed max-w-xs">
                {t("footer.description")}
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4 text-neutral-200">{t("footer.forJobSeekers")}</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href="/jobs" className="text-neutral-400 hover:text-white transition-colors">
                    {t("footer.browseJobs")}
                  </Link>
                </li>
                <li>
                  <Link href="/resume" className="text-neutral-400 hover:text-white transition-colors">
                    {t("footer.cvBuilder")}
                  </Link>
                </li>
                <li>
                  <Link href="/remote-jobs" className="text-neutral-400 hover:text-white transition-colors">
                    {t("footer.remoteJobs")}
                  </Link>
                </li>
                <li>
                  <Link href="/auth/register?role=candidate" className="text-neutral-400 hover:text-white transition-colors">
                    {t("footer.createAccount")}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4 text-neutral-200">{t("footer.forEmployers")}</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <Link href="/recruiter/post-job" className="text-neutral-400 hover:text-white transition-colors">
                    {t("footer.postAJob")}
                  </Link>
                </li>
                <li>
                  <Link href="/learn-more/recruiters" className="text-neutral-400 hover:text-white transition-colors">
                    {t("footer.howItWorks")}
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-neutral-400 hover:text-white transition-colors">
                    {t("footer.contactSales")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-neutral-500 text-sm">
              &copy; {new Date().getFullYear()} {t("footer.rights")}
            </p>
            <div className="flex items-center gap-4 sm:gap-6 text-sm text-neutral-500">
              <Link href="/privacy" className="hover:text-white transition-colors">{t("footer.privacy")}</Link>
              <Link href="/terms" className="hover:text-white transition-colors">{t("footer.terms")}</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
