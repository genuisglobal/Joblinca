import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';
import {
  getCurrentDoualaWeekWindow,
  getDoualaWeekWindowFromKey,
  type DoualaWeekWindow,
} from '@/lib/skillup/challenges';

interface ChallengeRow {
  id: string;
  title: string;
  top_n: number;
  starts_at: string;
  ends_at: string;
  status: string;
}

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
  details: Array<{
    challenge_id: string;
    title: string;
    selected_submissions: number;
    published_rows: number;
  }>;
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
    .select('id, title, top_n, starts_at, ends_at, status')
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
    details: [],
  };

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

  return result;
}
