'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  Clock3,
  ExternalLink,
  Globe,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import type { SponsorFeedItem, SponsorType } from '@/lib/sponsorship-schema';

const FILTERS: Array<{ key: SponsorType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'job', label: 'Jobs' },
  { key: 'employer', label: 'Employers' },
  { key: 'academy', label: 'Academies' },
];

function useSessionKey() {
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  useEffect(() => {
    const storageKey = 'joblinca:sponsor-session';
    const current =
      typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : null;
    if (current) {
      setSessionKey(current);
      return;
    }

    const nextValue =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}`;
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(storageKey, nextValue);
    }
    setSessionKey(nextValue);
  }, []);

  return sessionKey;
}

async function trackSponsorEvent(
  campaignIds: string | string[],
  eventType: 'impression' | 'click' | 'cta_click',
  sessionKey: string | null
) {
  try {
    await fetch('/api/sponsors/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignIds,
        eventType,
        placement: 'homepage_shelf',
        sessionKey,
      }),
      keepalive: true,
    });
  } catch {
    // Best-effort analytics only.
  }
}

function iconForType(type: SponsorType) {
  if (type === 'job') {
    return Briefcase;
  }

  if (type === 'employer') {
    return Building2;
  }

  return GraduationCap;
}

function surfaceClasses(type: SponsorType) {
  if (type === 'job') {
    return 'border-primary-600/25 bg-primary-600/10 text-primary-300';
  }

  if (type === 'employer') {
    return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
  }

  return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
}

function renderLogo(item: SponsorFeedItem) {
  if (item.logoUrl) {
    return (
      <img
        src={item.logoUrl}
        alt={item.sponsorName}
        className="h-12 w-12 rounded-xl border border-neutral-700 bg-neutral-900 object-cover"
      />
    );
  }

  const Icon = iconForType(item.sponsorType);
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900">
      <Icon className="h-6 w-6 text-neutral-400" />
    </div>
  );
}

function SponsorCard({
  item,
  sessionKey,
}: {
  item: SponsorFeedItem;
  sessionKey: string | null;
}) {
  const isExternal = item.isExternal;
  const wrapperClass =
    'group flex h-full flex-col rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 transition-all hover:-translate-y-0.5 hover:border-neutral-600 hover:bg-neutral-900';
  const onClick = () => {
    void trackSponsorEvent(item.id, 'click', sessionKey);
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        {renderLogo(item)}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Sponsored
          </span>
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${surfaceClasses(
              item.sponsorType
            )}`}
          >
            {item.sponsorType}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{item.sponsorName}</p>
        <h3 className="mt-2 text-lg font-semibold text-white transition-colors group-hover:text-primary-300">
          {item.headline}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">{item.description}</p>
      </div>

      {item.meta.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.meta.map((meta) => (
            <span
              key={meta}
              className="rounded-full border border-neutral-700 bg-neutral-950/70 px-2.5 py-1 text-xs text-neutral-400"
            >
              {meta}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-neutral-800 pt-4">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-primary-300">
          {item.ctaLabel}
          {isExternal ? <ExternalLink className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </span>
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a
        href={item.ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={wrapperClass}
        onClick={onClick}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={item.ctaUrl} className={wrapperClass} onClick={onClick}>
      {content}
    </Link>
  );
}

function SponsorFeedSkeleton() {
  return (
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="h-3 w-32 animate-pulse rounded bg-neutral-800" />
            <div className="h-8 w-72 animate-pulse rounded bg-neutral-800" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-neutral-800" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((value) => (
              <div key={value} className="h-9 w-20 animate-pulse rounded-full bg-neutral-800" />
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((value) => (
            <div
              key={value}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="h-12 w-12 animate-pulse rounded-xl bg-neutral-800" />
                <div className="h-6 w-24 animate-pulse rounded-full bg-neutral-800" />
              </div>
              <div className="h-3 w-24 animate-pulse rounded bg-neutral-800" />
              <div className="mt-3 h-6 w-3/4 animate-pulse rounded bg-neutral-800" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-neutral-800" />
              <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-neutral-800" />
              <div className="mt-6 flex gap-2">
                <div className="h-6 w-20 animate-pulse rounded-full bg-neutral-800" />
                <div className="h-6 w-16 animate-pulse rounded-full bg-neutral-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function SponsoredHomeFeed() {
  const sessionKey = useSessionKey();
  const [items, setItems] = useState<SponsorFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<SponsorType | 'all'>('all');
  const [hiddenForSubscriber, setHiddenForSubscriber] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const [feedResponse, subscriptionResponse] = await Promise.all([
          fetch('/api/sponsors/homepage?placement=homepage_shelf&limit=4', { cache: 'no-store' }),
          fetch('/api/subscriptions/me', { cache: 'no-store' }),
        ]);

        if (!active) {
          return;
        }

        if (subscriptionResponse.ok) {
          const subscription = (await subscriptionResponse.json()) as { isActive?: boolean };
          if (subscription?.isActive) {
            setHiddenForSubscriber(true);
            setItems([]);
            setLoading(false);
            return;
          }
        }

        const payload = (await feedResponse.json()) as { items?: SponsorFeedItem[] };
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setHiddenForSubscriber(false);
        setItems(nextItems);
      } catch {
        if (active) {
          setItems([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!items.length || hiddenForSubscriber) {
      return;
    }

    void trackSponsorEvent(
      items.map((item) => item.id),
      'impression',
      sessionKey
    );
  }, [items, hiddenForSubscriber, sessionKey]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') {
      return items;
    }

    return items.filter((item) => item.sponsorType === activeFilter);
  }, [activeFilter, items]);

  if (loading) {
    return <SponsorFeedSkeleton />;
  }

  if (hiddenForSubscriber || items.length === 0) {
    return null;
  }

  return (
    <section className="border-y border-neutral-800 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.08),_transparent_30%),linear-gradient(180deg,_rgba(10,10,12,0.95)_0%,_rgba(14,14,18,1)_100%)] px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1 text-xs uppercase tracking-[0.22em] text-neutral-300">
              <BadgeCheck className="h-3.5 w-3.5" />
              Approved placements
            </p>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Sponsored Opportunities & Partners
            </h2>
            <p className="mt-3 text-neutral-400">
              Paid placements from employers and training partners, reviewed before they appear on Joblinca.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeFilter === filter.key
                    ? 'border border-primary-500/40 bg-primary-600/15 text-primary-200'
                    : 'border border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-neutral-500 hover:text-white'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-neutral-600" />
            <p className="mt-4 text-sm text-neutral-400">
              No sponsored placements match this filter right now.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <SponsorCard key={item.id} item={item} sessionKey={sessionKey} />
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Sponsors are clearly labeled.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            Placement does not replace job moderation.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Relevance and active campaigns still control what appears.
          </span>
        </div>
      </div>
    </section>
  );
}
