import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AdminRequiredError } from '@/lib/admin';
import {
  findTargetSeekers,
  sendBlast,
  type BlastFilters,
  type BlastRole,
} from '@/lib/whatsapp-agent/blast';

export const dynamic = 'force-dynamic';

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => (item as string).trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseRoles(value: unknown): BlastRole[] {
  const raw = parseStringArray(value);
  const allowed: BlastRole[] = ['job_seeker', 'talent'];
  return raw.filter((role): role is BlastRole =>
    allowed.includes(role as BlastRole)
  );
}

function extractFilters(source: {
  get: (key: string) => string | null;
}): BlastFilters {
  return {
    keywords: parseStringArray(source.get('keywords')),
    qualifications: parseStringArray(source.get('qualifications')),
    locations: parseStringArray(source.get('locations')),
    roles: parseRoles(source.get('roles')),
    seekerIds: parseStringArray(source.get('seekerIds')),
    requirePhone: source.get('requirePhone') === 'false' ? false : true,
  };
}

function filtersFromBody(body: Record<string, unknown>): BlastFilters {
  return {
    keywords: parseStringArray(body.keywords),
    qualifications: parseStringArray(body.qualifications),
    locations: parseStringArray(body.locations),
    roles: parseRoles(body.roles),
    seekerIds: parseStringArray(body.seekerIds),
    requirePhone: body.requirePhone === false ? false : true,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const filters = extractFilters(new URL(request.url).searchParams);
  const sampleLimit = Number(
    new URL(request.url).searchParams.get('sampleLimit') || 25
  );

  try {
    const recipients = await findTargetSeekers(filters);
    return NextResponse.json({
      ok: true,
      count: recipients.length,
      sample: recipients.slice(0, Math.max(1, Math.min(sampleLimit, 100))).map(
        (r) => ({
          userId: r.userId,
          phone: r.phone,
          name: r.fullName || r.firstName,
          role: r.role,
          location: r.location,
        })
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'failed_to_preview_blast',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const body = await request.json().catch(() => ({}));
  const filters = filtersFromBody(body || {});
  const dryRun = body?.dryRun === true;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const templateName =
    typeof body?.templateName === 'string' && body.templateName.trim()
      ? body.templateName.trim()
      : undefined;
  const templateLanguage =
    typeof body?.templateLanguage === 'string' && body.templateLanguage.trim()
      ? body.templateLanguage.trim()
      : 'en';

  if (!dryRun && !message && !templateName) {
    return NextResponse.json(
      { error: '`message` or `templateName` is required to send a blast' },
      { status: 422 }
    );
  }

  try {
    const recipients = await findTargetSeekers(filters);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        count: recipients.length,
        sample: recipients.slice(0, 25).map((r) => ({
          userId: r.userId,
          phone: r.phone,
          name: r.fullName || r.firstName,
          role: r.role,
          location: r.location,
        })),
      });
    }

    const maxRecipients = Number(body?.maxRecipients || 2000);
    const targets = recipients.slice(0, Math.max(1, maxRecipients));

    const result = await sendBlast({
      recipients: targets,
      message: message || undefined,
      templateName,
      templateLanguage,
      batchSize: Number(body?.batchSize || 20),
      delayMs: Number(body?.delayMs ?? 1000),
    });

    return NextResponse.json({
      ok: true,
      matched: recipients.length,
      attempted: targets.length,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'failed_to_send_blast',
      },
      { status: 500 }
    );
  }
}
