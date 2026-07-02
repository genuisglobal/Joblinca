# Joblinca

Joblinca is a bilingual hiring platform for Cameroon. It connects job seekers,
talent profiles, recruiters, field agents, and administrators through a
mobile-first web app, WhatsApp workflows, job aggregation, structured hiring
pipelines, subscriptions, and AI-assisted career and recruiter tools.

The application is built with Next.js 14, React, Tailwind CSS, Supabase, and
modular route handlers for jobs, applications, payments, messaging, SkillUp,
scraping, and admin operations.

## Product Focus

Joblinca should optimize for three core journeys:

- Job seekers find relevant jobs, apply quickly, and receive updates by web,
  email, SMS, or WhatsApp.
- Recruiters post roles, review structured applications, screen candidates, and
  schedule interviews.
- Admins keep the marketplace trusted by approving jobs, managing scraped
  opportunities, monitoring reports, and supporting field operations.

## Key Capabilities

- Public job board with local, remote, internship, gig, and global opportunity
  browse flows.
- Native job applications with resumes, eligibility checks, applicant ranking,
  hiring stages, notes, feedback, and interview scheduling.
- Recruiter dashboard for jobs, applications, candidates, engagement, profiles,
  verification, subscriptions, and API keys.
- Job seeker and talent dashboards for profiles, saved jobs, applications,
  messages, interview prep, SkillUp learning, challenges, achievements, and
  portfolios.
- WhatsApp job agent, screening flows, matched job notifications, daily drills,
  opt-in/opt-out handling, and webhook persistence.
- Job aggregation pipeline with source management, deduplication, publishing
  thresholds, scraper runs, outreach, and admin review.
- Payments and subscriptions through PayUnit-compatible flows, promo codes,
  renewal notifications, and webhook finalization.
- AI-assisted features for application analysis, recruiter decision support,
  job descriptions, interview prep, resume generation, and SkillUp
  recommendations.
- Admin tooling for jobs, applications, users, recruiters, verification,
  payments, reports, support, field agents, sponsorships, aggregation, and
  SkillUp content.

## Tech Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, Storage, and RLS
- OpenAI API for AI-assisted features
- PayUnit payment integration and optional fixed-IP proxy
- WhatsApp Business Cloud API
- Sentry for production error monitoring

## Repository Layout

```text
app/                  Next.js pages, layouts, and route handlers
components/           Shared UI components
lib/                  Domain services, Supabase clients, AI, payments, scraping
supabase/migrations/  Database schema and policy migrations
tests/                Focused Node and TS tests
docs/                 Runbooks, UAT material, feature notes, and ADRs
scripts/              Test, UAT, scraper, admin, and video helper scripts
services/             Supporting deployable services such as the PayUnit proxy
infra/                Infrastructure helpers such as cron worker config
public/               Static assets and PWA files
ads/                  Generated marketing assets and video batches
```

## Local Development

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill the required environment
   variables.

3. Apply Supabase migrations to your linked project.

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

4. Start the development server.

   ```bash
   npm run dev
   ```

The app runs at `http://localhost:3000` by default.

## Useful Commands

```bash
npm run typecheck
npm run lint
npm test
npm run i18n:check
npm run build
```

Targeted test commands are also available for application dashboards, hiring
pipelines, interviews, WhatsApp, AI hardening, SkillUp, job images, and
opportunity handling. See `package.json` for the full list.

## Environment Notes

Required values depend on which product areas are enabled. The most important
groups are:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`
- App URLs and cron: `NEXT_PUBLIC_APP_URL`, cron secrets
- AI: `OPENAI_API_KEY`
- WhatsApp: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
- Payments: PayUnit credentials, webhook secret, and optional proxy settings
- Observability: Sentry DSN and related config

Keep service-role keys, payment secrets, webhook secrets, and messaging tokens
server-side only.

## Security Priorities

- Prefer user-scoped Supabase clients in user-facing routes. Use the service
  role only where bypassing RLS is necessary and documented.
- Verify all webhook signatures before processing payment or WhatsApp events.
- Treat phone numbers, resumes, identity documents, applicant notes, and message
  bodies as sensitive data.
- Keep storage buckets private for resumes, IDs, certificates, and verification
  documents unless a signed URL is intentionally generated.
- Validate request bodies with structured schemas and return narrow error
  messages to clients.
- Rate-limit public, webhook, AI, payment, and messaging endpoints.

## Deployment

The main app is designed for Vercel and Supabase Cloud. The PayUnit proxy in
`services/payunit-proxy` can be deployed separately when a fixed egress IP is
needed. Cron routes should be called only by trusted schedulers using the
configured cron secret.

Before production deployment, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Also verify Supabase migrations, RLS policies, webhook secrets, storage bucket
policies, payment callbacks, and WhatsApp webhook configuration.

## Current Improvement Backlog

- Normalize brand spelling across user-facing text and generated assets.
- Audit all service-role usage and document each accepted bypass.
- Replace sensitive raw logs in webhook and messaging paths with redacted
  structured logs.
- Convert remaining raw `<img>` elements to `next/image` where practical.
- Add end-to-end coverage for registration, application, recruiter review,
  payment finalization, WhatsApp opt-in, and admin approval flows.
- Continue improving scraped job freshness, deduplication, source trust, salary
  normalization, and scam detection.
