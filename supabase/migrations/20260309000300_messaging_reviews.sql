-- Stage 7: In-app messaging + Company reviews

-- 1) In-app messages between recruiters and candidates
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_receiver on public.messages (receiver_id, created_at desc);
create index if not exists idx_messages_sender on public.messages (sender_id, created_at desc);
create index if not exists idx_messages_conversation on public.messages (
  least(sender_id, receiver_id),
  greatest(sender_id, receiver_id),
  created_at desc
);

-- RLS
alter table public.messages enable row level security;

create policy "Users can read their own messages"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages"
  on public.messages for insert
  with check (auth.uid() = sender_id);

create policy "Receivers can mark messages read"
  on public.messages for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

create policy "Service role full access messages"
  on public.messages for all
  using (auth.role() = 'service_role');

-- 2) Company reviews by job seekers
create table if not exists public.company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.recruiters (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  title text,
  body text,
  is_current_employee boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per company per user
  unique (company_id, reviewer_id)
);

create index if not exists idx_company_reviews_company on public.company_reviews (company_id, created_at desc);

-- RLS
alter table public.company_reviews enable row level security;

create policy "Anyone can read reviews"
  on public.company_reviews for select
  using (true);

create policy "Authenticated users can create reviews"
  on public.company_reviews for insert
  with check (auth.uid() = reviewer_id);

create policy "Users can update their own reviews"
  on public.company_reviews for update
  using (auth.uid() = reviewer_id);

create policy "Users can delete their own reviews"
  on public.company_reviews for delete
  using (auth.uid() = reviewer_id);

create policy "Service role full access reviews"
  on public.company_reviews for all
  using (auth.role() = 'service_role');
