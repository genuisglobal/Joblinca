-- Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- Users are managed by supabase.auth.users. Additional profile information is stored in the profiles table.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null check (role in ('candidate','recruiter','admin','vetting_officer','verification_officer')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiters (
  id uuid primary key references public.profiles (id) on delete cascade,
  company_name text not null,
  company_description text,
  website text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  recruiter_id uuid not null references public.recruiters (id) on delete cascade,
  title text not null,
  description text not null,
  location text,
  salary numeric,
  custom_questions jsonb,
  external_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  cover_letter text,
  answers jsonb,
  status text not null default 'submitted' check (status in ('submitted','shortlisted','interviewed','hired','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vetting_requests (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  recruiter_id uuid not null references public.recruiters (id) on delete cascade,
  package text not null check (package in ('basic','standard','premium')),
  status text not null default 'pending' check (status in ('pending','in_review','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vetting_results (
  id uuid primary key default uuid_generate_v4(),
  vetting_request_id uuid not null references public.vetting_requests (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  score numeric,
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  file_urls jsonb,
  github_url text,
  youtube_url text,
  category text,
  tags text[],
  public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tests (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  category text,
  questions jsonb not null, -- MCQ questions stored as JSON
  practical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.test_attempts (
  id uuid primary key default uuid_generate_v4(),
  test_id uuid not null references public.tests (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb,
  score numeric,
  status text not null default 'in_progress' check (status in ('in_progress','completed','graded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certifications (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  test_id uuid not null references public.tests (id) on delete cascade,
  badge text not null check (badge in ('bronze','silver','gold','platinum')),
  certificate_url text,
  qr_code text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.verifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  id_document_url text,
  selfie_url text,
  certificates jsonb,
  employer_reference text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric not null,
  currency text not null default 'XAF',
  description text,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  provider text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  status text not null default 'active' check (status in ('active','inactive','cancelled')),
  start_date date not null default (current_date),
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles (id) on delete set null,
  phone text not null,
  message text not null,
  direction text not null check (direction in ('inbound','outbound')),
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.sms_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles (id) on delete set null,
  phone text not null,
  message text not null,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS) on tables
alter table public.profiles enable row level security;
alter table public.recruiters enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.vetting_requests enable row level security;
alter table public.vetting_results enable row level security;
alter table public.projects enable row level security;
alter table public.tests enable row level security;
alter table public.test_attempts enable row level security;
alter table public.certifications enable row level security;
alter table public.verifications enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.whatsapp_logs enable row level security;
alter table public.sms_logs enable row level security;
alter table public.admin_actions enable row level security;

-- RLS policies

-- Profiles: users can read and update their own profile; admins can manage all
create policy "Self profile select" on public.profiles
  for select using (auth.uid() = id or auth.role() = 'authenticated');
create policy "Self profile update" on public.profiles
  for update using (auth.uid() = id);

-- Recruiters: only user associated can manage
create policy "Own recruiter select" on public.recruiters
  for select using (auth.uid() = id or auth.role() = 'authenticated');
create policy "Own recruiter modify" on public.recruiters
  for insert with check (auth.uid() = id)
  using (auth.uid() = id);

-- Jobs: recruiters can insert and manage their own; public can select published
create policy "Published jobs are public" on public.jobs
  for select using (published = true);
create policy "Recruiter manage own jobs" on public.jobs
  for all using (auth.uid() = recruiter_id);

-- Applications: applicant can create and read; recruiters can read for their job
create policy "Applicant create application" on public.applications
  for insert with check (auth.uid() = applicant_id);
create policy "Applicant read own application" on public.applications
  for select using (auth.uid() = applicant_id);
create policy "Recruiter read applications for their jobs" on public.applications
  for select using (auth.uid() = (select recruiter_id from public.jobs where id = job_id));

-- Projects: candidate manage own; public can view public projects
create policy "Public projects readable" on public.projects
  for select using (public.projects.public = true);
create policy "Owner manage project" on public.projects
  for all using (auth.uid() = candidate_id);

-- Default deny all other operations for non-matching policies