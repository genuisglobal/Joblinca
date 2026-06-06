import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle,
  Download,
  FileText,
  Layout,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';
import { addLocalePrefix } from '@/lib/i18n/locale';

export function generateMetadata(): Metadata {
  const locale = getRequestLocale();
  const t = getServerT(locale);

  return {
    title: t('cv.metadataTitle'),
    description: t('cv.metadataDescription'),
  };
}

export default function CVBuilderPage() {
  const locale = getRequestLocale();
  const t = getServerT(locale);

  const features = [
    {
      icon: Layout,
      title: t('cv.features.templates.title'),
      description: t('cv.features.templates.desc'),
    },
    {
      icon: Sparkles,
      title: t('cv.features.ai.title'),
      description: t('cv.features.ai.desc'),
    },
    {
      icon: Download,
      title: t('cv.features.formats.title'),
      description: t('cv.features.formats.desc'),
    },
    {
      icon: Shield,
      title: t('cv.features.ats.title'),
      description: t('cv.features.ats.desc'),
    },
  ];

  const steps = [
    {
      number: '01',
      title: t('cv.howItWorks.step1.title'),
      description: t('cv.howItWorks.step1.desc'),
    },
    {
      number: '02',
      title: t('cv.howItWorks.step2.title'),
      description: t('cv.howItWorks.step2.desc'),
    },
    {
      number: '03',
      title: t('cv.howItWorks.step3.title'),
      description: t('cv.howItWorks.step3.desc'),
    },
    {
      number: '04',
      title: t('cv.howItWorks.step4.title'),
      description: t('cv.howItWorks.step4.desc'),
    },
  ];

  const benefits = [
    {
      title: t('cv.benefits.interview.title'),
      description: t('cv.benefits.interview.desc'),
    },
    {
      title: t('cv.benefits.ats.title'),
      description: t('cv.benefits.ats.desc'),
    },
    {
      title: t('cv.benefits.time.title'),
      description: t('cv.benefits.time.desc'),
    },
    {
      title: t('cv.benefits.apply.title'),
      description: t('cv.benefits.apply.desc'),
    },
  ];

  const registerHref = addLocalePrefix(
    '/auth/register?role=candidate&redirect=cv-builder',
    locale
  );
  const loginHref = addLocalePrefix('/auth/login', locale);

  return (
    <main className="min-h-screen bg-neutral-950">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-600/10 via-neutral-950 to-neutral-950" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-600/10 border border-primary-600/20 text-sm text-primary-400 mb-8">
              <Sparkles className="w-4 h-4" />
              <span>{t('cv.hero.badge')}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              {t('cv.hero.title.create')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-600">
                {t('cv.hero.title.professionalCv')}
              </span>{' '}
              {t('cv.hero.title.inMinutes')}
            </h1>

            <p className="text-lg sm:text-xl text-neutral-400 mb-10 max-w-2xl mx-auto">
              {t('cv.hero.subtitle')}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link
                href={registerHref}
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
              >
                <FileText className="w-5 h-5" />
                {t('cv.hero.cta')}
              </Link>
              <Link
                href={loginHref}
                className="inline-flex items-center gap-2 text-neutral-400 hover:text-white font-medium transition-colors"
              >
                {t('cv.hero.loginLink')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="flex flex-wrap justify-center gap-8 text-sm text-neutral-500">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>{t('cv.hero.free')}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>{t('cv.hero.noCreditCard')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary-400" />
                <span>{t('cv.hero.trusted')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-neutral-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              {t('cv.features.title')}
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto">
              {t('cv.features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 hover:border-primary-600/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-primary-600/10 border border-primary-600/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-neutral-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-neutral-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              {t('cv.howItWorks.title')}
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto">
              {t('cv.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="text-5xl font-bold text-neutral-800 mb-4">
                  {step.number}
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-neutral-900">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-primary-600/20 via-primary-600/10 to-accent-500/20 border border-primary-600/30 rounded-2xl p-8 sm:p-12">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                {t('cv.benefits.title')}
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">{benefit.title}</h4>
                    <p className="text-neutral-400 text-sm">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-neutral-950">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-600/20 border border-primary-600/30 flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-primary-400" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            {t('cv.finalCta.title')}
          </h2>
          <p className="text-neutral-400 text-lg mb-10 max-w-xl mx-auto">
            {t('cv.finalCta.subtitle')}
          </p>
          <Link
            href={registerHref}
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/25"
          >
            {t('cv.finalCta.cta')}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-sm text-neutral-500 mt-4">
            {t('cv.finalCta.note')}
          </p>
        </div>
      </section>
    </main>
  );
}
