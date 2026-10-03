import Link from 'next/link';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  loadAgentReview,
  parseReviewFilters,
  type ReviewFilters,
  type ReviewTurn,
} from '@/lib/whatsapp-agent/agent-review';
import { readAgentConfig } from '@/lib/whatsapp-agent/agent-config';

export const dynamic = 'force-dynamic';

function formatWhen(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function hrefWith(filters: ReviewFilters, patch: Partial<ReviewFilters>): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.range !== '7d') params.set('range', next.range);
  if (next.route !== 'all') params.set('route', next.route);
  if (next.outcome !== 'all') params.set('outcome', next.outcome);
  if (next.phone) params.set('phone', next.phone);
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return `/admin/whatsapp/agent${query ? `?${query}` : ''}`;
}

function Pill({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm border ${
        active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {children}
    </Link>
  );
}

function Stat({ value, label, tone = 'normal' }: { value: string; label: string; tone?: 'normal' | 'warn' | 'bad' }) {
  const toneClass =
    tone === 'bad' ? 'border-red-700 bg-red-900/20' : tone === 'warn' ? 'border-yellow-700 bg-yellow-900/20' : 'border-gray-700 bg-gray-800';
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

function MessageBox({
  title,
  text,
  tone,
  emptyLabel = 'nothing',
}: {
  title: string;
  text: string | null;
  tone: 'agent' | 'menu' | 'user';
  emptyLabel?: string;
}) {
  const border = tone === 'agent' ? 'border-blue-800' : tone === 'menu' ? 'border-gray-600' : 'border-emerald-800';
  if (!text) {
    return (
      <div className={`rounded-lg border ${border} p-3`}>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{title}</p>
        <p className="text-sm text-gray-500 italic">{emptyLabel}</p>
      </div>
    );
  }
  const long = text.length > 420;
  return (
    <div className={`rounded-lg border ${border} p-3 min-w-0`}>
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{title}</p>
      {long ? (
        <details>
          <summary className="text-sm text-gray-200 whitespace-pre-wrap break-words cursor-pointer list-none">
            {text.slice(0, 420)}… <span className="text-blue-400">more</span>
          </summary>
          <p className="text-sm text-gray-200 whitespace-pre-wrap break-words mt-1">{text.slice(420)}</p>
        </details>
      ) : (
        <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{text}</p>
      )}
    </div>
  );
}

function TurnCard({ turn }: { turn: ReviewTurn }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs mb-3">
        <span className="text-gray-400">{formatWhen(turn.createdAt)}</span>
        <span className={`px-2 py-0.5 rounded border ${turn.route === 'live' ? 'border-blue-700 text-blue-300' : 'border-gray-600 text-gray-300'}`}>
          {turn.route}
        </span>
        <span
          className={`px-2 py-0.5 rounded border ${
            turn.outcome === 'agent' ? 'border-green-700 text-green-300' : 'border-red-700 text-red-300'
          }`}
          title={turn.fallbackReason || undefined}
        >
          {turn.outcome === 'agent' ? 'agent answered' : `fallback: ${(turn.fallbackReason || 'unknown').slice(0, 60)}`}
        </span>
        {turn.phone && (
          <Link href={`/admin/whatsapp/agent?phone=${encodeURIComponent(turn.phone)}`} className="text-gray-300 hover:text-white font-mono">
            {turn.phone}
          </Link>
        )}
        <span className="text-gray-500">{turn.hasAccount ? 'account' : 'no account'}{turn.language ? ` · ${turn.language}` : ''}</span>
        <span className="ml-auto text-gray-500 tabular-nums">
          {turn.latencyMs != null ? `${(turn.latencyMs / 1000).toFixed(1)}s` : '–'} · {turn.tokens} tok
        </span>
      </div>

      <MessageBox title="User" text={turn.inboundText} tone="user" />

      {turn.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 my-2">
          {turn.tools.map((tool, i) => (
            <span
              key={`${tool.name}-${i}`}
              className={`text-xs font-mono px-2 py-0.5 rounded ${tool.ok ? 'bg-gray-700 text-gray-200' : 'bg-red-900/40 text-red-300'}`}
            >
              {tool.name}
            </span>
          ))}
        </div>
      )}

      <div className={`grid gap-3 mt-2 ${turn.route === 'shadow' ? 'md:grid-cols-2' : ''}`}>
        <MessageBox
          title={turn.route === 'shadow' ? 'Agent would have said' : 'Agent said'}
          text={turn.replyText}
          tone="agent"
          emptyLabel={
            turn.outcome === 'fallback'
              ? `No reply -- the agent failed (${turn.fallbackReason?.split(':')[0] || 'unknown'})${turn.route === 'live' ? ' and the menu bot answered instead' : ''}.`
              : 'nothing'
          }
        />
        {turn.route === 'shadow' && (
          <MessageBox
            title="Menu bot actually sent"
            text={turn.menuReplies.length ? turn.menuReplies.join('\n\n— — —\n\n') : null}
            tone="menu"
          />
        )}
      </div>
    </div>
  );
}

export default async function AgentReviewPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parseReviewFilters(searchParams);
  const config = readAgentConfig();

  let review: Awaited<ReturnType<typeof loadAgentReview>> | null = null;
  let loadError: string | null = null;
  try {
    review = await loadAgentReview(createServiceSupabaseClient(), filters);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load agent turns';
  }

  const s = review?.summary;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">WhatsApp agent</h1>
        <p className="text-gray-400 mt-1">
          Every message the conversational agent handled. In shadow mode, compare what it would have said with
          what the menu bot actually sent before switching anyone to live.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Mode <span className="font-mono text-gray-300">{config.mode}</span>
          {config.mode === 'on' && (
            <>
              {' '}· allowlist {config.allowlist.size} · rollout {config.rolloutPercent}%
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(['24h', '7d', '30d'] as const).map((range) => (
          <Pill key={range} active={filters.range === range} href={hrefWith(filters, { range, page: 1 })}>
            {range}
          </Pill>
        ))}
        <span className="w-px bg-gray-700 mx-1" />
        {(['all', 'shadow', 'live'] as const).map((route) => (
          <Pill key={route} active={filters.route === route} href={hrefWith(filters, { route, page: 1 })}>
            {route}
          </Pill>
        ))}
        <span className="w-px bg-gray-700 mx-1" />
        {(['all', 'agent', 'fallback'] as const).map((outcome) => (
          <Pill key={outcome} active={filters.outcome === outcome} href={hrefWith(filters, { outcome, page: 1 })}>
            {outcome === 'all' ? 'all outcomes' : outcome}
          </Pill>
        ))}
      </div>

      <form method="get" action="/admin/whatsapp/agent" className="flex gap-2 mb-6">
        {filters.range !== '7d' && <input type="hidden" name="range" value={filters.range} />}
        {filters.route !== 'all' && <input type="hidden" name="route" value={filters.route} />}
        {filters.outcome !== 'all' && <input type="hidden" name="outcome" value={filters.outcome} />}
        <input
          name="phone"
          defaultValue={filters.phone || ''}
          placeholder="Filter by phone, e.g. +237670000001"
          className="flex-1 max-w-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
        />
        <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Filter</button>
        {filters.phone && (
          <Link href={hrefWith(filters, { phone: null, page: 1 })} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
            Clear
          </Link>
        )}
      </form>

      {loadError && (
        <div className="rounded-xl border border-red-700 bg-red-900/20 p-4 text-red-200 text-sm mb-6">
          {loadError}
          {loadError.includes('wa_agent_turns') && ' -- has migration 20261002000100_wa_agent_turns.sql been applied?'}
        </div>
      )}

      {review && !review.leadFound && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 text-gray-300 text-sm mb-6">
          No WhatsApp conversation for {filters.phone}.
        </div>
      )}

      {s && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat value={String(s.total)} label={`turns · ${s.distinctLeads} people${s.sampled ? ' (latest 5,000)' : ''}`} />
            <Stat
              value={s.total ? pct(s.fallbackRate) : '–'}
              label={`fell back to menu (${s.fallback})`}
              tone={s.fallbackRate > 0.2 ? 'bad' : s.fallbackRate > 0.05 ? 'warn' : 'normal'}
            />
            <Stat
              value={s.latencyAvgMs != null ? `${(s.latencyAvgMs / 1000).toFixed(1)}s` : '–'}
              label={`avg reply time · p95 ${s.latencyP95Ms != null ? `${(s.latencyP95Ms / 1000).toFixed(1)}s` : '–'}`}
              tone={(s.latencyP95Ms ?? 0) > 15000 ? 'warn' : 'normal'}
            />
            <Stat
              value={`$${s.estimatedCostUsd.toFixed(s.estimatedCostUsd < 1 ? 3 : 2)}`}
              label={`est. model cost · ${((s.promptTokens + s.completionTokens) / 1000).toFixed(1)}k tokens`}
            />
          </div>

          {(s.fallbackReasons.length > 0 || s.tools.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                <p className="text-sm font-medium text-white mb-2">Why it fell back</p>
                {s.fallbackReasons.length === 0 ? (
                  <p className="text-sm text-gray-500">No fallbacks.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {s.fallbackReasons.slice(0, 8).map((r) => (
                        <tr key={r.reason} className="border-t border-gray-700/60">
                          <td className="py-1.5 font-mono text-gray-300">{r.reason}</td>
                          <td className="py-1.5 text-right text-gray-400 tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                <p className="text-sm font-medium text-white mb-2">Tools used</p>
                {s.tools.length === 0 ? (
                  <p className="text-sm text-gray-500">No tool calls.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {s.tools.map((t) => (
                        <tr key={t.name} className="border-t border-gray-700/60">
                          <td className="py-1.5 font-mono text-gray-300">{t.name}</td>
                          <td className="py-1.5 text-right text-gray-400 tabular-nums">
                            {t.count}
                            {t.failed > 0 && <span className="text-red-400"> · {t.failed} failed</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {review && review.turns.length === 0 && review.leadFound && !loadError && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
          No agent turns in this period.
          {config.mode === 'off' && ' The agent is off -- set WA_AGENT_MODE=shadow to start collecting.'}
        </div>
      )}

      <div className="space-y-4">
        {review?.turns.map((turn) => <TurnCard key={turn.id} turn={turn} />)}
      </div>

      {review && (filters.page > 1 || review.hasNextPage) && (
        <div className="flex justify-between mt-6">
          {filters.page > 1 ? (
            <Link href={hrefWith(filters, { page: filters.page - 1 })} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {review.hasNextPage && (
            <Link href={hrefWith(filters, { page: filters.page + 1 })} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
