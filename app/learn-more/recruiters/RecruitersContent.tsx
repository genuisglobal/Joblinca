'use client';

import Link from 'next/link';
import { Users, Filter, Smartphone } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function RecruitersContent() {
  const { t } = useTranslation();

  return (
    <main className="bg-gray-900 text-gray-100">
      {/* Hero Section */}
      <section className="relative isolate py-20 px-4 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-16 -left-32 w-1/2 h-1/2 bg-yellow-500 rounded-full blur-3xl opacity-25"></div>
          <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-blue-600 rounded-full blur-3xl opacity-30"></div>
        </div>
        <h1 className="text-4xl font-bold mb-4">{t('learnRecruiters.hero.title')}</h1>
        <p className="max-w-3xl mx-auto text-lg text-gray-300">
          {t('learnRecruiters.hero.subtitle')}
        </p>
        <div className="mt-8 flex justify-center gap-4 flex-wrap">
          <Link
            href="/recruiter/post-job"
            className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors"
          >
            {t('learnRecruiters.hero.cta1')}
          </Link>
          <Link
            href="/jobs"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
          >
            {t('learnRecruiters.hero.cta2')}
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">{t('learnRecruiters.features.title')}</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Filter className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('learnRecruiters.features.screening.title')}</h3>
              <p className="text-sm text-gray-300">{t('learnRecruiters.features.screening.desc')}</p>
            </div>
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Users className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('learnRecruiters.features.talent.title')}</h3>
              <p className="text-sm text-gray-300">{t('learnRecruiters.features.talent.desc')}</p>
            </div>
            <div className="p-6 bg-gray-900 rounded-lg shadow-md text-center">
              <Smartphone className="mx-auto h-8 w-8 text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('learnRecruiters.features.whatsapp.title')}</h3>
              <p className="text-sm text-gray-300">{t('learnRecruiters.features.whatsapp.desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">{t('learnRecruiters.howItWorks.title')}</h2>
          <ol className="max-w-3xl mx-auto space-y-6 text-gray-300">
            <li><span className="text-yellow-500 mr-2">1.</span>{t('learnRecruiters.howItWorks.step1')}</li>
            <li><span className="text-yellow-500 mr-2">2.</span>{t('learnRecruiters.howItWorks.step2')}</li>
            <li><span className="text-yellow-500 mr-2">3.</span>{t('learnRecruiters.howItWorks.step3')}</li>
          </ol>
        </div>
      </section>

      {/* Vetting & Security Section */}
      <section className="py-16 px-4 bg-gray-800">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
          <div>
            <h3 className="text-2xl font-semibold mb-4">{t('learnRecruiters.info.vetting.title')}</h3>
            <p className="text-sm text-gray-300">{t('learnRecruiters.info.vetting.desc')}</p>
          </div>
          <div>
            <h3 className="text-2xl font-semibold mb-4">{t('learnRecruiters.info.secure.title')}</h3>
            <p className="text-sm text-gray-300">{t('learnRecruiters.info.secure.desc')}</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">{t('learnRecruiters.cta.title')}</h2>
          <p className="mb-8 text-sm text-gray-300">{t('learnRecruiters.cta.subtitle')}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/recruiter/post-job"
              className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 px-6 py-3 rounded-md transition-colors"
            >
              {t('learnRecruiters.hero.cta1')}
            </Link>
            <Link
              href="/jobs"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
            >
              {t('learnRecruiters.hero.cta2')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
