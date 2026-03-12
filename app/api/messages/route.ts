import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

/**
 * GET /api/messages — list conversations (grouped by other party)
 * GET /api/messages?with=<userId> — messages with a specific user
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const withUser = request.nextUrl.searchParams.get('with');

  if (withUser) {
    // Get conversation with specific user
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, job_id, body, read_at, created_at')
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${withUser}),and(sender_id.eq.${withUser},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark unread messages from the other party as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', withUser)
      .eq('receiver_id', user.id)
      .is('read_at', null);

    return NextResponse.json({ messages });
  }

  // List conversations: get latest message per conversation partner
  const { data: sent } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, body, read_at, created_at')
    .eq('sender_id', user.id)
    .order('created_at', { ascending: false });

  const { data: received } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, body, read_at, created_at')
    .eq('receiver_id', user.id)
    .order('created_at', { ascending: false });

  const allMessages = [...(sent || []), ...(received || [])];

  // Group by conversation partner, keep latest message
  const conversations = new Map<
    string,
    { partnerId: string; lastMessage: (typeof allMessages)[0]; unreadCount: number }
  >();

  for (const msg of allMessages) {
    const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
    const existing = conversations.get(partnerId);

    if (!existing || new Date(msg.created_at) > new Date(existing.lastMessage.created_at)) {
      const unread = existing?.unreadCount ?? 0;
      conversations.set(partnerId, {
        partnerId,
        lastMessage: msg,
        unreadCount:
          msg.receiver_id === user.id && !msg.read_at
            ? unread + 1
            : unread,
      });
    } else if (msg.receiver_id === user.id && !msg.read_at) {
      existing.unreadCount++;
    }
  }

  // Fetch partner profiles
  const partnerIds = Array.from(conversations.keys());
  const { data: profiles } = partnerIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', partnerIds)
    : { data: [] };

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  const result = Array.from(conversations.values())
    .sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() -
        new Date(a.lastMessage.created_at).getTime()
    )
    .map((conv) => ({
      ...conv,
      partner: profileMap.get(conv.partnerId) || null,
    }));

  return NextResponse.json({ conversations: result });
}

/**
 * POST /api/messages — send a message
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  // Rate limit: 30 messages per minute
  const rl = await rateLimit(`msg:${user.id}`, { requests: 30, window: '1m' });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many messages' }, { status: 429 });
  }

  const body = await request.json();
  const { receiverId, message, jobId } = body as {
    receiverId?: string;
    message?: string;
    jobId?: string;
  };

  if (!receiverId || !message?.trim()) {
    return NextResponse.json(
      { error: 'receiverId and message are required' },
      { status: 400 }
    );
  }

  if (receiverId === user.id) {
    return NextResponse.json(
      { error: 'Cannot message yourself' },
      { status: 400 }
    );
  }

  // Verify receiver exists
  const { data: receiver } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', receiverId)
    .maybeSingle();

  if (!receiver) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      receiver_id: receiverId,
      job_id: jobId || null,
      body: message.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: msg }, { status: 201 });
}
