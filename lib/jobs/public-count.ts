/**
 * Total number of publicly listed opportunities, computed by the same
 * endpoint /jobs uses (GET /api/jobs -> search_public_job_counts, with its
 * legacy fallback). The homepage used its own query, which also counted
 * jobs past their closing date or removed, so it showed 349 while /jobs
 * showed 306 (2026-11-07). Returns null when the endpoint is unavailable so
 * callers can fall back.
 */
export async function fetchPublicOpportunityTotal(baseUrl: string): Promise<number | null> {
  try {
    const response = await fetch(`${baseUrl}/api/jobs?limit=1&offset=0`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { counts?: { all?: unknown }; total?: unknown } | null;
    const total = payload?.counts?.all ?? payload?.total;
    return typeof total === 'number' && Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}
