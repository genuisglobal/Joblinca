/**
 * AI Application Analysis Module
 *
 * This module provides functions for analyzing job applications using AI.
 * It extracts key information from CVs and cover letters, and scores
 * candidates against job requirements.
 *
 * In production, this should be connected to OpenAI or another AI service.
 * Currently provides a mock implementation for development.
 */

export interface ParsedProfile {
  skills: string[];
  experience: {
    title: string;
    company: string;
    duration: string;
    description?: string;
  }[];
  education: {
    degree: string;
    institution: string;
    year?: string;
  }[];
  location?: string;
  links: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary?: string;
}

export interface AIAnalysisResult {
  parsedProfile: ParsedProfile;
  matchScore: number;
  strengths: string[];
  gaps: string[];
  reasoning: string;
  tokensUsed?: number;
  modelUsed?: string;
}

export interface AnalysisInput {
  applicationId: string;
  coverLetter?: string | null;
  resumeUrl?: string | null;
  resumeText?: string | null;
  answers?: unknown[] | null;
  jobTitle: string;
  jobDescription?: string | null;
  jobLocation?: string | null;
  requiredSkills?: string[];
}

/**
 * Analyze an application using AI
 *
 * In production, this function should:
 * 1. Extract text from the resume PDF/DOCX
 * 2. Send the extracted text + cover letter + job description to OpenAI
 * 3. Parse the structured response
 *
 * Current implementation provides mock results for development.
 */
export async function analyzeApplication(
  input: AnalysisInput
): Promise<AIAnalysisResult> {
  // Check if OpenAI API key is configured
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey !== 'your_openai_api_key_here') {
    // Use real AI analysis
    return await performRealAnalysis(input, apiKey);
  }

  // Fallback to mock analysis for development
  return performMockAnalysis(input);
}

/**
 * Real AI analysis using OpenAI
 */
async function performRealAnalysis(
  input: AnalysisInput,
  apiKey: string
): Promise<AIAnalysisResult> {
  try {
    const prompt = buildAnalysisPrompt(input);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert HR assistant that analyzes job applications.
You provide objective, fair assessments of candidates based on their qualifications.
Always respond with valid JSON in the specified format.
Be balanced - highlight both strengths and areas for consideration.
Never make assumptions about protected characteristics.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    return {
      parsedProfile: parsed.parsedProfile || {
        skills: [],
        experience: [],
        education: [],
        links: {},
      },
      matchScore: Math.min(100, Math.max(0, parsed.matchScore || 50)),
      strengths: parsed.strengths || [],
      gaps: parsed.gaps || [],
      reasoning: parsed.reasoning || 'Analysis completed.',
      tokensUsed: data.usage?.total_tokens,
      modelUsed: 'gpt-4o-mini',
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    // Fallback to mock if AI fails
    return performMockAnalysis(input);
  }
}

/**
 * Build the prompt for AI analysis
 */
function buildAnalysisPrompt(input: AnalysisInput): string {
  return `Analyze this job application and provide a structured assessment.

## Job Details
Title: ${input.jobTitle}
Location: ${input.jobLocation || 'Not specified'}
Description: ${input.jobDescription || 'Not provided'}
${input.requiredSkills?.length ? `Required Skills: ${input.requiredSkills.join(', ')}` : ''}

## Application Details
Cover Letter: ${input.coverLetter || 'Not provided'}

Resume/CV Content: ${input.resumeText || 'Not available for parsing'}

${input.answers?.length ? `Screening Answers: ${JSON.stringify(input.answers)}` : ''}

## Instructions
Analyze this application and respond with JSON in this exact format:
{
  "parsedProfile": {
    "skills": ["skill1", "skill2"],
    "experience": [{"title": "Job Title", "company": "Company", "duration": "X years"}],
    "education": [{"degree": "Degree", "institution": "School"}],
    "location": "City, Country",
    "links": {},
    "summary": "Brief professional summary"
  },
  "matchScore": 75,
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "gaps": ["Gap 1", "Gap 2"],
  "reasoning": "Brief paragraph explaining the match assessment"
}

Match score should be 0-100 based on how well the candidate matches the job requirements.
Be objective and fair in your assessment.`;
}

/**
 * Mock analysis for development when no AI API is configured
 */
function performMockAnalysis(input: AnalysisInput): AIAnalysisResult {
  // Extract some basic info from cover letter if available
  const coverLetterLower = (input.coverLetter || '').toLowerCase();
  const hasExperience = coverLetterLower.includes('experience') || coverLetterLower.includes('years');
  const hasSkills = coverLetterLower.includes('skill') || coverLetterLower.includes('proficient');
  const hasEducation = coverLetterLower.includes('degree') || coverLetterLower.includes('university');

  // Calculate a basic score
  let baseScore = 50;
  if (hasExperience) baseScore += 15;
  if (hasSkills) baseScore += 15;
  if (hasEducation) baseScore += 10;
  if (input.resumeUrl) baseScore += 10;

  // Generate mock strengths and gaps
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (input.coverLetter && input.coverLetter.length > 200) {
    strengths.push('Provided a detailed cover letter demonstrating interest in the role');
  }
  if (input.resumeUrl) {
    strengths.push('Submitted a resume/CV for review');
  }
  if (hasExperience) {
    strengths.push('Mentions relevant professional experience');
  }

  if (!input.coverLetter) {
    gaps.push('No cover letter provided - unable to assess motivation and fit');
  }
  if (!input.resumeUrl) {
    gaps.push('No resume uploaded - limited ability to assess qualifications');
  }
  if (strengths.length === 0) {
    gaps.push('Application could benefit from more detailed information');
  }

  // Ensure we have at least one item in each
  if (strengths.length === 0) {
    strengths.push('Demonstrated interest by applying to the position');
  }
  if (gaps.length === 0) {
    gaps.push('Consider providing more specific examples of relevant experience');
  }

  return {
    parsedProfile: {
      skills: [],
      experience: [],
      education: [],
      links: {},
      summary: 'Profile parsed from application',
    },
    matchScore: Math.min(100, Math.max(0, baseScore)),
    strengths,
    gaps,
    reasoning: `This is a preliminary assessment based on available application data. ${
      input.resumeUrl
        ? 'A resume was provided for detailed review.'
        : 'No resume was provided, limiting the depth of this assessment.'
    } ${
      input.coverLetter
        ? 'The cover letter provides additional context about the candidate.'
        : 'A cover letter would help better understand the candidate\'s motivation.'
    } For a complete assessment, please review all submitted materials directly.`,
    modelUsed: 'mock-analysis',
    tokensUsed: 0,
  };
}

/**
 * Extract text from a PDF resume
 * This is a placeholder - in production, use a PDF parsing library
 */
export async function extractTextFromResume(
  resumeUrl: string
): Promise<string | null> {
  // In production, implement PDF text extraction using:
  // - pdf-parse for Node.js
  // - Or call an external service
  //
  // For now, return null to indicate extraction not available
  console.log('Resume text extraction not implemented for:', resumeUrl);
  return null;
}
