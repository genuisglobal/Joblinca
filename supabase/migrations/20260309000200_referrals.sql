-- Simple referral tracking: each user gets a referral code.
-- When a new user signs up via a referral link, both parties are recorded.

alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id);

-- Generate referral codes for existing users (8-char alphanumeric)
-- New users will get codes assigned at profile creation time.
create or replace function public.generate_referral_code()
returns text
language sql
as $$
  select substr(md5(random()::text || clock_timestamp()::text), 1, 8);
$$;

-- Backfill existing profiles with referral codes
do $$
declare
  p record;
begin
  for p in select id from public.profiles where referral_code is null loop
    update public.profiles
    set referral_code = public.generate_referral_code()
    where id = p.id;
  end loop;
end;
$$;

-- Index for fast lookup by referral code
create index if not exists idx_profiles_referral_code on public.profiles (referral_code);
