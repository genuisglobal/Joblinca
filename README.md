# JobLinca – National‑Scale Hiring Platform

JobLinca is a bilingual (English/French) hiring platform designed for Cameroon.  
It connects recruiters and job seekers through a mobile‑first web application, WhatsApp and SMS bots, AI‑powered vetting, payments, certifications and project portfolios.  
This repository contains a complete scaffold of the application built with **Next.js 14**, **Tailwind CSS**, **Supabase** (PostgreSQL + Auth + Storage + Row‑Level Security), and modular API routes.  The codebase is structured to be production‑ready, scalable and easy to extend.

## Monorepo structure

```
joblinka/
├── app/                  # Next.js App Router pages and route handlers
│   ├── api/              # API endpoints (e.g. jobs, vetting)
│   ├── auth/             # Authentication pages (login / register)
│   ├── dashboard/        # Protected dashboard page
│   ├── jobs/             # Job board pages
│   └── ...
├── components/           # React UI components (add as you build features)
├── lib/                  # Shared libraries (Supabase clients, utils)
├── supabase/
│   └── migrations/       # SQL migrations defining the database schema & RLS
├── .env.example          # Environment variable specification
├── package.json          # Project configuration and dependencies
├── next.config.js        # Next.js configuration (i18n enabled)
├── tailwind.config.ts    # Tailwind CSS configuration
└── README.md             # Project overview and setup instructions
```

## Key technologies

- **Next.js 14** – App Router, React Server Components & Server Actions for a modern full‑stack experience.  
  Using server components to fetch data near where it’s used improves code organisation and security【867614661607272†L43-L70】.  
- **Supabase** – Postgres database with **Row‑Level Security (RLS)** to ensure each user can only access their own data【841124215369508†L104-L108】.  Built‑in Auth manages email/phone sign‑up and session cookies.  
- **Tailwind CSS** – Utility‑first styling with dark‑mode support.  
- **OpenAI API** – Used by separate microservices (deployable on Replit) for CV screening, matching, grading and chatbot logic.  
  It is also leveraged by the built‑in resume optimiser to suggest improvements to job seeker CVs.  An `OPENAI_API_KEY` must be provided via environment variables to enable this feature.
- **WhatsApp & SMS providers** – Generic REST clients integrate messaging flows via webhooks.

## Database schema & migrations

The `supabase/migrations/000_initial.sql` file contains the full database schema and initial RLS policies.  
Key tables include users (managed by Supabase Auth), profiles, recruiters, jobs, applications, vetting_requests & results, projects, tests, certifications, verifications, transactions, subscriptions, messaging logs and admin_actions.  

RLS policies restrict access based on the current authenticated user.  For example, only recruiters can manage their own job postings, applicants can read their own applications, and the public can only view published jobs and public projects.  The policies enable safe multi‑tenancy and enforce least privilege access by default.

## Local development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** and obtain your `SUPABASE_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY`.  
   Follow the official **Supabase + Next.js** tutorial【841124215369508†L116-L200】 for instructions on creating a project and retrieving the keys.

3. **Prepare environment variables**

   Copy `.env.example` to `.env.local` and fill in your keys.  The `NEXT_PUBLIC_*` variables are safe to expose in the browser.  Keep `SUPABASE_SERVICE_ROLE_KEY` secret.

4. **Apply database migrations**

   Install the Supabase CLI and link your project.  Then push the migration:

   ```bash
   supabase login # login to Supabase CLI (only once)
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   Alternatively, run the SQL file in the Supabase dashboard’s SQL editor.

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   The app is now available at `http://localhost:3000`.

### Test data

The migration script does not insert seed data.  You can manually create users via the Supabase dashboard or add rows in the relevant tables to test the flows.

## Production deployment

JobLinca is designed to run on **Vercel** (for the Next.js frontend and API routes) and **Supabase Cloud** (for the database, Auth and Storage).  A typical deployment involves:

1. **Create a Supabase project** and push the schema via the Supabase CLI.
2. **Fork this repository** into your GitHub account.
3. **Create a Vercel project** and import the repository.  Set the environment variables in the Vercel dashboard, including Supabase keys, payment provider keys, messaging tokens and OpenAI API key.
4. **Configure Supabase Auth** domain to allow your Vercel URL.
5. **Enable Storage** buckets for uploads (projects, certificates, IDs) and set RLS policies accordingly.
6. **Deploy** – Vercel will build the Next.js app and host it globally.  

### Replit AI microservices

Complex AI tasks (CV screening, matching, grading and chatbots) should be implemented as independent REST services and deployed on [Replit](https://replit.com).  Those services can be called from the Next.js API routes or Supabase Edge Functions using your `OPENAI_API_KEY`.

## Core modules (overview)

 - **Authentication & Profiles** – Email/phone authentication via Supabase, role‑based access, and editable user profiles.  The core `profiles` table stores basic details (full name, phone and role). Additional role‑specific information is stored in separate tables: `job_seeker_profiles` (location, headline, resume URL and career info), `talent_profiles` (school status, portfolio and internship eligibility) and `recruiter_profiles` (recruiter type, verification status, tier plan, company name and contact details).
- **Job board system** – Recruiters can post, edit and delete jobs; candidates browse published jobs without logging in; search and SEO friendly pages; admin approves postings before they go live.
- **Job application system** – Candidates apply quickly (name + phone + CV) or via their profile.  Applications are stored in the `applications` table and recruiters can track statuses.
- **Messaging** – WhatsApp and SMS bots allow candidates to apply, receive alerts and interview updates.  Webhooks from providers post to `/api/webhooks/whatsapp` and `/api/webhooks/sms` (to be implemented).
- **Payments & Subscriptions** – Generic aggregator integration supports job posting fees, vetting services, candidate alerts and verification/certification fees.  Transactions are logged in the `transactions` table and subscriptions in `subscriptions`.
- **Vetting & Hiring service** – Recruiters request vetting packages (Basic, Standard, Premium).  Admin assigns vetting officers.  AI pre‑screens candidates and officers finalise shortlists.  Results are stored in `vetting_results`.
- **Projects & Portfolio** – Candidates showcase projects with files, GitHub/Youtube links and tags.  Public portfolio pages allow recruiters to browse skills.
- **Certifications & Tests** – Admins create MCQ/practical tests.  Candidates attempt tests and earn badges (Bronze, Silver, Gold, Platinum).  Certificates are PDF files with QR codes for public verification.
- **Resume Builder & Optimiser** – Logged‑in job seekers and talents can create or upload CVs and edit them via a simple form.  Premium subscribers can leverage the built‑in AI to optimise their summary and bullet points once per day and generate an ATS‑friendly PDF.  All resumes are stored in the `resumes` table with per‑user Row‑Level Security and usage is tracked in `resume_usage` to enforce daily limits.
- **Identity & Experience Verification** – Users upload IDs, selfies, certificates and employer references.  Verification officers approve or reject requests and verified users receive a badge.
- **Admin dashboard** – Admins approve recruiters/jobs, manage users, vetting, verifications, payments, create tests and view analytics.

### International Remote Jobs

JobLinca integrates with multiple public job feeds to surface verified global opportunities.  Listings are stored in the `external_jobs` table and served on the **Global Opportunities** page.  Jobs are categorised (e.g. *Teaching*, *Visa Sponsorship*) by scanning titles and descriptions for keywords.  Cameroonian job seekers can browse by category, search by keyword and apply via the original listing site.  Data is refreshed via the `/api/refresh-external-jobs` route, which aggregates feeds such as:

- **Remotive** – a free remote jobs API.  Each listing links back to Remotive and includes job title, company, location and salary when available【335617390489077†L72-L125】.  We respect Remotive’s guidelines and only refresh the feed a few times per day.
- **Jobicy remote jobs feed** – an open JSON feed of remote jobs.  Our integration requests a limited number of listings to minimise load.  Titles and industries are analysed to assign categories like *Teaching* or *Visa Sponsorship*.

These international jobs are clearly separated from local recruiter‑posted jobs to preserve the integrity of the domestic job board.

Additional providers can be integrated by implementing the corresponding fetch functions in [`lib/externalJobs.ts`](./lib/externalJobs.ts).  For example, Upwork’s API requires OAuth credentials (client ID and secret) and is disabled by default.  To enable Upwork integration you must set `UPWORK_CLIENT_ID` and `UPWORK_CLIENT_SECRET` in your environment and implement the OAuth flow.  Similarly, Findwork provides an API key–protected feed; add your `FINDWORK_API_KEY` to `.env.local` to enable fetching those listings.

## Contributing

This repository is a starting point.  Many modules (messaging, payments, vetting) are still skeletons and require integration with real providers.  Contributions are welcome to flesh out features, improve UX and harden security.

## Security & best practices

- Always enforce **HTTPS**.  In production, Vercel automatically provides SSL.  
* Ensure **Row‑Level Security (RLS)** policies cover every table so users can only access their own records.  Supabase’s built‑in RLS ensures data is protected【841124215369508†L104-L108】.  
* **Profiles are private** – each user can only see and update their own profile; only admins can view all user profiles.
* **Financial & verification data is restricted** – transactions, subscriptions and verification records are only visible to the account owner (and relevant officers or admins), protecting sensitive information.
- Store sensitive files (IDs, certificates) in Supabase Storage with private buckets and serve them via signed URLs.  
- Validate and sanitise all inputs (e.g., using [Zod](https://zod.dev/)).
- Follow the principle of least privilege when accessing external APIs and database roles.

---

Feel free to adapt and extend JobLinca for your needs.  We hope it accelerates the deployment of inclusive hiring platforms across Africa.