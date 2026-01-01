import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * API Route: /api/resume/optimize
 *
 * Uses AI to suggest improvements to a resume.  Clients must send
 * the current resume data (as JSON).  Premium subscribers are
 * limited to one optimisation per day to help control usage of
 * OpenAI credits.  Non‑premium users or those who exceed their
 * daily allowance will receive a 429 response.  If an OpenAI API
 * key is not configured the endpoint simply echoes back the
 * provided resume data.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  // Get the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Parse the incoming resume data
  let resumeData: any;
  try {
    resumeData = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  // Check subscription status.  We assume an active subscription row
  // in the `subscriptions` table indicates premium access.  If no
  // subscription exists or the status is not 'active', the user is
  // considered non‑premium.
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  const isPremium = !!subscription;
  // Determine today's date in YYYY‑MM‑DD format for usage tracking
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRow } = await supabase
    .from('resume_usage')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle();
  const used = usageRow?.used ?? 0;
  // Enforce premium plan and daily limit
  if (!isPremium) {
    return NextResponse.json({ error: 'Upgrade to premium to optimise resumes' }, { status: 402 });
  }
  if (used >= 1) {
    return NextResponse.json({ error: 'Daily resume optimisation limit reached' }, { status: 429 });
  }
  let improved = resumeData;
  // Attempt to call OpenAI if API key is present.  We import
  // dynamically to avoid requiring the package at build time if
  // unused.  The prompt is intentionally generic; implement your
  // custom prompt here to get better results.
  if (process.env.OPENAI_API_KEY) {
    try {
      const { Configuration, OpenAIApi } = await import('openai');
      const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
      const openai = new OpenAIApi(configuration);
      const prompt = `You are an expert resume writer.  Rewrite the following resume summary and bullet points to improve clarity and impact while keeping the same information.  Resume data: ${JSON.stringify(
        resumeData
      )}`;
      const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that improves resumes.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
      });
      const aiResponse = completion.data.choices?.[0]?.message?.content;
      if (aiResponse) {
        // Attempt to parse the AI response as JSON.  If parsing
        // fails we simply return the raw text in the summary field.
        try {
          const parsed = JSON.parse(aiResponse);
          improved = { ...resumeData, ...parsed };
        } catch {
          improved = { ...resumeData, summary: aiResponse };
        }
      }
    } catch (err) {
      console.error('OpenAI optimisation failed', err);
      // Fall back to returning the original resume data
      improved = resumeData;
    }
  }
  // Increment usage
  if (usageRow) {
    await supabase
      .from('resume_usage')
      .update({ used: used + 1 })
      .eq('id', usageRow.id);
  } else {
    await supabase
      .from('resume_usage')
      .insert({ user_id: user.id, date: today, used: 1 });
  }
  return NextResponse.json(improved);
}