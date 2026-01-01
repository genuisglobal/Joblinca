import { NextResponse } from "next/server";
import OpenAI from "openai";

// Prevent any caching of this API route
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    // If key is missing, don't crash the build—return a safe response
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable." },
        { status: 500 }
      );
    }

    const resume = await req.json();

    const client = new OpenAI({ apiKey });

    const prompt = `
You are an expert resume writer.
Rewrite the resume summary and experience bullets to improve clarity, impact, and ATS readability,
while keeping the same meaning and facts. Return JSON only.

JSON schema:
{
  "summary": "string",
  "experience": "string"
}

Resume data:
${JSON.stringify(resume)}
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "You rewrite resumes. Return valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content?.trim() || "";

    // Try to parse JSON response from the model
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If the model returns non-JSON, still fail gracefully
      return NextResponse.json(
        { error: "AI returned invalid JSON. Try again." },
        { status: 500 }
      );
    }

    // Merge the improved fields back
    const improved = {
      ...resume,
      ...(parsed.summary ? { summary: parsed.summary } : {}),
      ...(parsed.experience ? { experience: parsed.experience } : {}),
    };

    return NextResponse.json(improved);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Resume optimize failed." },
      { status: 500 }
    );
  }
}
