import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: jobId } = await context.params;
  const supabase = createServerSupabaseClient();

  try {
    const body = await request.json();
    const { method } = body;

    // Validate method
    const validMethods = ['external_url', 'email', 'phone', 'whatsapp', 'copy_link'];
    if (!method || !validMethods.includes(method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 });
    }

    // Get user ID if authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Get IP hash for fraud prevention (not storing raw IP)
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    const ip = forwardedFor?.split(',')[0] || realIp || 'unknown';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);

    // Get user agent
    const userAgent = headersList.get('user-agent') || null;

    // Insert click record
    const { error } = await supabase.from('external_apply_clicks').insert({
      job_id: jobId,
      user_id: user?.id || null,
      method,
      ip_hash: ipHash,
      user_agent: userAgent?.substring(0, 500), // Limit length
    });

    if (error) {
      console.error('Failed to track click:', error);
      // Don't expose internal errors, just log them
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Track click error:', err);
    // Always return success to not block user flow
    return NextResponse.json({ success: true });
  }
}
