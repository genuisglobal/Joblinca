'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { addLocalePrefix } from '@/lib/i18n/locale';
import Dialog from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

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

/**
 * Search + filters for /jobs. URL parameters are unchanged from the previous
 * version (q, location, work_type, language, date_posted, salary_min,
 * salary_max, type; legacy title/search/remote are still read).
 *
 * Phones: keyword + location, a "Filters" button opening a bottom sheet with
 * the other filters, and removable chips for active filters.
 * Desktop (lg+): every field inline, as before.
 */
export default function JobSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale, t } = useTranslation();
  const filtersButtonRef = useRef<HTMLButtonElement>(null);

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
  const [sheetOpen, setSheetOpen] = useState(false);

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

  function applyAll() {
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSheetOpen(false);
    applyAll();
  }

  function clearAll() {
    setQuery('');
    setLocation('');
    setWorkType('any');
    setLanguage('both');
    setDatePosted('anytime');
    setSalaryMin('');
    setSalaryMax('');
    setSheetOpen(false);

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

  const datePostedLabels: Record<DatePostedFilter, string> = {
    anytime: t('jobs.filters.anytime'),
    '24h': t('jobs.filters.past24Hours'),
    '3d': t('jobs.filters.past3Days'),
    '1w': t('jobs.filters.past1Week'),
    '1m': t('jobs.filters.past1Month'),
  };
  const workTypeLabels: Record<WorkTypeFilter, string> = {
    any: t('jobs.filters.anyWorkType'),
    remote: t('common.remote'),
    onsite: t('common.onSite'),
    hybrid: t('common.hybrid'),
  };
  const languageLabels: Record<LanguageFilter, string> = {
    both: t('jobs.filters.bothLanguages'),
    en: t('jobs.filters.english'),
    fr: t('jobs.filters.french'),
  };

  // Chips reflect what is applied (the URL), not unsaved edits.
  const chips: { key: string; label: string; remove: Record<string, null> }[] = [];
  if (currentQuery) chips.push({ key: 'q', label: `“${currentQuery}”`, remove: { q: null } });
  if (currentLocation) chips.push({ key: 'location', label: currentLocation, remove: { location: null } });
  if (currentDatePosted !== 'anytime') {
    chips.push({ key: 'date_posted', label: datePostedLabels[currentDatePosted], remove: { date_posted: null } });
  }
  if (currentWorkType !== 'any') {
    chips.push({ key: 'work_type', label: workTypeLabels[currentWorkType], remove: { work_type: null } });
  }
  if (currentLanguage !== 'both') {
    chips.push({ key: 'language', label: languageLabels[currentLanguage], remove: { language: null } });
  }
  if (currentSalaryMin) {
    chips.push({ key: 'salary_min', label: t('jobs.filters.salaryMinChip', { value: currentSalaryMin }), remove: { salary_min: null } });
  }
  if (currentSalaryMax) {
    chips.push({ key: 'salary_max', label: t('jobs.filters.salaryMaxChip', { value: currentSalaryMax }), remove: { salary_max: null } });
  }
  // The sheet holds everything except keyword and location.
  const sheetFilterCount = chips.filter((chip) => chip.key !== 'q' && chip.key !== 'location').length;

  const fieldClassName =
    'w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const labelClassName = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-muted';

  const keywordField = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
      <input
        type="search"
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('jobs.searchRolePlaceholder')}
        className={`${fieldClassName} pl-11`}
      />
    </div>
  );

  const locationField = (
    <div className="relative">
      <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
      <input
        type="text"
        enterKeyHint="search"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder={t('jobs.searchLocationPlaceholder')}
        className={`${fieldClassName} pl-11`}
      />
    </div>
  );

  const datePostedField = (
    <select
      value={datePosted}
      onChange={(event) => setDatePosted(event.target.value as DatePostedFilter)}
      className={fieldClassName}
    >
      {(Object.keys(datePostedLabels) as DatePostedFilter[]).map((value) => (
        <option key={value} value={value}>
          {datePostedLabels[value]}
        </option>
      ))}
    </select>
  );

  const workTypeField = (
    <select
      value={workType}
      onChange={(event) => setWorkType(event.target.value as WorkTypeFilter)}
      className={fieldClassName}
    >
      {(['any', 'remote', 'onsite', 'hybrid'] as WorkTypeFilter[]).map((value) => (
        <option key={value} value={value}>
          {workTypeLabels[value]}
        </option>
      ))}
    </select>
  );

  const languageField = (
    <select
      value={language}
      onChange={(event) => setLanguage(event.target.value as LanguageFilter)}
      className={fieldClassName}
    >
      {(['both', 'en', 'fr'] as LanguageFilter[]).map((value) => (
        <option key={value} value={value}>
          {languageLabels[value]}
        </option>
      ))}
    </select>
  );

  const salaryMinField = (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={salaryMin}
      onChange={(event) => setSalaryMin(event.target.value)}
      placeholder={t('jobs.filters.salaryMinPlaceholder')}
      className={fieldClassName}
    />
  );

  const salaryMaxField = (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={salaryMax}
      onChange={(event) => setSalaryMax(event.target.value)}
      placeholder={t('jobs.filters.salaryMaxPlaceholder')}
      className={fieldClassName}
    />
  );

  return (
    <>
      {/* ── Phones and tablets ─────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="mt-4 space-y-2 lg:hidden" role="search">
        <label className="block">
          <span className="sr-only">{t('jobs.filters.jobTitleLabel')}</span>
          {keywordField}
        </label>
        <div className="flex gap-2">
          <label className="block min-w-0 flex-1">
            <span className="sr-only">{t('jobs.filters.locationLabel')}</span>
            {locationField}
          </label>
          <button
            ref={filtersButtonRef}
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-label={
              sheetFilterCount > 0
                ? t('jobs.filters.buttonWithCount', { count: sheetFilterCount })
                : t('jobs.filters.button')
            }
            className="relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden min-[400px]:inline">{t('jobs.filters.button')}</span>
            {sheetFilterCount > 0 && (
              <span className="rounded-full bg-primary-600 px-1.5 text-xs font-semibold text-white" aria-hidden="true">
                {sheetFilterCount}
              </span>
            )}
          </button>
          <button
            type="submit"
            aria-label={t('common.search')}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 px-4 text-white transition-colors hover:bg-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={() => router.push(buildUrl(chip.remove))}
                  aria-label={t('jobs.filters.remove', { label: chip.label })}
                  className="inline-flex min-h-9 max-w-[16rem] items-center gap-1.5 rounded-full border border-primary-500/40 bg-primary-600/15 py-1 pl-3 pr-2 text-sm text-primary-200 transition-colors hover:bg-primary-600/25"
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
            {chips.length > 1 && (
              <li>
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                >
                  {t('common.clearFilters')}
                </button>
              </li>
            )}
          </ul>
        )}
      </form>

      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('jobs.filters.sheetTitle')}
        variant="sheet"
        returnFocusRef={filtersButtonRef}
        footer={
          <>
            {hasFilters && (
              <Button variant="secondary" onClick={clearAll} leftIcon={<X className="h-4 w-4" aria-hidden="true" />}>
                {t('common.clearFilters')}
              </Button>
            )}
            <Button
              onClick={() => {
                setSheetOpen(false);
                applyAll();
              }}
            >
              {t('jobs.filters.apply')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className={labelClassName}>{t('jobs.filters.datePostedLabel')}</span>
            {datePostedField}
          </label>
          <label className="block">
            <span className={labelClassName}>{t('jobs.filters.workTypeLabel')}</span>
            {workTypeField}
          </label>
          <label className="block">
            <span className={labelClassName}>{t('jobs.filters.languageLabel')}</span>
            {languageField}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClassName}>{t('jobs.filters.salaryMinLabel')}</span>
              {salaryMinField}
            </label>
            <label className="block">
              <span className={labelClassName}>{t('jobs.filters.salaryMaxLabel')}</span>
              {salaryMaxField}
            </label>
          </div>
        </div>
      </Dialog>

      {/* ── Desktop: every field inline (unchanged behaviour) ─────────── */}
      <form
        onSubmit={handleSubmit}
        role="search"
        className="mt-6 hidden rounded-3xl border border-line bg-surface/70 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm lg:block"
      >
        <div className="grid gap-3 lg:grid-cols-12">
          <label className="lg:col-span-4">
            <span className={labelClassName}>{t('jobs.filters.jobTitleLabel')}</span>
            {keywordField}
          </label>
          <label className="lg:col-span-3">
            <span className={labelClassName}>{t('jobs.filters.locationLabel')}</span>
            {locationField}
          </label>
          <label className="lg:col-span-2">
            <span className={labelClassName}>{t('jobs.filters.datePostedLabel')}</span>
            {datePostedField}
          </label>
          <label className="lg:col-span-3">
            <span className={labelClassName}>{t('jobs.filters.workTypeLabel')}</span>
            {workTypeField}
          </label>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-12">
          <label className="lg:col-span-3">
            <span className={labelClassName}>{t('jobs.filters.languageLabel')}</span>
            {languageField}
          </label>
          <label className="lg:col-span-2">
            <span className={labelClassName}>{t('jobs.filters.salaryMinLabel')}</span>
            {salaryMinField}
          </label>
          <label className="lg:col-span-2">
            <span className={labelClassName}>{t('jobs.filters.salaryMaxLabel')}</span>
            {salaryMaxField}
          </label>
          <div className="flex items-end gap-3 lg:col-span-5 lg:justify-end">
            {hasFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm font-medium text-fg-muted transition-colors hover:border-red-500/40 hover:text-red-300"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {t('common.clearFilters')}
              </button>
            )}
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-primary-500"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {t('common.search')}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
