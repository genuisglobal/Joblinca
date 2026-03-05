import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AdminRequiredError } from '@/lib/admin';
import { generateTownRoundup } from '@/lib/whatsapp-agent/town-roundup';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const town = (searchParams.get('town') || '').trim();
  const days = Number(searchParams.get('days') || 7);
  const limit = Number(searchParams.get('limit') || 15);

  if (!town) {
    return NextResponse.json({ error: '`town` query param is required' }, { status: 422 });
  }

  try {
    const roundup = await generateTownRoundup({ town, days, limit });
    return NextResponse.json({
      ok: true,
      ...roundup,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'failed_to_generate_roundup',
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
  const towns = Array.isArray(body?.towns)
    ? body.towns.filter((value: unknown) => typeof value === 'string' && value.trim())
    : [];
  const days = Number(body?.days || 7);
  const limit = Number(body?.limit || 15);

  if (towns.length === 0) {
    return NextResponse.json(
      { error: '`towns` array is required and must contain at least one town' },
      { status: 422 }
    );
  }

  const results = [];
  for (const town of towns) {
    try {
      const roundup = await generateTownRoundup({ town, days, limit });
      results.push({
        town,
        ok: true,
        jobsCount: roundup.jobs.length,
        message: roundup.message,
      });
    } catch (error) {
      results.push({
        town,
        ok: false,
        error: error instanceof Error ? error.message : 'failed_to_generate_roundup',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    results,
  });
}
