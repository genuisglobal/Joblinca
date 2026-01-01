import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let resumeData: any;
  try {
    resumeData = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const isPremium = !!subscription;

  const today = new Date().toISOString().slice(0, 10);

  const { data: usageRow } = await supabase
    .from("resume_usage")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  const used = usageRow?.used ?? 0;

  if (!isPremium) {
    return NextResponse.json(
      { error: "Upgrade to premium to optimise resumes" },
      { status: 402 }
    );
  }

  if (used >= 1) {
    return NextResponse.json(
      { error: "Daily resume optimisation limit reached" },
      { status: 429 }
    );
  }

  let improved = resumeData;

  // If no key, just return original data (no crash)
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `You are an expert resume writer.
Rewrite the resume content to improve clarity and impact while keeping the same meaning.
Return ONLY valid JSON with improved fields where possible.
Resume data: ${JSON.stringify(resumeData)}`;

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You improve resumes and output valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 700,
      });

      const aiText = completion.choices?.[0]?.message?.content?.trim();

      if (aiText) {
        try {
          const parsed = JSON.parse(aiText);
          improved = { ...resumeData, ...parsed };
        } catch {
          // fallback: store raw text in summary
          improved = { ...resumeData, summary: aiText };
        }
      }
    } catch (err) {
      console.error("OpenAI optimisation failed", err);
      improved = resumeData;
    }
  }

  // increment usage
  if (usageRow) {
    await supabase.from("resume_usage").update({ used: used + 1 }).eq("id", usageRow.id);
  } else {
    await supabase.from("resume_usage").insert({ user_id: user.id, date: today, used: 1 });
  }

  return NextResponse.json(improved);
}
