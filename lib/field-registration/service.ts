import { createHash, randomBytes } from 'crypto';
import { CAMEROON_PHONE_CODE } from '@/lib/onboarding/constants';
import {
  normalizePhoneDigits,
  resolveProfileIdByPhone,
} from '@/lib/phone-match';
import type {
  RegistrationLeadCaptureMode,
  RegistrationLeadInviteRecord,
  RegistrationLeadListItem,
  RegistrationLeadRecord,
  RegistrationLeadRole,
  RegistrationLeadStatus,
} from './types';
import {
  REGISTRATION_LEAD_ACTIVE_STATUSES,
  REGISTRATION_LEAD_CAPTURE_MODES,
  REGISTRATION_LEAD_ROLES,
  REGISTRATION_LEAD_TERMINAL_STATUSES,
} from './types';

type DatabaseClient = {
  from: (table: string) => any;
};

interface LeadFilters {
  status?: RegistrationLeadStatus | 'all' | null;
  role?: RegistrationLeadRole | 'all' | null;
  q?: string | null;
  limit?: number;
}

interface CreateLeadInput {
  officerUserId: string;
  officerCode: string;
  fullName: string;
  phone: string;
  intendedRole: RegistrationLeadRole;
  captureMode: RegistrationLeadCaptureMode;
  consentWhatsapp: boolean;
  email?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface CreateLeadResult {
  lead: RegistrationLeadRecord;
  created: boolean;
  existingUserId: string | null;
}

export interface InviteLeadResult {
  lead: RegistrationLeadRecord;
  invite: RegistrationLeadInviteRecord;
  claimUrl: string;
}

export interface InviteClaimContext {
  lead: RegistrationLeadRecord;
  invite: RegistrationLeadInviteRecord;
}

type LatestInviteSummary = NonNullable<RegistrationLeadListItem['latestInvite']>;

const DEFAULT_INVITE_TTL_DAYS = 14;
const DEFAULT_FIELD_REGISTRATION_TEMPLATE =
  process.env.WA_FIELD_REGISTRATION_TEMPLATE || 'field_registration_complete_v1';
const DEFAULT_FIELD_REGISTRATION_TEMPLATE_LANG =
  process.env.WA_FIELD_REGISTRATION_TEMPLATE_LANG || 'en';

function isLeadRole(value: string): value is RegistrationLeadRole {
  return REGISTRATION_LEAD_ROLES.includes(value as RegistrationLeadRole);
}

function isCaptureMode(value: string): value is RegistrationLeadCaptureMode {
  return REGISTRATION_LEAD_CAPTURE_MODES.includes(
    value as RegistrationLeadCaptureMode
  );
}

export function normalizeLeadPhone(phone: string): string | null {
  const raw = phone.trim();
  if (!raw) {
    return null;
  }

  const digits = normalizePhoneDigits(raw);
  if (!digits || digits.length < 8) {
    return null;
  }

  if (raw.startsWith('+') || digits.startsWith('237')) {
    return `+${digits}`;
  }

  if (digits.length <= 9) {
    return `${CAMEROON_PHONE_CODE}${digits}`;
  }

  return `+${digits}`;
}

export function buildLeadClaimUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl.replace(/\/$/, '')}/complete-registration/${encodeURIComponent(rawToken)}`;
}

export function getFieldRegistrationInviteTemplateConfig() {
  return {
    templateName: DEFAULT_FIELD_REGISTRATION_TEMPLATE,
    languageCode: DEFAULT_FIELD_REGISTRATION_TEMPLATE_LANG,
  };
}

export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

function sanitizeFullName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const compact = value.replace(/\s+/g, ' ').trim();
  return compact || null;
}

function sanitizeEmail(value: string | null | undefined): string | null {
  const compact = sanitizeOptionalText(value);
  return compact ? compact.toLowerCase() : null;
}

async function insertLeadEvent(
  db: DatabaseClient,
  params: {
    leadId: string;
    actorUserId?: string | null;
    eventType: string;
    payload?: Record<string, unknown> | null;
  }
): Promise<void> {
  await db.from('registration_lead_events').insert({
    lead_id: params.leadId,
    actor_user_id: params.actorUserId ?? null,
    event_type: params.eventType,
    payload_json: params.payload ?? {},
    created_at: new Date().toISOString(),
  });
}

async function getLatestInviteMap(
  db: DatabaseClient,
  leadIds: string[]
): Promise<Record<string, RegistrationLeadListItem['latestInvite']>> {
  const inviteMap: Record<string, RegistrationLeadListItem['latestInvite']> = {};
  if (leadIds.length === 0) {
    return inviteMap;
  }

  const { data, error } = await db
    .from('registration_lead_invites')
    .select(
      'id, lead_id, status, sent_at, opened_at, claimed_at, expires_at, created_at'
    )
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to load lead invites');
  }

  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const leadId = String(row.lead_id || '');
    if (!leadId || inviteMap[leadId]) {
      continue;
    }

    inviteMap[leadId] = {
      id: String(row.id),
      status: String(row.status) as LatestInviteSummary['status'],
      sent_at: (row.sent_at as string | null) ?? null,
      opened_at: (row.opened_at as string | null) ?? null,
      claimed_at: (row.claimed_at as string | null) ?? null,
      expires_at: String(row.expires_at),
      created_at: String(row.created_at),
    };
  }

  return inviteMap;
}

export async function listRegistrationLeadsForOfficer(
  db: DatabaseClient,
  officerUserId: string,
  filters: LeadFilters = {}
): Promise<RegistrationLeadListItem[]> {
  let query = db
    .from('registration_leads')
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .eq('officer_user_id', officerUserId)
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters.role && filters.role !== 'all') {
    query = query.eq('intended_role', filters.role);
  }

  if (filters.limit && Number.isFinite(filters.limit)) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Failed to load registration leads');
  }

  let leads = (data || []) as RegistrationLeadRecord[];

  if (filters.q?.trim()) {
    const search = filters.q.trim().toLowerCase();
    leads = leads.filter((lead) => {
      return (
        lead.full_name.toLowerCase().includes(search) ||
        lead.phone_e164.toLowerCase().includes(search) ||
        (lead.email || '').toLowerCase().includes(search) ||
        lead.intended_role.toLowerCase().includes(search)
      );
    });
  }

  const latestInviteMap = await getLatestInviteMap(
    db,
    leads.map((lead) => lead.id)
  );

  return leads.map((lead) => ({
    ...lead,
    latestInvite: latestInviteMap[lead.id] ?? null,
  }));
}

export async function getRegistrationLeadForOfficer(
  db: DatabaseClient,
  leadId: string,
  officerUserId: string
): Promise<RegistrationLeadRecord | null> {
  const { data, error } = await db
    .from('registration_leads')
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .eq('id', leadId)
    .eq('officer_user_id', officerUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load registration lead');
  }

  return (data as RegistrationLeadRecord | null) ?? null;
}

export async function createOrUpdateRegistrationLead(
  db: DatabaseClient,
  input: CreateLeadInput
): Promise<CreateLeadResult> {
  const fullName = sanitizeFullName(input.fullName);
  if (!fullName) {
    throw new Error('Full name is required');
  }

  const normalizedPhone = normalizeLeadPhone(input.phone);
  if (!normalizedPhone) {
    throw new Error('A valid WhatsApp phone number is required');
  }

  if (!isLeadRole(input.intendedRole)) {
    throw new Error('Registration role is invalid');
  }

  if (!isCaptureMode(input.captureMode)) {
    throw new Error('Capture mode is invalid');
  }

  const email = sanitizeEmail(input.email);
  const notes = sanitizeOptionalText(input.notes);
  const now = new Date().toISOString();
  const existingUserId = await resolveProfileIdByPhone(db, normalizedPhone, {
    allowFuzzy: true,
  });
  const resolvedStatus: RegistrationLeadStatus = existingUserId
    ? 'duplicate_existing_user'
    : 'captured';

  const { data: activeLead, error: activeLeadError } = await db
    .from('registration_leads')
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .eq('phone_e164', normalizedPhone)
    .in('status', REGISTRATION_LEAD_ACTIVE_STATUSES)
    .maybeSingle();

  if (activeLeadError) {
    throw new Error(activeLeadError.message || 'Failed to check existing registration leads');
  }

  if (activeLead) {
    const { data: updatedLead, error: updateError } = await db
      .from('registration_leads')
      .update({
        officer_user_id: input.officerUserId,
        officer_code_snapshot: input.officerCode,
        intended_role: input.intendedRole,
        capture_mode: input.captureMode,
        full_name: fullName,
        email,
        payload_json: input.payload ?? {},
        consent_whatsapp: input.consentWhatsapp,
        consent_recorded_at: input.consentWhatsapp ? now : null,
        status: resolvedStatus,
        existing_user_id: existingUserId,
        notes,
        updated_at: now,
      })
      .eq('id', activeLead.id)
      .select(
        'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
      )
      .single();

    if (updateError || !updatedLead) {
      throw new Error(updateError?.message || 'Failed to update registration lead');
    }

    await insertLeadEvent(db, {
      leadId: updatedLead.id as string,
      actorUserId: input.officerUserId,
      eventType: existingUserId
        ? 'lead_marked_duplicate_existing_user'
        : 'lead_updated',
      payload: {
        captureMode: input.captureMode,
        intendedRole: input.intendedRole,
      },
    });

    return {
      lead: updatedLead as RegistrationLeadRecord,
      created: false,
      existingUserId,
    };
  }

  const { data: insertedLead, error: insertError } = await db
    .from('registration_leads')
    .insert({
      officer_user_id: input.officerUserId,
      officer_code_snapshot: input.officerCode,
      intended_role: input.intendedRole,
      capture_mode: input.captureMode,
      full_name: fullName,
      phone_e164: normalizedPhone,
      email,
      payload_json: input.payload ?? {},
      consent_whatsapp: input.consentWhatsapp,
      consent_recorded_at: input.consentWhatsapp ? now : null,
      status: resolvedStatus,
      existing_user_id: existingUserId,
      notes,
      created_at: now,
      updated_at: now,
    })
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .single();

  if (insertError || !insertedLead) {
    throw new Error(insertError?.message || 'Failed to create registration lead');
  }

  await insertLeadEvent(db, {
    leadId: insertedLead.id as string,
    actorUserId: input.officerUserId,
    eventType: existingUserId
      ? 'lead_created_duplicate_existing_user'
      : 'lead_created',
    payload: {
      captureMode: input.captureMode,
      intendedRole: input.intendedRole,
    },
  });

  return {
    lead: insertedLead as RegistrationLeadRecord,
    created: true,
    existingUserId,
  };
}

export async function createLeadInvite(
  db: DatabaseClient,
  params: {
    leadId: string;
    actorUserId: string;
    baseUrl: string;
    ttlDays?: number;
  }
): Promise<InviteLeadResult> {
  const { data: lead, error: leadError } = await db
    .from('registration_leads')
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .eq('id', params.leadId)
    .maybeSingle();

  if (leadError) {
    throw new Error(leadError.message || 'Failed to load registration lead');
  }

  if (!lead) {
    throw new Error('Registration lead not found');
  }

  if (lead.officer_user_id !== params.actorUserId) {
    throw new Error('You can only manage your own registration leads');
  }

  if (REGISTRATION_LEAD_TERMINAL_STATUSES.includes(lead.status as RegistrationLeadStatus)) {
    throw new Error('This registration lead can no longer receive invites');
  }

  if (lead.existing_user_id) {
    throw new Error('This phone number is already linked to an existing account');
  }

  if (!lead.consent_whatsapp) {
    throw new Error('WhatsApp consent is required before sending an invite');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + (params.ttlDays ?? DEFAULT_INVITE_TTL_DAYS) * 24 * 60 * 60 * 1000
  ).toISOString();

  await db
    .from('registration_lead_invites')
    .update({
      status: 'expired',
      updated_at: nowIso,
    })
    .eq('lead_id', lead.id)
    .in('status', ['pending', 'sent', 'opened']);

  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  const templateName = DEFAULT_FIELD_REGISTRATION_TEMPLATE;
  const { data: invite, error: inviteError } = await db
    .from('registration_lead_invites')
    .insert({
      lead_id: lead.id,
      token_hash: tokenHash,
      template_name: templateName,
      status: 'pending',
      expires_at: expiresAt,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(
      'id, lead_id, token_hash, template_name, status, sent_at, opened_at, claimed_at, expires_at, error_message, created_at, updated_at'
    )
    .single();

  if (inviteError || !invite) {
    throw new Error(inviteError?.message || 'Failed to create registration invite');
  }

  const claimUrl = buildLeadClaimUrl(params.baseUrl, rawToken);

  await insertLeadEvent(db, {
    leadId: lead.id as string,
    actorUserId: params.actorUserId,
    eventType: 'lead_invite_created',
    payload: {
      inviteId: invite.id,
      expiresAt,
    },
  });

  return {
    lead: lead as RegistrationLeadRecord,
    invite: invite as RegistrationLeadInviteRecord,
    claimUrl,
  };
}

export async function markLeadInviteSent(
  db: DatabaseClient,
  params: {
    leadId: string;
    inviteId: string;
    actorUserId: string;
  }
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .from('registration_lead_invites')
    .update({
      status: 'sent',
      sent_at: now,
      error_message: null,
      updated_at: now,
    })
    .eq('id', params.inviteId);

  await db
    .from('registration_leads')
    .update({
      status: 'invite_sent',
      updated_at: now,
    })
    .eq('id', params.leadId);

  await insertLeadEvent(db, {
    leadId: params.leadId,
    actorUserId: params.actorUserId,
    eventType: 'lead_invite_sent',
    payload: {
      inviteId: params.inviteId,
    },
  });
}

export async function markLeadInviteFailed(
  db: DatabaseClient,
  params: {
    leadId: string;
    inviteId: string;
    actorUserId: string;
    errorMessage: string;
  }
): Promise<void> {
  const now = new Date().toISOString();

  await db
    .from('registration_lead_invites')
    .update({
      status: 'failed',
      error_message: params.errorMessage,
      updated_at: now,
    })
    .eq('id', params.inviteId);

  await insertLeadEvent(db, {
    leadId: params.leadId,
    actorUserId: params.actorUserId,
    eventType: 'lead_invite_failed',
    payload: {
      inviteId: params.inviteId,
      error: params.errorMessage,
    },
  });
}

export async function cancelRegistrationLead(
  db: DatabaseClient,
  params: {
    leadId: string;
    officerUserId: string;
  }
): Promise<RegistrationLeadRecord> {
  const lead = await getRegistrationLeadForOfficer(db, params.leadId, params.officerUserId);
  if (!lead) {
    throw new Error('Registration lead not found');
  }

  if (lead.status === 'completed') {
    throw new Error('Completed registration leads cannot be cancelled');
  }

  const now = new Date().toISOString();
  const { data: updatedLead, error: updateError } = await db
    .from('registration_leads')
    .update({
      status: 'cancelled',
      updated_at: now,
    })
    .eq('id', lead.id)
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .single();

  if (updateError || !updatedLead) {
    throw new Error(updateError?.message || 'Failed to cancel registration lead');
  }

  await db
    .from('registration_lead_invites')
    .update({
      status: 'expired',
      updated_at: now,
    })
    .eq('lead_id', lead.id)
    .in('status', ['pending', 'sent', 'opened']);

  await insertLeadEvent(db, {
    leadId: lead.id,
    actorUserId: params.officerUserId,
    eventType: 'lead_cancelled',
  });

  return updatedLead as RegistrationLeadRecord;
}

export async function markRegistrationLeadOptedOut(
  db: DatabaseClient,
  params: {
    leadId: string;
    officerUserId: string;
  }
): Promise<RegistrationLeadRecord> {
  const lead = await getRegistrationLeadForOfficer(db, params.leadId, params.officerUserId);
  if (!lead) {
    throw new Error('Registration lead not found');
  }

  if (lead.status === 'completed') {
    throw new Error('Completed registration leads cannot be opted out');
  }

  const now = new Date().toISOString();
  const { data: updatedLead, error: updateError } = await db
    .from('registration_leads')
    .update({
      status: 'opted_out',
      updated_at: now,
    })
    .eq('id', lead.id)
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .single();

  if (updateError || !updatedLead) {
    throw new Error(updateError?.message || 'Failed to update registration lead');
  }

  await db
    .from('registration_lead_invites')
    .update({
      status: 'expired',
      updated_at: now,
    })
    .eq('lead_id', lead.id)
    .in('status', ['pending', 'sent', 'opened']);

  await insertLeadEvent(db, {
    leadId: lead.id,
    actorUserId: params.officerUserId,
    eventType: 'lead_opted_out',
  });

  return updatedLead as RegistrationLeadRecord;
}

export async function getInviteClaimContext(
  db: DatabaseClient,
  rawToken: string
): Promise<InviteClaimContext | null> {
  const tokenHash = hashInviteToken(rawToken);
  const { data: invite, error: inviteError } = await db
    .from('registration_lead_invites')
    .select(
      'id, lead_id, token_hash, template_name, status, sent_at, opened_at, claimed_at, expires_at, error_message, created_at, updated_at'
    )
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (inviteError) {
    throw new Error(inviteError.message || 'Failed to load registration invite');
  }

  if (!invite) {
    return null;
  }

  const { data: lead, error: leadError } = await db
    .from('registration_leads')
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .eq('id', invite.lead_id)
    .maybeSingle();

  if (leadError) {
    throw new Error(leadError.message || 'Failed to load registration lead');
  }

  if (!lead) {
    return null;
  }

  const expiresAt = new Date(String(invite.expires_at));
  if (
    invite.status === 'expired' ||
    invite.status === 'failed' ||
    invite.status === 'claimed' ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const now = new Date().toISOString();
  if (invite.status === 'pending' || invite.status === 'sent') {
    await db
      .from('registration_lead_invites')
      .update({
        status: 'opened',
        opened_at: now,
        updated_at: now,
      })
      .eq('id', invite.id);
  }

  if (lead.status === 'captured' || lead.status === 'invite_sent') {
    await db
      .from('registration_leads')
      .update({
        status: 'opened',
        updated_at: now,
      })
      .eq('id', lead.id);

    await insertLeadEvent(db, {
      leadId: lead.id as string,
      actorUserId: null,
      eventType: 'lead_claim_opened',
      payload: {
        inviteId: invite.id,
      },
    });
  }

  return {
    lead: {
      ...(lead as RegistrationLeadRecord),
      status:
        lead.status === 'captured' || lead.status === 'invite_sent'
          ? 'opened'
          : (lead.status as RegistrationLeadStatus),
    },
    invite: {
      ...(invite as RegistrationLeadInviteRecord),
      status:
        invite.status === 'pending' || invite.status === 'sent'
          ? 'opened'
          : (invite.status as RegistrationLeadInviteRecord['status']),
      opened_at:
        (invite.opened_at as string | null) ||
        (invite.status === 'pending' || invite.status === 'sent' ? now : null),
    },
  };
}

export async function completeLeadFromInviteToken(
  db: DatabaseClient,
  params: {
    rawToken: string;
    completedUserId: string;
  }
): Promise<RegistrationLeadRecord | null> {
  const tokenHash = hashInviteToken(params.rawToken);
  const { data: invite, error: inviteError } = await db
    .from('registration_lead_invites')
    .select('id, lead_id, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (inviteError) {
    throw new Error(inviteError.message || 'Failed to load registration invite');
  }

  if (!invite) {
    return null;
  }

  const expiresAt = new Date(String(invite.expires_at));
  if (
    invite.status === 'claimed' ||
    invite.status === 'expired' ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const { data: updatedLead, error: leadUpdateError } = await db
    .from('registration_leads')
    .update({
      status: 'completed',
      completed_user_id: params.completedUserId,
      updated_at: now,
    })
    .eq('id', invite.lead_id)
    .select(
      'id, officer_user_id, officer_code_snapshot, intended_role, capture_mode, full_name, phone_e164, email, payload_json, consent_whatsapp, consent_recorded_at, status, existing_user_id, completed_user_id, notes, created_at, updated_at'
    )
    .single();

  if (leadUpdateError || !updatedLead) {
    throw new Error(leadUpdateError?.message || 'Failed to complete registration lead');
  }

  await db
    .from('registration_lead_invites')
    .update({
      status: 'claimed',
      claimed_at: now,
      updated_at: now,
    })
    .eq('id', invite.id);

  await db
    .from('registration_lead_invites')
    .update({
      status: 'expired',
      updated_at: now,
    })
    .eq('lead_id', invite.lead_id)
    .neq('id', invite.id)
    .in('status', ['pending', 'sent', 'opened']);

  await insertLeadEvent(db, {
    leadId: invite.lead_id as string,
    actorUserId: params.completedUserId,
    eventType: 'lead_completed',
    payload: {
      inviteId: invite.id,
      completedUserId: params.completedUserId,
    },
  });

  return updatedLead as RegistrationLeadRecord;
}
