-- ============================================================================
-- WhatsApp agent, phase 1 schema.
--
-- 1. Self-service signup leads. The agent collects name, role and email in
--    chat and sends the same single-use /complete-registration link field
--    officers send. Those leads have no officer, so officer_user_id and
--    officer_code_snapshot become nullable -- but only for the new
--    'whatsapp_self' capture mode; officer-captured leads still need both.
--
-- 2. A per-lead lease so two messages from the same person, arriving in
--    separate webhook deliveries, are not answered concurrently. An agent
--    turn takes seconds; without this the second turn reads state the first
--    is about to overwrite.
-- ============================================================================

alter table public.registration_leads
  alter column officer_user_id drop not null,
  alter column officer_code_snapshot drop not null;

alter table public.registration_leads
  drop constraint if exists registration_leads_capture_mode_check;
alter table public.registration_leads
  add constraint registration_leads_capture_mode_check
  check (capture_mode in ('quick_capture', 'assisted_signup', 'whatsapp_self'));

alter table public.registration_leads
  drop constraint if exists registration_leads_officer_required;
alter table public.registration_leads
  add constraint registration_leads_officer_required
  check (
    capture_mode = 'whatsapp_self'
    or (officer_user_id is not null and officer_code_snapshot is not null)
  );

alter table public.wa_leads
  add column if not exists agent_lock_until timestamptz;

comment on column public.wa_leads.agent_lock_until is
  'Lease held while the WhatsApp agent answers this lead. Expires on its own, so a crashed turn never wedges the lead. Set by lib/whatsapp-agent/agent/lock.ts.';
