import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import { createEmptyResume } from '@/lib/resume';
import type { ResumeData } from '@/lib/resume';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let text = '';
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      try {
        const result = await pdfParse(buffer);
        text = result.text || '';
      } catch {
        text = '';
      }
    } else if (fileName.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || '';
      } catch {
        text = '';
      }
    } else {
      text = buffer.toString('utf-8');
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json(createEmptyResume());
    }

    // Use OpenAI to smart-parse the text into structured data
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a resume parser. Extract structured data from resume text and return valid JSON matching this exact structure:
{
  "fullName": string,
  "email": string,
  "phone": string,
  "location": string,
  "title": string (job title/professional title),
  "summary": string,
  "experience": [{ "company": string, "role": string, "startDate": string, "endDate": string, "description": string, "current": boolean }],
  "education": [{ "institution": string, "degree": string, "field": string, "startDate": string, "endDate": string }],
  "skills": string[],
  "languages": [{ "language": string, "proficiency": string }],
  "certifications": [{ "name": string, "issuer": string, "date": string }]
}
Use empty strings for missing fields. Use empty arrays if no items found. For dates use formats like "Jan 2020" or "2020".`,
            },
            {
              role: 'user',
              content: `Parse this resume text:\n\n${text.slice(0, 6000)}`,
            },
          ],
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        });

        const aiResponse = completion.choices?.[0]?.message?.content?.trim();
        if (aiResponse) {
          const parsed = JSON.parse(aiResponse);
          const resume: ResumeData = {
            ...createEmptyResume(),
            fullName: parsed.fullName || '',
            email: parsed.email || '',
            phone: parsed.phone || '',
            location: parsed.location || '',
            title: parsed.title || '',
            summary: parsed.summary || '',
            experience: Array.isArray(parsed.experience) ? parsed.experience : [],
            education: Array.isArray(parsed.education) ? parsed.education : [],
            skills: Array.isArray(parsed.skills) ? parsed.skills : [],
            languages: Array.isArray(parsed.languages) ? parsed.languages : [],
            certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
          };
          return NextResponse.json(resume);
        }
      } catch (err) {
        console.error('OpenAI parse failed, using fallback', err);
      }
    }

    // Fallback: return empty resume with the raw text as summary
    return NextResponse.json({
      ...createEmptyResume(),
      summary: text.slice(0, 500),
    });
  } catch (error) {
    console.error('Error parsing resume file', error);
    return NextResponse.json(createEmptyResume());
  }
}
