'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { Search, MapPin, Globe, X } from 'lucide-react';

export default function JobSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');

  const currentRemote = searchParams.get('remote') === '1';
  const currentType = searchParams.get('type') || '';
  const currentLanguage = searchParams.get('language') || '';

  const buildUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      const qs = params.toString();
      return qs ? `/jobs?${qs}` : '/jobs';
    },
    [searchParams]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(
      buildUrl({
        q: query.trim() || null,
        location: location.trim() || null,
      })
    );
  }

  function toggleRemote() {
    router.push(buildUrl({ remote: currentRemote ? null : '1' }));
  }

  function clearAll() {
    setQuery('');
    setLocation('');
    const params = new URLSearchParams();

    if (currentType) {
      params.set('type', currentType);
    }

    if (currentLanguage) {
      params.set('language', currentLanguage);
    }

    const queryString = params.toString();
    router.push(queryString ? `/jobs?${queryString}` : '/jobs');
  }

  const hasFilters = query || location || currentRemote;

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Text search */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Job title, skill, or company"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-800 py-3 pl-11 pr-4 text-sm text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        {/* Location search */}
        <div className="relative sm:w-56">
          <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, e.g. Douala"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-800 py-3 pl-11 pr-4 text-sm text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-primary-500"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

      {/* Quick toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleRemote}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            currentRemote
              ? 'border border-green-500/40 bg-green-500/15 text-green-300'
              : 'border border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-neutral-500 hover:text-white'
          }`}
        >
          <Globe className="h-3 w-3" />
          Remote Only
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-400 hover:border-red-500/40 hover:text-red-300 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>
    </form>
  );
}
