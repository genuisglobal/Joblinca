-- ============================================================================
-- One row per WhatsApp message the conversational agent saw.
--
-- Shadow mode runs the agent next to the existing state machine and never
-- sends its reply, so this table is the only place that reply exists. It is
-- what we compare against the state machine's answer (whatsapp_logs, same
-- lead, same minute) before switching anyone to live, and afterwards it is
-- the per-turn record of cost, latency and why a turn fell back.
--
-- Service role only: rows hold message text and phone-linked lead ids.
-- ============================================================================

create table if not exists public.wa_agent_turns (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  lead_id uuid references public.wa_leads(id) on delete cascade,
  wa_message_id text,
  route text not null check (route in ('shadow', 'live')),
  -- agent: the agent produced the reply. fallback: it failed or timed out and
  -- the state machine answered instead (live), or nothing was logged (shadow).
  outcome text not null check (outcome in ('agent', 'fallback')),
  fallback_reason text,
  inbound_text text,
  reply_text text,
  -- [{ name, args, ok, ms }] in call order
  tool_calls jsonb not null default '[]'::jsonb,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer
);

create index if not exists idx_wa_agent_turns_lead_created
  on public.wa_agent_turns(lead_id, created_at desc);

create index if not exists idx_wa_agent_turns_created
  on public.wa_agent_turns(created_at desc);

alter table public.wa_agent_turns enable row level security;

drop policy if exists "Service role full access wa_agent_turns" on public.wa_agent_turns;
create policy "Service role full access wa_agent_turns"
  on public.wa_agent_turns for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
