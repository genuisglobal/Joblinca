do $$
begin
  if exists (select 1 from pg_type where typname = 'role_enum') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'role_enum'
        and e.enumlabel = 'field_agent'
    ) then
      alter type public.role_enum add value 'field_agent';
    end if;
  end if;
end
$$;

create table if not exists public.registration_officers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  officer_code text not null unique,
  is_active boolean not null default true,
  region text,
  town text,
  supervisor_user_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz
);

create index if not exists idx_registration_officers_active
  on public.registration_officers (is_active)
  where is_active = true;

create table if not exists public.registration_attributions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  officer_user_id uuid not null references public.profiles (id) on delete restrict,
  officer_code_snapshot text not null,
  source text not null check (source in ('prefilled_link', 'manual_prompt', 'admin_override')),
  confirmed_by_user boolean not null default false,
  locked_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_registration_attributions_active_user
  on public.registration_attributions (user_id)
  where revoked_at is null;

create index if not exists idx_registration_attributions_officer_active
  on public.registration_attributions (officer_user_id, created_at desc)
  where revoked_at is null;

alter table public.profiles
  add column if not exists registration_help_response text not null default 'unknown';

alter table public.profiles
  add column if not exists registration_help_answered_at timestamptz;

alter table public.profiles
  add column if not exists registration_help_prompted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_registration_help_response_check'
  ) then
    alter table public.profiles
      add constraint profiles_registration_help_response_check
      check (registration_help_response in ('unknown', 'yes', 'no'));
  end if;
end
$$;

alter table public.registration_officers enable row level security;
alter table public.registration_attributions enable row level security;

drop policy if exists "registration_officers_select_self_or_admin" on public.registration_officers;
create policy "registration_officers_select_self_or_admin" on public.registration_officers
  for select
  using (
    auth.uid() = user_id
    or public.is_active_admin()
  );

drop policy if exists "registration_attributions_select_own_officer_or_admin" on public.registration_attributions;
create policy "registration_attributions_select_own_officer_or_admin" on public.registration_attributions
  for select
  using (
    auth.uid() = user_id
    or auth.uid() = officer_user_id
    or public.is_active_admin()
  );

comment on table public.registration_officers is
  'Dedicated field agent accounts that can be credited for assisted registrations.';

comment on table public.registration_attributions is
  'Audited attribution records linking a registered user to the field agent who assisted them.';
