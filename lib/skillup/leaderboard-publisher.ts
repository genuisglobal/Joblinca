import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';
import {
  getCurrentDoualaWeekWindow,
  getDoualaWeekWindowFromKey,
  type DoualaWeekWindow,
} from '@/lib/skillup/challenges';
import { keywordsForDomain } from '@/lib/skillup/domain-keywords';

const BOOST_TOKENS_BY_RANK: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
const BOOST_EXPIRY_DAYS = 30;
const AUTO_INTRO_JOBS_PER_WINNER = 2;
const AUTO_INTRO_JOB_LOOKBACK_DAYS = 21;

interface ChallengeRow {
  id: string;
  title: string;
  title_fr: string | null;
  domain: string | null;
  top_n: number;
  starts_at: string;
  ends_at: string;
  status: string;
}

const SPOTLIGHT_WINDOW_DAYS = 7;
const SPOTLIGHTS_PER_DOMAIN = 3;

interface SubmissionRow {
  id: string;
  user_id: string;
  final_score: number;
  completion_seconds: number | null;
  created_at: string;
}

interface RankedEntry {
  challenge_id: string;
  user_id: string;
  rank: number;
  score: number;
  tie_breaker: number;
  submission_id: string;
}

export interface PublishWeeklyLeaderboardOptions {
  weekKey?: string;
  challengeId?: string | null;
  notifyWhatsapp?: boolean;
  topNOverride?: number | null;
  now?: Date;
}

export interface PublishWeeklyLeaderboardResult {
  week: DoualaWeekWindow;
  challenges_processed: number;
  entries_published: number;
  notifications_sent: number;
  notifications_failed: number;
  spotlights_created: number;
  boosts_granted: number;
  auto_intros_created: number;
  details: Array<{
    challenge_id: string;
    title: string;
    selected_submissions: number;
    published_rows: number;
  }>;
}

interface DomainCandidate {
  user_id: string;
  score: number;
  tie_breaker: number;
  challenge_id: string;
  challenge_title: string;
  challenge_title_fr: string | null;
  rank: number;
}

function rankLevel(rank: number): string {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return 'bronze';
}

function chooseTopAttemptsByUser(submissions: SubmissionRow[]): SubmissionRow[] {
  const bestByUser = new Map<string, SubmissionRow>();

  for (const submission of submissions) {
    const existing = bestByUser.get(submission.user_id);
    if (!existing) {
      bestByUser.set(submission.user_id, submission);
      continue;
    }

    if (submission.final_score > existing.final_score) {
      bestByUser.set(submission.user_id, submission);
      continue;
    }

    if (submission.final_score < existing.final_score) {
      continue;
    }

    const completionA =
      typeof submission.completion_seconds === 'number'
        ? submission.completion_seconds
        : Number.MAX_SAFE_INTEGER;
    const completionB =
      typeof existing.completion_seconds === 'number'
        ? existing.completion_seconds
        : Number.MAX_SAFE_INTEGER;

    if (completionA < completionB) {
      bestByUser.set(submission.user_id, submission);
      continue;
    }

    if (completionA > completionB) {
      continue;
    }

    const createdA = Date.parse(submission.created_at);
    const createdB = Date.parse(existing.created_at);
    if (createdA < createdB) {
      bestByUser.set(submission.user_id, submission);
    }
  }

  return Array.from(bestByUser.values());
}

function sortForRanking(a: SubmissionRow, b: SubmissionRow): number {
  if (a.final_score !== b.final_score) {
    return b.final_score - a.final_score;
  }

  const completionA =
    typeof a.completion_seconds === 'number'
      ? a.completion_seconds
      : Number.MAX_SAFE_INTEGER;
  const completionB =
    typeof b.completion_seconds === 'number'
      ? b.completion_seconds
      : Number.MAX_SAFE_INTEGER;

  if (completionA !== completionB) {
    return completionA - completionB;
  }

  const createdA = Date.parse(a.created_at);
  const createdB = Date.parse(b.created_at);
  if (createdA !== createdB) {
    return createdA - createdB;
  }

  return a.id.localeCompare(b.id);
}

async function maybeSendWinnerWhatsapp(params: {
  userId: string;
  rank: number;
  challengeTitle: string;
  weekKey: string;
}): Promise<boolean> {
  const db = createServiceSupabaseClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';

  const { data: lead } = await db
    .from('wa_leads')
    .select('phone_e164')
    .eq('linked_user_id', params.userId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let phone = lead?.phone_e164 || null;
  if (!phone) {
    const { data: profile } = await db
      .from('profiles')
      .select('phone')
      .eq('id', params.userId)
      .maybeSingle();
    phone = profile?.phone || null;
  }

  if (!phone) return false;

  const message = [
    `Congrats! You are ranked #${params.rank} this week.`,
    `${params.challengeTitle} (${params.weekKey})`,
    `See leaderboard: ${appUrl}/dashboard/talent/leaderboard`,
  ].join('\n');

  await sendWhatsappMessage(phone, message, params.userId);
  return true;
}

export async function publishWeeklyLeaderboard(
  options: PublishWeeklyLeaderboardOptions = {}
): Promise<PublishWeeklyLeaderboardResult> {
  const db = createServiceSupabaseClient();
  const week = options.weekKey
    ? getDoualaWeekWindowFromKey(options.weekKey)
    : getCurrentDoualaWeekWindow(options.now);

  if (!week) {
    throw new Error('Invalid week key');
  }

  let challengesQuery = db
    .from('talent_challenges')
    .select('id, title, title_fr, domain, top_n, starts_at, ends_at, status')
    .in('status', ['active', 'closed', 'published'])
    .lte('starts_at', week.windowEndUtc.toISOString())
    .gte('ends_at', week.windowStartUtc.toISOString())
    .order('starts_at', { ascending: false });

  if (options.challengeId) {
    challengesQuery = challengesQuery.eq('id', options.challengeId);
  }

  const { data: challengeRows, error: challengeError } = await challengesQuery;
  if (challengeError) {
    throw new Error(`Failed to load challenges: ${challengeError.message}`);
  }

  const challenges = (challengeRows || []) as ChallengeRow[];
  const result: PublishWeeklyLeaderboardResult = {
    week,
    challenges_processed: 0,
    entries_published: 0,
    notifications_sent: 0,
    notifications_failed: 0,
    spotlights_created: 0,
    boosts_granted: 0,
    auto_intros_created: 0,
    details: [],
  };

  const candidatesByDomain = new Map<string, DomainCandidate[]>();

  for (const challenge of challenges) {
    const { data: submissionsData, error: submissionsError } = await db
      .from('talent_challenge_submissions')
      .select('id, user_id, final_score, completion_seconds, created_at')
      .eq('challenge_id', challenge.id)
      .in('status', ['submitted', 'graded'])
      .not('final_score', 'is', null)
      .gte('created_at', week.windowStartUtc.toISOString())
      .lte('created_at', week.windowEndUtc.toISOString());

    if (submissionsError) {
      throw new Error(
        `Failed to load submissions for ${challenge.id}: ${submissionsError.message}`
      );
    }

    const scored = ((submissionsData || []) as Array<
      Omit<SubmissionRow, 'final_score'> & { final_score: number | string | null }
    >)
      .map((row) => ({
        id: row.id,
        user_id: row.user_id,
        final_score: Number(row.final_score),
        completion_seconds:
          typeof row.completion_seconds === 'number' ? row.completion_seconds : null,
        created_at: row.created_at,
      }))
      .filter((row) => Number.isFinite(row.final_score)) as SubmissionRow[];

    const bestAttempts = chooseTopAttemptsByUser(scored).sort(sortForRanking);
    const topLimitRaw = options.topNOverride ?? challenge.top_n ?? 10;
    const topLimit = Number.isFinite(topLimitRaw)
      ? Math.max(1, Math.min(100, Math.floor(topLimitRaw)))
      : 10;
    const winners = bestAttempts.slice(0, topLimit);

    await db
      .from('talent_weekly_leaderboards')
      .delete()
      .eq('week_key', week.weekKey)
      .eq('challenge_id', challenge.id);

    const ranked: RankedEntry[] = winners.map((row, index) => ({
      challenge_id: challenge.id,
      user_id: row.user_id,
      rank: index + 1,
      score: Math.round(row.final_score * 100) / 100,
      tie_breaker:
        typeof row.completion_seconds === 'number'
          ? row.completion_seconds
          : Math.floor(Date.parse(row.created_at) / 1000),
      submission_id: row.id,
    }));

    if (ranked.length > 0 && challenge.domain) {
      const bucket = candidatesByDomain.get(challenge.domain) || [];
      for (const entry of ranked) {
        bucket.push({
          user_id: entry.user_id,
          score: entry.score,
          tie_breaker: entry.tie_breaker,
          challenge_id: challenge.id,
          challenge_title: challenge.title,
          challenge_title_fr: challenge.title_fr,
          rank: entry.rank,
        });
      }
      candidatesByDomain.set(challenge.domain, bucket);
    }

    if (ranked.length > 0) {
      const { error: insertLeaderboardError } = await db
        .from('talent_weekly_leaderboards')
        .insert(
          ranked.map((entry) => ({
            week_key: week.weekKey,
            week_start: week.weekStartDate,
            week_end: week.weekEndDate,
            challenge_id: entry.challenge_id,
            user_id: entry.user_id,
            rank: entry.rank,
            score: entry.score,
            tie_breaker: entry.tie_breaker,
            metadata: {
              submission_id: entry.submission_id,
            },
          }))
        );

      if (insertLeaderboardError) {
        throw new Error(
          `Failed to insert leaderboard rows for ${challenge.id}: ${insertLeaderboardError.message}`
        );
      }

      const achievementsPayload = ranked.map((entry) => ({
        user_id: entry.user_id,
        source_type: 'challenge_weekly_top',
        source_key: `challenge_weekly_top:${week.weekKey}:${challenge.id}:${entry.user_id}:r${entry.rank}`,
        title: `Top ${entry.rank} - ${challenge.title}`,
        description: `Top ${topLimit} performer for ${challenge.title} in week ${week.weekKey}.`,
        issued_at: new Date().toISOString(),
        metadata: {
          week_key: week.weekKey,
          challenge_id: challenge.id,
          challenge_title: challenge.title,
          rank: entry.rank,
          score: entry.score,
        },
      }));

      const { error: achievementsError } = await db
        .from('talent_achievements')
        .upsert(achievementsPayload, { onConflict: 'source_key' });

      if (achievementsError) {
        throw new Error(
          `Failed to upsert achievements for ${challenge.id}: ${achievementsError.message}`
        );
      }

      for (const entry of ranked) {
        const { data: existingBadge } = await db
          .from('user_badges')
          .select('id')
          .eq('user_id', entry.user_id)
          .eq('badge_type', 'challenge_top_performer')
          .eq('metadata->>week_key', week.weekKey)
          .eq('metadata->>challenge_id', challenge.id)
          .maybeSingle();

        if (!existingBadge) {
          await db.from('user_badges').insert({
            user_id: entry.user_id,
            badge_type: 'challenge_top_performer',
            badge_level: rankLevel(entry.rank),
            metadata: {
              week_key: week.weekKey,
              challenge_id: challenge.id,
              challenge_title: challenge.title,
              rank: entry.rank,
              score: entry.score,
              badge_name: `Top Performer - ${challenge.title} (${week.weekKey})`,
            },
          });
        }
      }

      if (options.notifyWhatsapp !== false) {
        for (const entry of ranked) {
          try {
            const delivered = await maybeSendWinnerWhatsapp({
              userId: entry.user_id,
              rank: entry.rank,
              challengeTitle: challenge.title,
              weekKey: week.weekKey,
            });
            if (delivered) {
              result.notifications_sent += 1;
            }
          } catch {
            result.notifications_failed += 1;
          }
        }
      }
    }

    result.challenges_processed += 1;
    result.entries_published += ranked.length;
    result.details.push({
      challenge_id: challenge.id,
      title: challenge.title,
      selected_submissions: bestAttempts.length,
      published_rows: ranked.length,
    });
  }

  // Spotlight aggregation: pick top N unique users per domain across all
  // challenges processed this run. A user appears at most once per domain.
  const spotlightStartIso = new Date().toISOString();
  const spotlightEndIso = new Date(
    Date.now() + SPOTLIGHT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  for (const [domain, candidates] of candidatesByDomain.entries()) {
    const sorted = [...candidates].sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.tie_breaker !== b.tie_breaker) return a.tie_breaker - b.tie_breaker;
      return a.user_id.localeCompare(b.user_id);
    });

    const seenUsers = new Set<string>();
    const picks: DomainCandidate[] = [];
    for (const candidate of sorted) {
      if (seenUsers.has(candidate.user_id)) continue;
      seenUsers.add(candidate.user_id);
      picks.push(candidate);
      if (picks.length >= SPOTLIGHTS_PER_DOMAIN) break;
    }

    if (picks.length === 0) continue;

    const spotlightRows = picks.map((pick, index) => ({
      user_id: pick.user_id,
      source_type: 'weekly_winner',
      source_ref: pick.challenge_id,
      domain,
      rank: index + 1,
      week_key: week.weekKey,
      headline: `Top ${index + 1} - ${pick.challenge_title}`,
      headline_fr: pick.challenge_title_fr
        ? `Top ${index + 1} - ${pick.challenge_title_fr}`
        : null,
      starts_at: spotlightStartIso,
      ends_at: spotlightEndIso,
      metadata: {
        week_key: week.weekKey,
        challenge_id: pick.challenge_id,
        domain,
        score: pick.score,
        source_rank: pick.rank,
      },
    }));

    const { data: insertedSpotlights, error: spotlightError } = await db
      .from('talent_spotlights')
      .upsert(spotlightRows, {
        onConflict: 'user_id,source_type,source_ref',
        ignoreDuplicates: false,
      })
      .select('id');

    if (spotlightError) {
      throw new Error(
        `Failed to upsert spotlights for domain ${domain}: ${spotlightError.message}`
      );
    }

    result.spotlights_created += insertedSpotlights?.length ?? 0;

    // A2 — grant boost tokens to the same Top 3 per domain.
    const boostExpiresAt = new Date(
      Date.now() + BOOST_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const boostRows = picks.map((pick, index) => {
      const rank = index + 1;
      const tokens = BOOST_TOKENS_BY_RANK[rank] ?? 1;
      return {
        user_id: pick.user_id,
        granted_for: `${week.weekKey}:${domain}`,
        source_type: 'weekly_winner',
        source_ref: pick.challenge_id,
        domain,
        tokens_granted: tokens,
        tokens_remaining: tokens,
        expires_at: boostExpiresAt,
        metadata: {
          week_key: week.weekKey,
          domain,
          challenge_id: pick.challenge_id,
          rank,
          score: pick.score,
        },
      };
    });

    if (boostRows.length > 0) {
      // ON CONFLICT (user_id, granted_for) DO NOTHING is the simplest idempotent
      // strategy: a rerun of the same week+domain won't refund or duplicate tokens.
      const { data: insertedBoosts, error: boostError } = await db
        .from('talent_application_boosts')
        .upsert(boostRows, {
          onConflict: 'user_id,granted_for',
          ignoreDuplicates: true,
        })
        .select('id');

      if (boostError) {
        throw new Error(
          `Failed to upsert application boosts for domain ${domain}: ${boostError.message}`
        );
      }

      result.boosts_granted += insertedBoosts?.length ?? 0;
    }

    // A3 — auto-intro winners to recruiters whose published jobs match the
    // domain keywords. Best-effort: failures here must not block the rest of
    // the cron.
    const keywords = keywordsForDomain(domain);
    if (keywords.length > 0 && picks.length > 0) {
      const jobSinceIso = new Date(
        Date.now() - AUTO_INTRO_JOB_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      const orFilter = keywords
        .map((kw) => `title.ilike.%${kw.replace(/[%,]/g, '')}%`)
        .join(',');

      const { data: matchingJobs, error: jobsError } = await db
        .from('jobs')
        .select('id, recruiter_id, title, created_at')
        .eq('published', true)
        .gte('created_at', jobSinceIso)
        .or(orFilter)
        .order('created_at', { ascending: false })
        .limit(AUTO_INTRO_JOBS_PER_WINNER * picks.length);

      if (!jobsError && Array.isArray(matchingJobs) && matchingJobs.length > 0) {
        type JobRow = {
          id: string;
          recruiter_id: string | null;
          title: string;
          created_at: string;
        };
        const jobs = matchingJobs as JobRow[];

        for (const pick of picks) {
          const winnersJobs = jobs.slice(0, AUTO_INTRO_JOBS_PER_WINNER);
          for (const job of winnersJobs) {
            if (!job.recruiter_id || job.recruiter_id === pick.user_id) continue;

            // Skip if an auto-intro for this (recruiter, candidate, job, week) already exists.
            const { data: existingIntro } = await db
              .from('recruiter_candidate_outreach_events')
              .select('id')
              .eq('recruiter_id', job.recruiter_id)
              .eq('candidate_id', pick.user_id)
              .eq('source', 'spotlight_auto_intro')
              .eq('metadata->>week_key', week.weekKey)
              .eq('job_id', job.id)
              .maybeSingle();
            if (existingIntro) continue;

            const { error: introError } = await db
              .from('recruiter_candidate_outreach_events')
              .insert({
                recruiter_id: job.recruiter_id,
                candidate_id: pick.user_id,
                job_id: job.id,
                channel: 'joblinca_message',
                source: 'spotlight_auto_intro',
                metadata: {
                  week_key: week.weekKey,
                  domain,
                  challenge_id: pick.challenge_id,
                  challenge_title: pick.challenge_title,
                  score: pick.score,
                  job_title: job.title,
                  generated_by: 'skillup-weekly-leaderboard',
                },
              });

            if (!introError) {
              result.auto_intros_created += 1;
            }
          }
        }
      }
    }
  }

  return result;
}
