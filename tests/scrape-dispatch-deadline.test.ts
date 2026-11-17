/**
 * The refresh-jobs dispatcher must stop waiting for slow per-source workers
 * and still run the publish (maintenance) step, instead of being killed by its
 * own 300s limit while waiting on the slowest scraper.
 */
import assert from 'node:assert/strict';

let completed = false;
// If the dispatcher hangs on a never-settling fetch, Node exits with an empty
// event loop and code 0 — treat that as a failure.
process.on('exit', (code) => {
  if (!completed && code === 0) {
    console.error('not ok - dispatcher never returned');
    process.exitCode = 1;
  }
});

async function main() {
  // Some transitive imports build a Supabase client at load time; give them a
  // placeholder, then remove it so the maintenance step makes no network calls.
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  const { runRefreshJobsDispatch } = await import('@/lib/scrapers/dispatch');
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('source=emploicm')) {
      // Hang until the dispatcher's deadline aborts us.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    }
    if (url.includes('source=kamerpower')) {
      return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
    }
    return new Response(JSON.stringify({ jobs: 3 }), { status: 200 });
  }) as typeof fetch;

  try {
    const started = Date.now();
    const summary = await runRefreshJobsDispatch({
      origin: 'http://localhost',
      maxPages: 1,
      earlyStop: true,
      includeExternalFeed: false,
      scrapeWaitBudgetMs: 300,

    });
    const elapsed = Date.now() - started;

    assert.ok(elapsed < 3000, `dispatcher should stop waiting at the deadline (took ${elapsed}ms)`);
    const slow = summary.scrape_dispatch.results.find((r) => r.source === 'emploicm');
    assert.equal(slow?.still_running, true, 'slow source is reported as still running');
    assert.equal(slow?.ok, true, 'still-running is not a failure (no alert)');
    assert.equal(summary.scrape_dispatch.still_running, 1);
    assert.equal(summary.scrape_dispatch.failed, 1, 'real HTTP failures still count');
    assert.equal(
      summary.scrape_dispatch.succeeded,
      summary.scrape_dispatch.dispatched - 2,
    );
    // Maintenance step was reached (returns null without Supabase env).
    assert.ok('maintenance' in summary);
    completed = true;
    console.log('ok - dispatcher stops waiting at the deadline and still runs maintenance');
  } finally {
    globalThis.fetch = realFetch;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
