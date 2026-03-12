import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/companies/[id]/reviews — list reviews for a company
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  const { data: reviews, error } = await supabase
    .from('company_reviews')
    .select('id, rating, title, body, is_current_employee, created_at, reviewer_id, profiles:reviewer_id(full_name, avatar_url)')
    .eq('company_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute aggregate stats
  const ratings = (reviews || []).map((r) => r.rating);
  const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
  const distribution = [1, 2, 3, 4, 5].map(
    (star) => ratings.filter((r) => r === star).length
  );

  // Normalize Supabase join (profiles may be array or object)
  const normalized = (reviews || []).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      isCurrentEmployee: r.is_current_employee,
      createdAt: r.created_at,
      reviewer: p
        ? { name: (p as { full_name: string | null; avatar_url: string | null }).full_name, avatarUrl: (p as { full_name: string | null; avatar_url: string | null }).avatar_url }
        : null,
    };
  });

  return NextResponse.json({
    reviews: normalized,
    stats: {
      count: ratings.length,
      average: Math.round(avg * 10) / 10,
      distribution,
    },
  });
}

/**
 * POST /api/companies/[id]/reviews — submit a review
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  // Rate limit
  const rl = await rateLimit(`review:${user.id}`, { requests: 5, window: '1h' });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many reviews' }, { status: 429 });
  }

  const body = await request.json();
  const { rating, title, reviewBody, isCurrentEmployee } = body as {
    rating?: number;
    title?: string;
    reviewBody?: string;
    isCurrentEmployee?: boolean;
  };

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1-5' }, { status: 400 });
  }

  // Verify company exists
  const { data: company } = await supabase
    .from('recruiters')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Prevent recruiters from reviewing their own company
  if (user.id === id) {
    return NextResponse.json({ error: 'Cannot review your own company' }, { status: 403 });
  }

  const { data: review, error } = await supabase
    .from('company_reviews')
    .upsert(
      {
        company_id: id,
        reviewer_id: user.id,
        rating,
        title: title?.trim() || null,
        body: reviewBody?.trim() || null,
        is_current_employee: isCurrentEmployee ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,reviewer_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ review }, { status: 201 });
}
