import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { toE164 } from '@/lib/whatsapp';
import { linkConversationToUser } from '@/lib/whatsapp-db';
import { resolveProfileIdByPhone } from '@/lib/phone-match';
import type {
  WaConversationState,
  WaRoleSelection,
  WaStatePayload,
} from '@/lib/whatsapp-agent/state-machine';

const leadDb = createServiceSupabaseClient();

export interface WaLeadRow {
  id: string;
  wa_conversation_id: string | null;
  wa_id: string | null;
  phone_e164: string;
  display_name: string | null;
  linked_user_id: string | null;
  has_website_account: boolean;
  role_selected: WaRoleSelection;
  conversation_state: WaConversationState;
  state_payload: Record<string, unknown> | null;
  month_bucket: string;
  views_month_count: number;
  applies_month_count: number;
  last_search_location: string | null;
  last_search_role_keywords: string | null;
  last_search_time_filter: '24h' | '7d' | '30d' | null;
  last_search_offset: number;
  pending_apply_job_id: string | null;
  pending_apply_job_public_id: string | null;
  last_seen_at: string;
}

export interface WaTalentProfileRow {
  id: string;
  wa_lead_id: string;
  full_name: string | null;
  institution_name: string | null;
  town: string | null;
  course_or_major: string | null;
  cv_or_projects: string | null;
  completed: boolean;
}

function monthBucketGmtPlus1(now = new Date()): string {
  const shifted = new Date(now.getTime() + 60 * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function weekBucketGmtPlus1(now = new Date()): string {
  const shifted = new Date(now.getTime() + 60 * 60 * 1000);
  const temp = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${temp.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

export async function getOrCreateWaLead(params: {
  conversationId: string | null;
  waId: string;
  phone: string;
  displayName?: string | null;
}): Promise<WaLeadRow> {
  const phone = toE164(params.phone);
  const monthBucket = monthBucketGmtPlus1();

  const { data, error } = await leadDb
    .from('wa_leads')
    .upsert(
      {
        wa_conversation_id: params.conversationId,
        wa_id: params.waId,
        phone_e164: phone,
        display_name: params.displayName ?? null,
        month_bucket: monthBucket,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: 'phone_e164',
        ignoreDuplicates: false,
      }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`getOrCreateWaLead failed: ${error?.message || 'unknown_error'}`);
  }

  return (await ensureLeadMonthlyReset(data as WaLeadRow)) as WaLeadRow;
}

export async function ensureLeadMonthlyReset(lead: WaLeadRow): Promise<WaLeadRow> {
  const nowBucket = monthBucketGmtPlus1();
  if (lead.month_bucket === nowBucket) {
    return lead;
  }

  const { data, error } = await leadDb
    .from('wa_leads')
    .update({
      month_bucket: nowBucket,
      views_month_count: 0,
      applies_month_count: 0,
      last_search_offset: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .select('*')
    .single();

  if (error || !data) {
    return {
      ...lead,
      month_bucket: nowBucket,
      views_month_count: 0,
      applies_month_count: 0,
      last_search_offset: 0,
    };
  }

  return data as WaLeadRow;
}

export async function resolveWebsiteUserByPhone(phone: string): Promise<string | null> {
  return resolveProfileIdByPhone(leadDb, phone);
}

export async function syncLeadUserLink(lead: WaLeadRow, linkedUserId: string | null): Promise<WaLeadRow> {
  const hasWebsiteAccount = Boolean(linkedUserId);
  if (lead.linked_user_id === linkedUserId && lead.has_website_account === hasWebsiteAccount) {
    return lead;
  }

  const { data, error } = await leadDb
    .from('wa_leads')
    .update({
      linked_user_id: linkedUserId,
      has_website_account: hasWebsiteAccount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .select('*')
    .single();

  if (linkedUserId) {
    await linkConversationToUser(lead.phone_e164, linkedUserId).catch(() => {});
  }

  if (error || !data) {
    return {
      ...lead,
      linked_user_id: linkedUserId,
      has_website_account: hasWebsiteAccount,
    };
  }

  return data as WaLeadRow;
}

export async function getProfileRole(userId: string): Promise<string | null> {
  const { data } = await leadDb
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  return (data?.role as string | undefined) ?? null;
}

export async function updateLeadState(
  leadId: string,
  state: WaConversationState,
  roleSelected: WaRoleSelection,
  statePayload?: WaStatePayload | Record<string, unknown> | null
): Promise<void> {
  await leadDb
    .from('wa_leads')
    .update({
      conversation_state: state,
      role_selected: roleSelected,
      state_payload: statePayload ?? {},
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
}

export async function saveLastSearch(
  leadId: string,
  params: {
    location: string;
    roleKeywords: string;
    timeFilter: '24h' | '7d' | '30d';
    offset: number;
  }
): Promise<void> {
  await leadDb
    .from('wa_leads')
    .update({
      last_search_location: params.location,
      last_search_role_keywords: params.roleKeywords,
      last_search_time_filter: params.timeFilter,
      last_search_offset: params.offset,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
}

export async function setLastSearchOffset(leadId: string, offset: number): Promise<void> {
  await leadDb
    .from('wa_leads')
    .update({
      last_search_offset: Math.max(0, offset),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
}

export async function incrementViewCounter(lead: WaLeadRow, incrementBy: number): Promise<void> {
  if (incrementBy <= 0) return;
  await leadDb
    .from('wa_leads')
    .update({
      views_month_count: (lead.views_month_count || 0) + incrementBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);
}

export async function incrementApplyCounter(lead: WaLeadRow, incrementBy = 1): Promise<void> {
  if (incrementBy <= 0) return;
  await leadDb
    .from('wa_leads')
    .update({
      applies_month_count: (lead.applies_month_count || 0) + incrementBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);
}

export async function storePendingApply(leadId: string, jobId: string, jobPublicId: string): Promise<void> {
  await leadDb
    .from('wa_leads')
    .update({
      pending_apply_job_id: jobId,
      pending_apply_job_public_id: jobPublicId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
}

export async function clearPendingApply(leadId: string): Promise<void> {
  await leadDb
    .from('wa_leads')
    .update({
      pending_apply_job_id: null,
      pending_apply_job_public_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
}

export async function upsertTalentLeadProfile(
  leadId: string,
  payload: {
    fullName?: string | null;
    institutionName?: string | null;
    town?: string | null;
    courseOrMajor?: string | null;
    cvOrProjects?: string | null;
    completed?: boolean;
  }
): Promise<WaTalentProfileRow | null> {
  const { data, error } = await leadDb
    .from('wa_talent_profiles')
    .upsert(
      {
        wa_lead_id: leadId,
        full_name: payload.fullName ?? null,
        institution_name: payload.institutionName ?? null,
        town: payload.town ?? null,
        course_or_major: payload.courseOrMajor ?? null,
        cv_or_projects: payload.cvOrProjects ?? null,
        completed: payload.completed ?? false,
      },
      {
        onConflict: 'wa_lead_id',
        ignoreDuplicates: false,
      }
    )
    .select('*')
    .single();

  if (error || !data) {
    return null;
  }

  return data as WaTalentProfileRow;
}

export async function touchWeeklyMatchMarker(leadId: string): Promise<void> {
  await leadDb
    .from('wa_leads')
    .update({
      last_matched_jobs_sent_at: new Date().toISOString(),
      last_matched_jobs_week_key: weekBucketGmtPlus1(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
}
