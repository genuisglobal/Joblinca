'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Search, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { addLocalePrefix } from '@/lib/i18n/locale';

type WorkTypeFilter = 'any' | 'onsite' | 'remote' | 'hybrid';
type LanguageFilter = 'both' | 'en' | 'fr';
type DatePostedFilter = 'anytime' | '24h' | '3d' | '1w' | '1m';

function normalizeWorkTypeFilter(value: string | null, remoteValue: string | null): WorkTypeFilter {
  if (value === 'onsite' || value === 'remote' || value === 'hybrid') {
    return value;
  }

  return remoteValue === '1' ? 'remote' : 'any';
}

function normalizeLanguageFilter(value: string | null): LanguageFilter {
  if (value === 'en' || value === 'fr') {
    return value;
  }

  return 'both';
}

function normalizeDatePostedFilter(value: string | null): DatePostedFilter {
  if (value === '24h' || value === '3d' || value === '1w' || value === '1m') {
    return value;
  }

  return 'anytime';
}

export default function JobSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useTranslation();

  const currentQuery = searchParams.get('q') || searchParams.get('title') || searchParams.get('search') || '';
  const currentLocation = searchParams.get('location') || '';
  const currentWorkType = normalizeWorkTypeFilter(
    searchParams.get('work_type'),
    searchParams.get('remote')
  );
  const currentLanguage = normalizeLanguageFilter(searchParams.get('language'));
  const currentDatePosted = normalizeDatePostedFilter(searchParams.get('date_posted'));
  const currentSalaryMin = searchParams.get('salary_min') || '';
  const currentSalaryMax = searchParams.get('salary_max') || '';
  const currentType = searchParams.get('type') || '';

  const [query, setQuery] = useState(currentQuery);
  const [location, setLocation] = useState(currentLocation);
  const [workType, setWorkType] = useState<WorkTypeFilter>(currentWorkType);
  const [language, setLanguage] = useState<LanguageFilter>(currentLanguage);
  const [datePosted, setDatePosted] = useState<DatePostedFilter>(currentDatePosted);
  const [salaryMin, setSalaryMin] = useState(currentSalaryMin);
  const [salaryMax, setSalaryMax] = useState(currentSalaryMax);

  useEffect(() => {
    setQuery(currentQuery);
    setLocation(currentLocation);
    setWorkType(currentWorkType);
    setLanguage(currentLanguage);
    setDatePosted(currentDatePosted);
    setSalaryMin(currentSalaryMin);
    setSalaryMax(currentSalaryMax);
  }, [
    currentDatePosted,
    currentLanguage,
    currentLocation,
    currentQuery,
    currentSalaryMax,
    currentSalaryMin,
    currentWorkType,
  ]);

  const buildUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      params.delete('page');
      params.delete('remote');
      params.delete('search');
      params.delete('title');

      for (const [key, value] of Object.entries(overrides)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }

      const queryString = params.toString();
      return addLocalePrefix(queryString ? `/jobs?${queryString}` : '/jobs', locale);
    },
    [locale, searchParams]
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    router.push(
      buildUrl({
        q: query.trim() || null,
        location: location.trim() || null,
        work_type: workType === 'any' ? null : workType,
        language: language === 'both' ? null : language,
        date_posted: datePosted === 'anytime' ? null : datePosted,
        salary_min: salaryMin.trim() || null,
        salary_max: salaryMax.trim() || null,
      })
    );
  }

  function clearAll() {
    setQuery('');
    setLocation('');
    setWorkType('any');
    setLanguage('both');
    setDatePosted('anytime');
    setSalaryMin('');
    setSalaryMax('');

    const params = new URLSearchParams();
    if (currentType) {
      params.set('type', currentType);
    }

    const queryString = params.toString();
    router.push(addLocalePrefix(queryString ? `/jobs?${queryString}` : '/jobs', locale));
  }

  const hasFilters =
    query.trim() ||
    location.trim() ||
    workType !== 'any' ||
    language !== 'both' ||
    datePosted !== 'anytime' ||
    salaryMin.trim() ||
    salaryMax.trim();

  const fieldClassName =
    'w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const labelClassName = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400';

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-950/70 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm"
    >
      <div className="grid gap-3 lg:grid-cols-12">
        <label className="lg:col-span-4">
          <span className={labelClassName}>{t('jobs.filters.jobTitleLabel')}</span>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('jobs.searchRolePlaceholder')}
              className={`${fieldClassName} pl-11`}
            />
          </div>
        </label>

        <label className="lg:col-span-3">
          <span className={labelClassName}>{t('jobs.filters.locationLabel')}</span>
          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={t('jobs.searchLocationPlaceholder')}
              className={`${fieldClassName} pl-11`}
            />
          </div>
        </label>

        <label className="lg:col-span-2">
          <span className={labelClassName}>{t('jobs.filters.datePostedLabel')}</span>
          <select
            value={datePosted}
            onChange={(event) => setDatePosted(event.target.value as DatePostedFilter)}
            className={fieldClassName}
          >
            <option value="anytime">{t('jobs.filters.anytime')}</option>
            <option value="24h">{t('jobs.filters.past24Hours')}</option>
            <option value="3d">{t('jobs.filters.past3Days')}</option>
            <option value="1w">{t('jobs.filters.past1Week')}</option>
            <option value="1m">{t('jobs.filters.past1Month')}</option>
          </select>
        </label>

        <label className="lg:col-span-3">
          <span className={labelClassName}>{t('jobs.filters.workTypeLabel')}</span>
          <select
            value={workType}
            onChange={(event) => setWorkType(event.target.value as WorkTypeFilter)}
            className={fieldClassName}
          >
            <option value="any">{t('jobs.filters.anyWorkType')}</option>
            <option value="remote">{t('common.remote')}</option>
            <option value="onsite">{t('common.onSite')}</option>
            <option value="hybrid">{t('common.hybrid')}</option>
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-12">
        <label className="lg:col-span-3">
          <span className={labelClassName}>{t('jobs.filters.languageLabel')}</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as LanguageFilter)}
            className={fieldClassName}
          >
            <option value="both">{t('jobs.filters.bothLanguages')}</option>
            <option value="en">{t('jobs.filters.english')}</option>
            <option value="fr">{t('jobs.filters.french')}</option>
          </select>
        </label>

        <label className="lg:col-span-2">
          <span className={labelClassName}>{t('jobs.filters.salaryMinLabel')}</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={salaryMin}
            onChange={(event) => setSalaryMin(event.target.value)}
            placeholder={t('jobs.filters.salaryMinPlaceholder')}
            className={fieldClassName}
          />
        </label>

        <label className="lg:col-span-2">
          <span className={labelClassName}>{t('jobs.filters.salaryMaxLabel')}</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={salaryMax}
            onChange={(event) => setSalaryMax(event.target.value)}
            placeholder={t('jobs.filters.salaryMaxPlaceholder')}
            className={fieldClassName}
          />
        </label>

        <div className="flex items-end gap-3 lg:col-span-5 lg:justify-end">
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900/80 px-4 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-red-500/40 hover:text-red-300"
            >
              <X className="h-4 w-4" />
              {t('common.clearFilters')}
            </button>
          )}

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-primary-500"
          >
            <Search className="h-4 w-4" />
            {t('common.search')}
          </button>
        </div>
      </div>
    </form>
  );
}
