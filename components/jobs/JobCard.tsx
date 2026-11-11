import Link from 'next/link';
import type { ReactNode } from 'react';
import { Briefcase, Building2, Clock, GraduationCap, MapPin } from 'lucide-react';
import Badge, { type BadgeTone } from '@/components/ui/Badge';

export interface JobCardBadge {
  label: string;
  tone?: BadgeTone;
  /** Tooltip / extra context (not the only carrier of meaning). */
  title?: string;
  /** Hide below `sm` to keep phone cards to two badges. */
  desktopOnly?: boolean;
}

export interface JobCardProps {
  href: string;
  title: string;
  company?: string | null;
  location?: string | null;
  /** e.g. "Remote", "On-site". */
  workType?: string | null;
  /** e.g. "Today", "3 days ago". */
  postedLabel?: string | null;
  /** Only pass when disclosed; omitted otherwise. */
  compensation?: string | null;
  /** Short plain text (see lib/jobs/summary.ts); shown from `sm` up. */
  summary?: string | null;
  /** Extra meta shown from `sm` up, e.g. eligible profiles. */
  secondaryMeta?: string | null;
  badges?: JobCardBadge[];
  /** Educational internships get a cap icon instead of a building. */
  icon?: 'company' | 'education';
  /**
   * Controls rendered below the card body (saved-job remove, admin
   * workflow). They sit above the card-wide link so they stay clickable.
   */
  actions?: ReactNode;
  /** Heading level for the title (default h2). */
  headingLevel?: 'h2' | 'h3';
}

/**
 * Compact job listing card (about 150px tall on a 360px phone). The title
 * link is stretched over the whole card, so the card is one tap target and
 * one link for screen readers.
 */
export default function JobCard({
  href,
  title,
  company,
  location,
  workType,
  postedLabel,
  compensation,
  summary,
  secondaryMeta,
  badges = [],
  icon = 'company',
  actions,
  headingLevel = 'h2',
}: JobCardProps) {
  const Heading = headingLevel;
  const Icon = icon === 'education' ? GraduationCap : Building2;
  const meta = [workType, postedLabel].filter(Boolean).join(' · ');
  const MetaIcon = postedLabel ? Clock : Briefcase;

  return (
    <article className="group relative rounded-2xl border border-line bg-surface-raised p-4 transition-colors hover:border-primary-600/50 focus-within:ring-2 focus-within:ring-focus sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        <div
          className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-overlay sm:flex"
          aria-hidden="true"
        >
          <Icon className={`h-6 w-6 ${icon === 'education' ? 'text-emerald-300' : 'text-primary-400'}`} />
        </div>

        <div className="min-w-0 flex-1">
          {badges.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {badges.map((badge) => (
                <span key={badge.label} title={badge.title} className={badge.desktopOnly ? 'hidden sm:inline-flex' : 'inline-flex'}>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </span>
              ))}
            </div>
          )}

          <Heading className="text-base font-semibold leading-snug text-fg sm:text-lg">
            <Link
              href={href}
              className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none group-hover:text-primary-300"
            >
              <span className="line-clamp-2">{title}</span>
            </Link>
          </Heading>

          {company && <p className="mt-0.5 truncate text-sm font-medium text-fg-muted">{company}</p>}

          {summary && (
            <div className="mt-2 hidden sm:block">
              <p className="line-clamp-2 text-sm text-fg-muted">{summary}</p>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-subtle">
            {location && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </span>
            )}
            {meta && (
              <span className="inline-flex items-center gap-1">
                <MetaIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {meta}
              </span>
            )}
            {secondaryMeta && <span className="hidden sm:inline">{secondaryMeta}</span>}
          </div>

          {compensation && <p className="mt-2 text-sm font-semibold text-fg">{compensation}</p>}
        </div>
      </div>

      {actions && <div className="relative z-10 mt-4">{actions}</div>}
    </article>
  );
}
