import type { Metadata } from 'next';
import JobSeekersContent from './JobSeekersContent';

export const metadata: Metadata = {
  title: 'Learn More for Job Seekers | JobLinca',
  description:
    'Discover how JobLinca empowers job seekers with AI matching, mobile convenience and access to local and global opportunities.',
};

export default function JobSeekersLearnMore() {
  return <JobSeekersContent />;
}