-- Stage 8: Public API keys + multi-region config

-- 1) API keys for developer access
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  key_hash text not null unique, -- SHA-256 hash of the actual key
  key_prefix text not null,      -- first 8 chars for display (e.g., "jbl_xxxx")
  scopes text[] not null default '{jobs.read}',
  rate_limit_per_hour int not null default 100,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_hash on public.api_keys (key_hash) where revoked_at is null;
create index if not exists idx_api_keys_user on public.api_keys (user_id);

alter table public.api_keys enable row level security;

create policy "Users can manage their own API keys"
  on public.api_keys for all
  using (auth.uid() = user_id);

create policy "Service role full access api_keys"
  on public.api_keys for all
  using (auth.role() = 'service_role');

-- 2) Platform regions / countries
create table if not exists public.platform_regions (
  id text primary key,           -- e.g., 'cm', 'ng', 'ke'
  name text not null,            -- e.g., 'Cameroon'
  currency_code text not null,   -- e.g., 'XAF'
  currency_symbol text not null, -- e.g., 'FCFA'
  locale text not null default 'en',
  timezone text not null default 'Africa/Douala',
  is_active boolean not null default false,
  launched_at timestamptz,
  created_at timestamptz not null default now()
);

-- Seed initial regions
insert into public.platform_regions (id, name, currency_code, currency_symbol, locale, timezone, is_active, launched_at)
values
  ('cm', 'Cameroon', 'XAF', 'FCFA', 'fr', 'Africa/Douala', true, now()),
  ('ng', 'Nigeria', 'NGN', '₦', 'en', 'Africa/Lagos', false, null),
  ('ke', 'Kenya', 'KES', 'KSh', 'en', 'Africa/Nairobi', false, null),
  ('gh', 'Ghana', 'GHS', 'GH₵', 'en', 'Africa/Accra', false, null),
  ('sn', 'Senegal', 'XOF', 'FCFA', 'fr', 'Africa/Dakar', false, null),
  ('rw', 'Rwanda', 'RWF', 'FRw', 'en', 'Africa/Kigali', false, null)
on conflict (id) do nothing;

alter table public.platform_regions enable row level security;

create policy "Anyone can read active regions"
  on public.platform_regions for select
  using (true);

create policy "Service role full access regions"
  on public.platform_regions for all
  using (auth.role() = 'service_role');
