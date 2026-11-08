/**
 * Minimal Apify REST client (no SDK dependency).
 *
 * Joblinca starts actor runs with an ad-hoc webhook attached; when a run
 * succeeds Apify calls /api/webhooks/apify?kind=..., and the webhook re-reads
 * the run from this API (with our token) before trusting any data. The webhook
 * body itself is never trusted for dataset ids.
 */

const APIFY_API = 'https://api.apify.com/v2';

export type ApifyRunKind = 'fb_groups' | 'fb_search' | 'fb_pages';

/** Actor for each run kind (Apify Store, maintained by Apify). */
export const APIFY_ACTORS: Record<ApifyRunKind, string> = {
  fb_groups: 'apify/facebook-groups-scraper',
  fb_search: 'apify/facebook-search-scraper',
  fb_pages: 'apify/facebook-pages-scraper',
};

export function isApifyRunKind(value: unknown): value is ApifyRunKind {
  return value === 'fb_groups' || value === 'fb_search' || value === 'fb_pages';
}

export interface ApifyRun {
  id: string;
  actId: string;
  status: string;
  defaultDatasetId: string;
  startedAt?: string;
}

function getToken(): string {
  const token = (process.env.APIFY_TOKEN || '').trim();
  if (!token) throw new Error('APIFY_TOKEN is not configured');
  return token;
}

export function isApifyConfigured(): boolean {
  return Boolean(
    (process.env.APIFY_TOKEN || '').trim() && (process.env.APIFY_WEBHOOK_SECRET || '').trim(),
  );
}

async function apifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${APIFY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify ${init?.method || 'GET'} ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Apify's URL form of an actor name: "apify/x" -> "apify~x". */
function actorPath(actor: string): string {
  return encodeURIComponent(actor.replace('/', '~'));
}

const actorIdCache = new Map<string, string>();

/** Resolve an actor name to its immutable id (run objects carry the id). */
export async function resolveActorId(actor: string): Promise<string> {
  const cached = actorIdCache.get(actor);
  if (cached) return cached;
  const { data } = await apifyFetch<{ data: { id: string } }>(`/acts/${actorPath(actor)}`);
  actorIdCache.set(actor, data.id);
  return data.id;
}

export interface StartRunOptions {
  /** Absolute URL Apify should call when the run succeeds. */
  webhookUrl: string;
  /** Hard spending cap for pay-per-event actors, in USD. */
  maxTotalChargeUsd: number;
  timeoutSecs?: number;
}

export async function startActorRun(
  actor: string,
  input: Record<string, unknown>,
  options: StartRunOptions,
): Promise<ApifyRun> {
  const secret = (process.env.APIFY_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('APIFY_WEBHOOK_SECRET is not configured');

  const webhooks = [
    {
      eventTypes: ['ACTOR.RUN.SUCCEEDED'],
      requestUrl: options.webhookUrl,
      headersTemplate: JSON.stringify({ 'x-apify-secret': secret }),
    },
  ];

  const params = new URLSearchParams({
    webhooks: Buffer.from(JSON.stringify(webhooks)).toString('base64'),
    maxTotalChargeUsd: String(options.maxTotalChargeUsd),
    timeout: String(options.timeoutSecs ?? 900),
  });

  const { data } = await apifyFetch<{ data: ApifyRun }>(
    `/acts/${actorPath(actor)}/runs?${params.toString()}`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return data;
}

export async function getActorRun(runId: string): Promise<ApifyRun> {
  if (!/^[A-Za-z0-9]{1,64}$/.test(runId)) throw new Error('Invalid Apify run id');
  const { data } = await apifyFetch<{ data: ApifyRun }>(`/actor-runs/${runId}`);
  return data;
}

export async function getDatasetItems(datasetId: string, limit = 500): Promise<unknown[]> {
  if (!/^[A-Za-z0-9]{1,64}$/.test(datasetId)) throw new Error('Invalid Apify dataset id');
  const params = new URLSearchParams({ clean: 'true', format: 'json', limit: String(limit) });
  return apifyFetch<unknown[]>(`/datasets/${datasetId}/items?${params.toString()}`);
}
