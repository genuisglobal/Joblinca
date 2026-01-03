import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // important for many Node libs

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in environment variables" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
You are an expert resume writer.
Rewrite the following resume summary and experience bullet points to improve clarity and impact while keeping the same information.
Return JSON only with fields: summary, experience.

Resume:
${JSON.stringify(body)}
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const text = completion.choices[0]?.message?.content ?? "";

    // If your prompt returns JSON, parse it:
    // If not, return text and handle it on the client.
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // fallback
      parsed = { summary: body.summary, experience: body.experience, raw: text };
    }

    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to optimise resume" },
      { status: 500 }
    );
  }
}
