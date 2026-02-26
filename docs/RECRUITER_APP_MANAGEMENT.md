# Recruiter Application Management System

This document describes the recruiter-side application management features implemented for JobLinca.

## Overview

The system allows recruiters to:
- View all applications across their posted jobs
- Filter and sort applications by status, job, date, and ranking
- Bulk update application statuses
- Add notes and ratings to applications
- View AI-generated insights and match scores
- Track activity history for each application

## Features

### 1. Application Inbox (`/dashboard/recruiter/applications`)

A unified view of all applications across all jobs posted by the recruiter.

**Features:**
- Status counts (All, New, Shortlisted, Interviewed, Hired, Rejected)
- Search by applicant name or job title
- Filter by job
- Sort by newest, oldest, ranking score, or rating
- Multi-select with bulk actions
- Pagination (handled client-side)

### 2. Application Detail View (`/dashboard/recruiter/applications/[id]`)

Detailed view of a single application with:
- Applicant information and contact details
- Cover letter and screening question answers
- CV download link
- AI analysis with match score, strengths, and gaps
- Notes section for internal comments
- Star rating system (1-5)
- Pin/unpin functionality
- Status update buttons
- Activity timeline

### 3. AI Analysis

AI-powered analysis of applications that provides:
- **Match Score (0-100)**: How well the candidate matches the job requirements
- **Strengths**: Key qualifications and positive aspects
- **Gaps/Risks**: Areas to consider or potential concerns
- **Reasoning**: Brief explanation of the assessment

**Implementation Notes:**
- Results are cached in the database to avoid recomputation
- Falls back to mock analysis if OpenAI API is not configured
- Recruiters can trigger re-analysis manually

### 4. Ranking System

Applications are ranked using a composite score:
- Recency bonus (max 20 points)
- Profile completeness (max 20 points) - CV + cover letter
- AI match score (max 50 points) - when available
- Recruiter rating (max 10 points) - when rated

## Database Schema

### New Tables

```sql
-- Application notes
application_notes (
  id, application_id, recruiter_id, content, is_private, created_at, updated_at
)

-- Activity log
application_activity (
  id, application_id, actor_id, action, old_value, new_value, metadata, created_at
)

-- Review mode settings per job
job_review_settings (
  id, job_id, review_mode, top_n_value, top_percent_value, daily_batch_size, must_have_rules
)

-- AI insights cache
ai_application_insights (
  id, application_id, parsed_profile, match_score, strengths, gaps, reasoning, status, error_message, model_used, tokens_used
)
```

### Modified Tables

```sql
-- Applications table additions
applications (
  + recruiter_rating (1-5)
  + tags (text array)
  + viewed_at (timestamp)
  + is_pinned (boolean)
  + is_hidden (boolean)
  + ranking_score (numeric)
  + ranking_breakdown (jsonb)
  + reviewed_at (timestamp)
)
```

## API Endpoints

### Applications

- `GET /api/applications/[id]` - Get application details
- `PUT /api/applications/[id]` - Update application status
- `POST /api/applications/bulk` - Bulk status update

### Notes

- `GET /api/applications/[id]/notes` - Get notes for application
- `POST /api/applications/[id]/notes` - Add note to application

### AI Analysis

- `POST /api/ai/analyze-application` - Trigger AI analysis

## Environment Variables

Required for AI features:
```env
# OpenAI API (optional - falls back to mock if not set)
OPENAI_API_KEY=sk-...

# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

## Testing Guide

### As a Recruiter

1. **Login** as a recruiter account
2. **Post a job** via `/jobs/new`
3. **Wait for approval** (or approve via admin panel)
4. **View applications** at `/dashboard/recruiter/applications`

### As an Applicant

1. **Create** a job seeker account
2. **Browse jobs** at `/jobs` or `/dashboard/job-seeker/browse`
3. **Apply** to a published job with CV and cover letter
4. **Check status** at `/dashboard/job-seeker/applications`

### Testing AI Analysis

1. Open an application detail page
2. Click "Analyze with AI" button
3. If OPENAI_API_KEY is not set, mock analysis will be used
4. Results are cached - click "Re-analyze" to refresh

### Testing Bulk Actions

1. Go to `/dashboard/recruiter/applications`
2. Check multiple application checkboxes
3. Use the bulk action buttons (Shortlist, Interview, Reject)
4. Verify status updates

### Testing Notes

1. Open an application detail page
2. Add a note in the notes section
3. Verify note appears in the list
4. Check activity log shows note addition

## RLS Policies

All data is protected by Row Level Security:

- **Applications**: Recruiters can only view/update applications for their own jobs
- **Notes**: Recruiters can only manage notes on their applications
- **Activity**: Recruiters can view activity for their applications
- **AI Insights**: Recruiters can view insights for their applications (insert via service role only)

## Future Enhancements (Phase 2)

1. **Review Modes** - Top N, Top %, Must-have rules, Daily batch
2. **Team Collaboration** - Multiple recruiters per company
3. **Email Templates** - Automated candidate communication
4. **Interview Scheduling** - Calendar integration
5. **Advanced Analytics** - Hiring funnel visualization
6. **PDF Text Extraction** - Full resume parsing for AI analysis
