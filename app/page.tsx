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
  Quote,
  MessageCircle,
  Bell,
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
    location: 'Yaoundé, Cameroon',
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

const CITIES = [
  { name: 'Douala', emoji: '🏙️' },
  { name: 'Yaoundé', emoji: '🏛️' },
  { name: 'Bafoussam', emoji: '🌿' },
  { name: 'Limbé', emoji: '🌊' },
  { name: 'Buea', emoji: '🏔️' },
  { name: 'Kribi', emoji: '🏖️' },
  { name: 'Remote', emoji: '🌐' },
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

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* Background glow blobs */}
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-neutral-900/80 to-neutral-950" />
        <div className="absolute top-1/4 left-0 w-[600px] h-[600px] bg-primary-600/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-accent-500/6 rounded-full blur-[120px]" />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-16 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">

            {/* LEFT — Copy + Search */}
            <div>
              {/* Trust pill */}
              <div className="flex mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-800/70 border border-neutral-700/50 text-sm text-neutral-300">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <span>{t('home.trustBadge')}</span>
                </div>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-5">
                {t('home.hero.title')}
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-400 via-primary-400 to-primary-500">
                  {t('home.hero.titleHighlight')}
                </span>
              </h1>

              <p className="text-lg text-neutral-400 mb-8 leading-relaxed max-w-lg">
                {t('home.hero.subtitle')}
              </p>

              {/* Search bar */}
              <form onSubmit={handleSearch} className="mb-6">
                <div className="flex flex-col sm:flex-row gap-3 p-3 bg-neutral-900/90 backdrop-blur-sm border border-neutral-800 rounded-2xl">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder={t('home.hero.searchPlaceholder')}
                      className="w-full pl-12 pr-4 py-3.5 bg-neutral-800/60 border border-neutral-700/50 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-base"
                    />
                  </div>
                  <div className="flex-1 relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                    <input
                      type="text"
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      placeholder={t('home.hero.locationPlaceholder')}
                      className="w-full pl-12 pr-4 py-3.5 bg-neutral-800/60 border border-neutral-700/50 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-base"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-8 py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-primary-600/25 flex items-center justify-center gap-2"
                  >
                    <Search className="w-5 h-5" />
                    {t('home.hero.searchButton')}
                  </button>
                </div>

                {/* Popular searches */}
                <div className="flex flex-wrap gap-2 mt-3 px-1">
                  <span className="text-neutral-500 text-sm">{t('home.hero.popular')}</span>
                  {['Developer', 'Marketing', 'Douala', 'Yaoundé', 'Remote'].map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => {
                        if (term === 'Remote' || term === 'Douala' || term === 'Yaoundé') {
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

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row items-start gap-3 mb-8">
                <Link
                  href="/jobs"
                  className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-7 py-3.5 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
                >
                  <Briefcase className="w-5 h-5" />
                  {t('home.hero.browseAll')}
                </Link>
                <Link
                  href="/recruiter/post-job"
                  className="inline-flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 hover:text-white px-7 py-3.5 rounded-xl font-semibold transition-all"
                >
                  <Building2 className="w-5 h-5" />
                  {t('home.hero.imHiring')}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Value props */}
              <div className="flex flex-wrap gap-5 text-sm text-neutral-400">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>{t('home.hero.freeForSeekers')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-green-400" />
                  <span>{t('home.hero.getMatched')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary-400" />
                  <span>{t('home.hero.localRemote')}</span>
                </div>
              </div>
            </div>

            {/* RIGHT — Community image */}
            <div className="relative hidden lg:block">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/50 aspect-[4/3]">
                <Image
                  src="/assets/hero-community.png"
                  alt="Cameroon professionals using Joblinca"
                  fill
                  className="object-cover object-top"
                  priority
                  sizes="(max-width: 1280px) 50vw, 640px"
                />
                {/* Bottom gradient to blend into page */}
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/40 via-transparent to-transparent" />
              </div>

              {/* Floating: live jobs badge */}
              <div className="absolute -bottom-4 -left-4 bg-neutral-900/95 backdrop-blur-sm border border-neutral-800 rounded-xl px-4 py-3 shadow-xl">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs text-green-400 font-medium uppercase tracking-wide">Live</span>
                </div>
                <p className="text-white font-bold text-lg leading-none">
                  {totalJobCount > 0 ? `${totalJobCount}+` : '1,200+'} {t('home.stats.jobs')}
                </p>
              </div>

              {/* Floating: WhatsApp alerts badge */}
              <div className="absolute -top-3 -right-3 bg-neutral-900/95 backdrop-blur-sm border border-green-500/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-green-400 font-semibold">WhatsApp Alerts</p>
                  <p className="text-xs text-neutral-400">Get notified instantly</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ──────────────────────────────────────────────────── */}
      <section className="py-10 px-4 sm:px-6 bg-neutral-900 border-y border-neutral-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-white">
                {totalJobCount > 0 ? `${totalJobCount}+` : '1,200+'}
              </p>
              <p className="text-sm text-neutral-400 mt-1">{t('home.stats.jobs')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">20+</p>
              <p className="text-sm text-neutral-400 mt-1">{t('home.stats.cities')}</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">500+</p>
              <p className="text-sm text-neutral-400 mt-1">{t('home.stats.companies')}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-xl font-bold text-yellow-400">MTN</span>
                <span className="text-neutral-600 font-medium">&</span>
                <span className="text-xl font-bold text-orange-400">Orange</span>
              </div>
              <p className="text-sm text-neutral-400">{t('home.stats.payment')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CITY QUICK LINKS ─────────────────────────────────────────────── */}
      <section className="py-8 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs sm:text-sm text-neutral-500 uppercase tracking-wider mb-5">
            {t('home.cities.title')}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {CITIES.map((city) => (
              <Link
                key={city.name}
                href={`/jobs?location=${encodeURIComponent(city.name)}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-primary-600/40 rounded-full text-sm text-neutral-300 hover:text-white transition-all"
              >
                <span>{city.emoji}</span>
                <span>{city.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST SIGNALS ────────────────────────────────────────────────── */}
      <section className="py-8 sm:py-10 px-4 sm:px-6 bg-neutral-900/40 border-y border-neutral-800/40">
        <div className="max-w-5xl mx-auto">
          <p className="text-neutral-500 text-xs uppercase tracking-widest text-center mb-6">
            {t('home.trust.title')}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-10 sm:gap-16">
            <Image
              src="/partners/mtn.png"
              alt="MTN Cameroon"
              width={70}
              height={35}
              className="object-contain opacity-40 hover:opacity-70 transition-opacity"
            />
            <Image
              src="/partners/orange.png"
              alt="Orange Cameroon"
              width={70}
              height={40}
              className="object-contain opacity-40 hover:opacity-70 transition-opacity"
            />
            <span className="text-neutral-600 font-semibold text-sm opacity-60 hover:opacity-90 transition-opacity">JobGenius</span>
            <span className="text-neutral-600 font-semibold text-sm opacity-60 hover:opacity-90 transition-opacity">TechHub Africa</span>
            <span className="text-neutral-600 font-semibold text-sm opacity-60 hover:opacity-90 transition-opacity">ESSEC Douala</span>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <p className="text-neutral-500 text-xs uppercase tracking-widest text-center mb-10">
            {t('home.testimonials.title')}
          </p>
          <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
            {([1, 2, 3] as const).map((i) => {
              const colorMap = {
                1: { quote: 'text-primary-500/30', avatar: 'bg-primary-600/20 text-primary-400' },
                2: { quote: 'text-accent-500/30', avatar: 'bg-accent-500/20 text-accent-400' },
                3: { quote: 'text-green-500/30', avatar: 'bg-green-500/20 text-green-400' },
              };
              const c = colorMap[i];
              return (
                <div key={i} className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 flex flex-col hover:border-neutral-700 transition-colors">
                  <Quote className={`w-7 h-7 mb-4 ${c.quote}`} />
                  <p className="text-neutral-300 text-sm leading-relaxed mb-6 flex-1">
                    &ldquo;{t(`home.testimonials.${i}.quote`)}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 pt-4 border-t border-neutral-800">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${c.avatar}`}>
                      {t(`home.testimonials.${i}.name`).charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-200">{t(`home.testimonials.${i}.name`)}</p>
                      <p className="text-xs text-neutral-500">{t(`home.testimonials.${i}.role`)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── WHATSAPP SECTION ─────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-900">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-gradient-to-br from-green-600/10 via-green-600/5 to-transparent border border-green-600/20 rounded-2xl p-6 sm:p-10 overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-10">
              {/* Content */}
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-600/20 text-green-400 text-sm font-medium mb-5">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  {t('home.whatsapp.badge')}
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold mb-4 flex items-center gap-3 justify-center lg:justify-start">
                  <MessageCircle className="w-8 h-8 text-green-400 flex-shrink-0" style={{ fill: 'rgba(74,222,128,0.15)' }} />
                  {t('home.whatsapp.title')}
                </h2>

                <p className="text-neutral-300 mb-7 leading-relaxed">{t('home.whatsapp.subtitle')}</p>

                <ul className="space-y-3 text-neutral-300 mb-8 text-left">
                  {[1, 2, 3].map((i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>{t(`home.whatsapp.feature${i}`)}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <Link
                    href="/auth/register?role=candidate"
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-7 py-3.5 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-green-600/25"
                  >
                    <MessageCircle className="w-5 h-5" />
                    {t('home.whatsapp.cta')}
                  </Link>
                  <p className="text-sm text-neutral-500">{t('home.whatsapp.note')}</p>
                </div>
              </div>

              {/* Icon illustration */}
              <div className="flex-shrink-0 w-40 h-40 lg:w-52 lg:h-52 relative flex items-center justify-center">
                <div className="w-36 h-36 lg:w-44 lg:h-44 rounded-full bg-green-500/8 border border-green-500/15 flex items-center justify-center">
                  <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-green-500/12 border border-green-500/20 flex items-center justify-center">
                    <MessageCircle className="w-14 h-14 lg:w-16 lg:h-16 text-green-400" style={{ fill: 'rgba(74,222,128,0.12)' }} />
                  </div>
                </div>
                {/* Notification ping */}
                <div className="absolute top-2 right-2 w-10 h-10 bg-neutral-800 border border-neutral-700 rounded-xl flex items-center justify-center shadow-lg">
                  <Bell className="w-5 h-5 text-green-400" />
                </div>
                <div className="absolute bottom-4 left-0 w-10 h-10 bg-neutral-800 border border-neutral-700 rounded-xl flex items-center justify-center shadow-lg">
                  <Briefcase className="w-5 h-5 text-primary-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED JOBS ────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                {totalJobCount <= 10 ? t('home.featured.allAvailable') : t('home.featured.todaysFeatured')}
              </h2>
              <p className="text-neutral-400">
                {totalJobCount <= 10
                  ? t('home.featured.rolesFromVerified', { count: totalJobCount, label: totalJobCount === 1 ? 'role' : 'roles' })
                  : t('home.featured.freshPicks')}
              </p>
            </div>
            {totalJobCount > 10 && (
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium transition-colors"
              >
                {t('home.featured.viewAll', { count: totalJobCount })}
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
                        {t('home.featured.remote')}
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
                      {job.isSample ? t('home.featured.signUpToApply') : t('home.featured.viewDetails')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-neutral-900/30 rounded-xl border border-neutral-800/50">
              <Briefcase className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-400 mb-4">{t('home.featured.newJobsDaily')}</p>
              <Link
                href="/auth/register?role=candidate"
                className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium"
              >
                {t('home.featured.signUpNotified')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── CV BUILDER ───────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-gradient-to-b from-neutral-900 to-neutral-950">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-gradient-to-br from-primary-600/15 via-primary-600/8 to-accent-500/10 border border-primary-600/20 rounded-2xl p-6 sm:p-10 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="relative z-10 flex flex-col lg:flex-row items-center gap-8">
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-600/20 text-primary-400 text-sm font-medium mb-5">
                  <Sparkles className="w-4 h-4" />
                  {t('home.cv.freeTool')}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t('home.cv.title')}</h2>
                <p className="text-neutral-300 mb-6 leading-relaxed">{t('home.cv.subtitle')}</p>
                <ul className="space-y-2.5 text-neutral-300 mb-8 text-left">
                  {[1, 2, 3].map((i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <span>{t(`home.cv.benefit${i}`)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/resume"
                  className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
                >
                  <FileText className="w-5 h-5" />
                  {t('home.cv.cta')}
                </Link>
              </div>

              <div className="w-full lg:w-60 h-48 lg:h-64 bg-neutral-800/50 rounded-xl border border-neutral-700/50 flex items-center justify-center">
                <FileText className="w-16 h-16 text-neutral-600" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t('home.howItWorks.title')}</h2>
            <p className="text-neutral-400 max-w-xl mx-auto">{t('home.howItWorks.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: t('home.howItWorks.step1.title'), desc: t('home.howItWorks.step1.desc'), icon: Users, color: 'primary' },
              { step: '02', title: t('home.howItWorks.step2.title'), desc: t('home.howItWorks.step2.desc'), icon: Zap, color: 'accent' },
              { step: '03', title: t('home.howItWorks.step3.title'), desc: t('home.howItWorks.step3.desc'), icon: CheckCircle, color: 'green' },
            ].map((item) => (
              <div key={item.step} className="relative text-center group">
                <div className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center transition-all group-hover:scale-105 ${
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
                <p className="text-5xl font-black text-neutral-800/60 absolute -top-2 right-1/4 select-none">{item.step}</p>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR SEEKERS & RECRUITERS ─────────────────────────────────────── */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-neutral-900">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {/* Job Seekers */}
            <div className="bg-gradient-to-br from-primary-600/10 to-transparent border border-primary-600/20 rounded-2xl p-6 sm:p-8">
              <div className="w-14 h-14 rounded-xl bg-primary-600/20 flex items-center justify-center mb-6">
                <TrendingUp className="w-7 h-7 text-primary-400" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3">{t('home.seekers.title')}</h3>
              <p className="text-neutral-400 mb-6">{t('home.seekers.subtitle')}</p>
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
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3.5 rounded-xl font-semibold transition-all"
              >
                {t('home.seekers.cta')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Recruiters */}
            <div className="bg-gradient-to-br from-accent-500/10 to-transparent border border-accent-500/20 rounded-2xl p-6 sm:p-8">
              <div className="w-14 h-14 rounded-xl bg-accent-500/20 flex items-center justify-center mb-6">
                <Shield className="w-7 h-7 text-accent-400" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3">{t('home.recruiters.title')}</h3>
              <p className="text-neutral-400 mb-6">{t('home.recruiters.subtitle')}</p>
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
                className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-neutral-900 px-6 py-3.5 rounded-xl font-semibold transition-all"
              >
                {t('home.recruiters.cta')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-neutral-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600/5 via-transparent to-accent-500/5 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-800/70 border border-neutral-700/50 text-sm text-neutral-300 mb-6">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Open to all Cameroonians — Anywhere in the world</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            {t('home.finalCta.title')}
          </h2>
          <p className="text-neutral-400 text-base sm:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            {t('home.finalCta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/jobs"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25 text-base"
            >
              <Search className="w-5 h-5" />
              {t('home.finalCta.findJobs')}
            </Link>
            <Link
              href="/recruiter/post-job"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-8 py-4 rounded-xl font-semibold transition-all text-base"
            >
              <Building2 className="w-5 h-5" />
              {t('home.finalCta.hireTalent')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
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
              <p className="text-neutral-400 text-sm leading-relaxed max-w-xs mb-4">
                {t('footer.description')}
              </p>
              <div className="flex items-center gap-2 text-xs text-neutral-600">
                <MapPin className="w-3 h-3" />
                <span>Douala &amp; Yaoundé, Cameroon</span>
              </div>
            </div>

            {/* Job Seekers */}
            <div>
              <h4 className="font-semibold mb-4 text-neutral-200">{t('footer.forJobSeekers')}</h4>
              <ul className="space-y-3 text-sm">
                <li><Link href="/jobs" className="text-neutral-400 hover:text-white transition-colors">{t('footer.browseJobs')}</Link></li>
                <li><Link href="/resume" className="text-neutral-400 hover:text-white transition-colors">{t('footer.cvBuilder')}</Link></li>
                <li><Link href="/remote-jobs" className="text-neutral-400 hover:text-white transition-colors">{t('footer.remoteJobs')}</Link></li>
                <li><Link href="/auth/register?role=candidate" className="text-neutral-400 hover:text-white transition-colors">{t('footer.createAccount')}</Link></li>
              </ul>
            </div>

            {/* Employers */}
            <div>
              <h4 className="font-semibold mb-4 text-neutral-200">{t('footer.forEmployers')}</h4>
              <ul className="space-y-3 text-sm">
                <li><Link href="/recruiter/post-job" className="text-neutral-400 hover:text-white transition-colors">{t('footer.postAJob')}</Link></li>
                <li><Link href="/learn-more/recruiters" className="text-neutral-400 hover:text-white transition-colors">{t('footer.howItWorks')}</Link></li>
                <li><Link href="/contact" className="text-neutral-400 hover:text-white transition-colors">{t('footer.contactSales')}</Link></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-neutral-500 text-sm">
              &copy; {new Date().getFullYear()} {t('footer.rights')}
            </p>
            <div className="flex items-center gap-4 sm:gap-6 text-sm text-neutral-500">
              <Link href="/privacy" className="hover:text-white transition-colors">{t('footer.privacy')}</Link>
              <Link href="/terms" className="hover:text-white transition-colors">{t('footer.terms')}</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
