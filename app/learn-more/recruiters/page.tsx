import type { Metadata } from 'next';
import RecruitersContent from './RecruitersContent';

export const metadata: Metadata = {
  title: 'Learn More for Recruiters | JobLinca',
  description:
    'Explore how JobLinca helps recruiters hire faster with AI screening, candidate ranking and flexible vetting services.',
};

export default function RecruitersLearnMore() {
  return <RecruitersContent />;
}