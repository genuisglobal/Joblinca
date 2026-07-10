import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { runCoverageSentinel, type CoverageReport } from '@/lib/scrapers/coverage-sentinel';
import { sendAggregationAlert } from '@/lib/aggregation/alerts';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Daily aggregation digest (runs after the morning scrape, see vercel.json).
 *
 * Runs the coverage sentinel and sends admins a WhatsApp summary of source
 * health, anomalies (silent scraper failures, zero yields), and review-queue
 * depth. The full report is always returned in the response body so it's
 * inspectable in Vercel logs or by calling the route manually with the
 * CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const report = await runCoverageSentinel(supabase);
    const message = formatDigestMessage(report);
    const delivery = await sendAggregationAlert(message);

    return NextResponse.json({
      success: true,
      delivery,
      message,
      report,
    });
  } catch (err) {
    console.error('[cron aggregation-digest] Error:', err);
    return NextResponse.json(
      { error: 'Digest failed', details: String(err) },
      { status: 500 },
    );
  }
}

function formatDigestMessage(report: CoverageReport): string {
  const lines: string[] = [];
  const critical = report.anomalies.filter((a) => a.severity === 'critical');
  const warnings = report.anomalies.filter((a) => a.severity === 'warning');

  const headline =
    critical.length > 0
      ? `🚨 Joblinca aggregation: ${critical.length} critical issue${critical.length !== 1 ? 's' : ''}`
      : warnings.length > 0
        ? `⚠️ Joblinca aggregation: ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`
        : '✅ Joblinca aggregation: all sources healthy';
  lines.push(headline);
  lines.push('');

  if (critical.length > 0) {
    lines.push('*Critical:*');
    for (const a of critical) lines.push(`• ${a.message}`);
    lines.push('');
  }
  if (warnings.length > 0) {
    lines.push('*Warnings:*');
    for (const a of warnings) lines.push(`• ${a.message}`);
    lines.push('');
  }

  const totalFetched24h = report.sources.reduce((s, src) => s + src.fetched_24h, 0);
  const totalInserted24h = report.sources.reduce((s, src) => s + src.inserted_24h, 0);
  lines.push(
    `*Last 24h:* ${totalFetched24h} jobs fetched, ${totalInserted24h} new across ${report.sources.length} sources`
  );

  const activeSources = report.sources
    .filter((s) => s.fetched_24h > 0 || s.inserted_24h > 0)
    .map((s) => `${s.label} ${s.inserted_24h > 0 ? `+${s.inserted_24h}` : '0 new'}`);
  if (activeSources.length > 0) {
    lines.push(activeSources.join(' | '));
  }
  lines.push('');

  const q = report.review_queue;
  lines.push(
    `*Review queue:* ${q.needs_review} pending, ${q.suspicious} suspicious` +
      (q.oldest_review_days !== null && q.oldest_review_days >= 3
        ? ` — oldest waiting ${q.oldest_review_days}d ⏳`
        : '')
  );
  lines.push('');
  lines.push('Queue: joblinca.com/admin/aggregation/discovered-jobs');

  return lines.join('\n');
}
