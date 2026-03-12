import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin';

interface RouteContext {
  params: {
    id: string;
  };
}

interface ProfileLookup {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
}

type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';
type NotificationChannel = 'whatsapp' | 'email';

interface NotificationRow {
  user_id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  match_score: number;
  match_reason: string | null;
  match_reason_signals: unknown;
  trigger_source: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  profiles: ProfileLookup | ProfileLookup[] | null;
}

function getDisplayName(profile: ProfileLookup | null): string {
  if (!profile) return 'Unknown user';
  const firstName = (profile.first_name || '').trim();
  const lastName = (profile.last_name || '').trim();
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }

  const fullName = (profile.full_name || '').trim();
  if (fullName) return fullName;
  return 'Unknown user';
}

function normalizeProfile(
  profile: ProfileLookup | ProfileLookup[] | null
): ProfileLookup | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] || null;
  return profile;
}

function latestTimestampIso(existing: string, candidate: string): string {
  return candidate > existing ? candidate : existing;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const serviceClient = createServiceSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const [{ data: profile }, { data: job }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, role, admin_type')
      .eq('id', user.id)
      .maybeSingle(),
    serviceClient
      .from('jobs')
      .select('id, recruiter_id, posted_by')
      .eq('id', params.id)
      .maybeSingle(),
  ]);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const isActiveAdmin = Boolean(
    profile?.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );
  const isRecruiterOwner = job.recruiter_id === user.id || job.posted_by === user.id;

  if (!isActiveAdmin && !isRecruiterOwner) {
    return NextResponse.json(
      { error: 'Only admins and assigned recruiters can access match insights' },
      { status: 403 }
    );
  }

  const { data, error } = await serviceClient
    .from('job_match_notifications')
    .select(
      'user_id, channel, status, match_score, match_reason, match_reason_signals, trigger_source, last_error, created_at, sent_at, profiles:user_id(full_name, first_name, last_name, role)'
    )
    .eq('job_id', params.id)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json(
      { error: `Failed to load match insights: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = (data || []) as NotificationRow[];
  const perUser = new Map<
    string,
      {
        userId: string;
        name: string;
        role: string | null;
        score: number;
        reason: string | null;
        reasonSignals: string[];
      lastAttemptAt: string;
      channels: {
        whatsapp: {
          status: NotificationStatus;
          sentAt: string | null;
          error: string | null;
          trigger: string | null;
        } | null;
        email: {
          status: NotificationStatus;
          sentAt: string | null;
          error: string | null;
          trigger: string | null;
        } | null;
      };
    }
  >();

  const totals = {
    channelDispatches: rows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    pending: 0,
  };

  for (const row of rows) {
    if (row.status === 'sent') totals.sent += 1;
    if (row.status === 'skipped') totals.skipped += 1;
    if (row.status === 'failed') totals.failed += 1;
    if (row.status === 'pending') totals.pending += 1;

    const profileData = normalizeProfile(row.profiles);
    const reasonSignals = normalizeStringArray(row.match_reason_signals);
    const existing = perUser.get(row.user_id);
    const channelData = {
      status: row.status,
      sentAt: row.sent_at,
      error: row.last_error,
      trigger: row.trigger_source,
    };

    if (!existing) {
      perUser.set(row.user_id, {
        userId: row.user_id,
        name: getDisplayName(profileData),
        role: profileData?.role || null,
        score: row.match_score || 0,
        reason: row.match_reason || null,
        reasonSignals,
        lastAttemptAt: row.created_at,
        channels: {
          whatsapp: row.channel === 'whatsapp' ? channelData : null,
          email: row.channel === 'email' ? channelData : null,
        },
      });
      continue;
    }

    existing.score = Math.max(existing.score, row.match_score || 0);
    if (!existing.reason && row.match_reason) {
      existing.reason = row.match_reason;
    }
    if (existing.reasonSignals.length === 0 && reasonSignals.length > 0) {
      existing.reasonSignals = reasonSignals;
    }
    existing.lastAttemptAt = latestTimestampIso(existing.lastAttemptAt, row.created_at);

    if (row.channel === 'whatsapp') {
      existing.channels.whatsapp = channelData;
    } else {
      existing.channels.email = channelData;
    }
  }

  const matches = Array.from(perUser.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.lastAttemptAt.localeCompare(a.lastAttemptAt);
    })
    .slice(0, 200);

  return NextResponse.json({
    jobId: params.id,
    totals: {
      ...totals,
      matchedUsers: perUser.size,
      returnedUsers: matches.length,
    },
    matches,
  });
}
