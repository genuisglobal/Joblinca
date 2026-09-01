-- ============================================================================
-- Remember which language each WhatsApp lead writes in.
--
-- The agent detects EN/FR per message, but detection needs real words to work
-- with. Mid-conversation replies are frequently "1", "next", "ok" or a town
-- name, which carry no language signal at all. Without somewhere to persist
-- the earlier read, a French speaker would be answered in French, then bounced
-- back to English the moment they tapped a menu number.
--
-- Nullable on purpose: null means "we have never had a confident read", which
-- is different from "this person uses English". Existing rows stay null and
-- fall back to English until their next message says otherwise.
-- ============================================================================

alter table public.wa_leads
  add column if not exists language text
    check (language is null or language in ('en', 'fr'));

comment on column public.wa_leads.language is
  'Last confidently detected language for this lead (en/fr). Null = never read. Set by lib/whatsapp-agent/language.ts.';
