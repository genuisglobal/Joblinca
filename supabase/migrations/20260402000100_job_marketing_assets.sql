create table if not exists public.job_marketing_assets (
  id uuid primary key default gen_random_uuid(),
  input_hash text not null unique,
  source_job_id text,
  source_job_key text not null,
  template_version text not null,
  variation_key text not null,
  cloudinary_public_id text not null,
  image_url text not null,
  width integer not null default 1080 check (width > 0),
  height integer not null default 1920 check (height > 0),
  job_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists job_marketing_assets_source_job_key_idx
  on public.job_marketing_assets (source_job_key);

create index if not exists job_marketing_assets_created_at_idx
  on public.job_marketing_assets (created_at desc);

create or replace function public.set_job_marketing_assets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_job_marketing_assets_updated_at on public.job_marketing_assets;
create trigger trg_job_marketing_assets_updated_at
before update on public.job_marketing_assets
for each row
execute function public.set_job_marketing_assets_updated_at();

alter table public.job_marketing_assets enable row level security;

comment on table public.job_marketing_assets is
  'Cache of generated Cloudinary-backed job marketing images keyed by normalized input hash.';
