'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function HomeHeroSearch() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchLocation, setSearchLocation] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchKeyword) params.set('q', searchKeyword);
    if (searchLocation) params.set('location', searchLocation);
    router.push(`/jobs?${params.toString()}`);
  };

  return (
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
            aria-label={t('home.hero.searchPlaceholder')}
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
            aria-label={t('home.hero.locationPlaceholder')}
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
  );
}
