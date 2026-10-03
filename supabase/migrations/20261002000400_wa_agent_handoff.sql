-- ============================================================================
-- Human handoff for the WhatsApp agent.
--
-- When the agent hands a conversation to a person, the bot goes quiet for
-- that lead until agent_paused_until passes (24h) or an admin sends
-- "RESUME <phone>" to the business number. While paused, admins answer with
-- "REPLY <phone> <message>", which the bot relays into the user's chat so
-- the conversation stays in one thread and in whatsapp_logs.
-- ============================================================================

alter table public.wa_leads
  add column if not exists agent_paused_until timestamptz,
  add column if not exists handoff_reason text;

comment on column public.wa_leads.agent_paused_until is
  'Bot stays silent for this lead until then (human handoff). Cleared by an admin RESUME. Set by lib/whatsapp-agent/agent tools.';
