import type { Metadata } from 'next';
import JobSeekersContent from './JobSeekersContent';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';

export function generateMetadata(): Metadata {
  const locale = getRequestLocale();
  const t = getServerT(locale);

  return {
    title: t('learnSeekers.metadataTitle'),
    description: t('learnSeekers.metadataDescription'),
  };
}

export default function JobSeekersLearnMore() {
  return <JobSeekersContent />;
}
