import type { Metadata } from 'next';
import RecruitersContent from './RecruitersContent';
import { getRequestLocale } from '@/lib/i18n/server';
import { getServerT } from '@/lib/i18n/server-t';

export function generateMetadata(): Metadata {
  const locale = getRequestLocale();
  const t = getServerT(locale);

  return {
    title: t('learnRecruiters.metadataTitle'),
    description: t('learnRecruiters.metadataDescription'),
  };
}

export default function RecruitersLearnMore() {
  return <RecruitersContent />;
}
