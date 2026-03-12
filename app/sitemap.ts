import type { MetadataRoute } from 'next';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';

const CITIES = [
  'douala',
  'yaounde',
  'bafoussam',
  'limbe',
  'buea',
  'kribi',
  'bamenda',
  'garoua',
  'maroua',
  'bertoua',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
  const supabase = createServiceSupabaseClient();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/jobs`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/remote-jobs`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${baseUrl}/cv-builder`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/learn/job-seekers`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/learn/recruiters`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/salary-insights`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
  ];

  // City pages
  const cityPages: MetadataRoute.Sitemap = CITIES.map((city) => ({
    url: `${baseUrl}/jobs-in/${city}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // Active job pages (last 500)
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, created_at, closes_at, lifecycle_status, published, approval_status, removed_at')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(500);

  const jobPages: MetadataRoute.Sitemap = (jobs || [])
    .filter((job) => isJobPubliclyListable(job))
    .map((job) => ({
    url: `${baseUrl}/jobs/${job.id}`,
    lastModified: new Date(job.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Company pages (verified recruiters)
  const { data: recruiters } = await supabase
    .from('recruiters')
    .select('id, created_at')
    .eq('verified', true)
    .limit(200);

  const companyPages: MetadataRoute.Sitemap = (recruiters || []).map((r) => ({
    url: `${baseUrl}/companies/${r.id}`,
    lastModified: new Date(r.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  return [...staticPages, ...cityPages, ...jobPages, ...companyPages];
}
