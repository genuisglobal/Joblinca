import { normalizeLeadPhone } from '@/lib/field-registration/service';
import {
  REGISTRATION_LEAD_ROLES,
  type RegistrationLeadRole,
} from '@/lib/field-registration/types';
import type {
  SupportTicketCategory,
  SupportTicketListItem,
  SupportTicketMessageRecord,
  SupportTicketPriority,
  SupportTicketRecord,
  SupportTicketStatus,
  SupportTicketTeam,
} from './types';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_TEAMS,
} from './types';

type DatabaseClient = {
  from: (table: string) => any;
};

interface SupportTicketFilters {
  status?: SupportTicketStatus | 'all' | null;
  assignedTeam?: SupportTicketTeam | 'all' | null;
  limit?: number;
}

interface CreateSupportTicketInput {
  fieldAgentUserId: string;
  fieldOfficerCodeSnapshot?: string | null;
  requesterUserId?: string | null;
  registrationLeadId?: string | null;
  targetRole: RegistrationLeadRole;
  subjectFullName: string;
  subjectPhone?: string | null;
  subjectEmail?: string | null;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  assignedTeam?: SupportTicketTeam | null;
  subject: string;
  description: string;
}

interface UpdateSupportTicketInput {
  ticketId: string;
  actorUserId: string;
  assignedAdminId?: string | null;
  status?: SupportTicketStatus | null;
  priority?: SupportTicketPriority | null;
  assignedTeam?: SupportTicketTeam | null;
  resolutionSummary?: string | null;
  messageBody?: string | null;
  messageVisibility?: 'internal' | 'public' | null;
}

function sanitizeRequiredText(value: string, fieldLabel: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    throw new Error(`${fieldLabel} is required`);
  }
  return compact;
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

function isTargetRole(value: string): value is RegistrationLeadRole {
  return REGISTRATION_LEAD_ROLES.includes(value as RegistrationLeadRole);
}

function isCategory(value: string): value is SupportTicketCategory {
  return SUPPORT_TICKET_CATEGORIES.includes(value as SupportTicketCategory);
}

function isPriority(value: string): value is SupportTicketPriority {
  return SUPPORT_TICKET_PRIORITIES.includes(value as SupportTicketPriority);
}

function isStatus(value: string): value is SupportTicketStatus {
  return SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus);
}

function isAssignedTeam(value: string): value is SupportTicketTeam {
  return SUPPORT_TICKET_TEAMS.includes(value as SupportTicketTeam);
}

function toTicketRecord(row: Record<string, unknown>): SupportTicketRecord {
  const targetRole = String(row.target_role || '');
  const category = String(row.category || '');
  const priority = String(row.priority || '');
  const assignedTeam = String(row.assigned_team || '');
  const status = String(row.status || '');

  if (
    !isTargetRole(targetRole) ||
    !isCategory(category) ||
    !isPriority(priority) ||
    !isAssignedTeam(assignedTeam) ||
    !isStatus(status)
  ) {
    throw new Error('Invalid support ticket data');
  }

  return {
    id: String(row.id),
    requester_user_id: (row.requester_user_id as string | null) ?? null,
    field_agent_user_id: String(row.field_agent_user_id),
    field_officer_code_snapshot:
      (row.field_officer_code_snapshot as string | null) ?? null,
    registration_lead_id: (row.registration_lead_id as string | null) ?? null,
    target_role: targetRole,
    subject_full_name: String(row.subject_full_name || ''),
    subject_phone_e164: (row.subject_phone_e164 as string | null) ?? null,
    subject_email: (row.subject_email as string | null) ?? null,
    category,
    priority,
    assigned_team: assignedTeam,
    status,
    assigned_admin_id: (row.assigned_admin_id as string | null) ?? null,
    subject: String(row.subject || ''),
    description: String(row.description || ''),
    resolution_summary: (row.resolution_summary as string | null) ?? null,
    resolved_at: (row.resolved_at as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
    last_message_at: String(row.last_message_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function insertTicketEvent(
  db: DatabaseClient,
  params: {
    ticketId: string;
    actorUserId?: string | null;
    eventType: string;
    payload?: Record<string, unknown> | null;
  }
): Promise<void> {
  await db.from('support_ticket_events').insert({
    ticket_id: params.ticketId,
    actor_user_id: params.actorUserId ?? null,
    event_type: params.eventType,
    payload_json: params.payload ?? {},
    created_at: new Date().toISOString(),
  });
}

async function insertTicketMessage(
  db: DatabaseClient,
  params: {
    ticketId: string;
    authorUserId?: string | null;
    authorKind: SupportTicketMessageRecord['author_kind'];
    body: string;
    isInternal?: boolean;
  }
): Promise<void> {
  const messageBody = sanitizeRequiredText(params.body, 'Message');
  await db.from('support_ticket_messages').insert({
    ticket_id: params.ticketId,
    author_user_id: params.authorUserId ?? null,
    author_kind: params.authorKind,
    body: messageBody,
    is_internal: Boolean(params.isInternal),
    created_at: new Date().toISOString(),
  });
}

async function buildTicketListItems(
  db: DatabaseClient,
  ticketRows: SupportTicketRecord[],
  options?: {
    includeInternalMessages?: boolean;
  }
): Promise<SupportTicketListItem[]> {
  if (ticketRows.length === 0) {
    return [];
  }

  const fieldAgentIds = Array.from(
    new Set(ticketRows.map((ticket) => ticket.field_agent_user_id))
  );
  const assignedAdminIds = Array.from(
    new Set(
      ticketRows
        .map((ticket) => ticket.assigned_admin_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const profileIds = Array.from(new Set([...fieldAgentIds, ...assignedAdminIds]));
  const leadIds = Array.from(
    new Set(
      ticketRows
        .map((ticket) => ticket.registration_lead_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const ticketIds = ticketRows.map((ticket) => ticket.id);

  const [{ data: profiles, error: profileError }, { data: leads, error: leadError }, { data: messages, error: messageError }] =
    await Promise.all([
      profileIds.length
        ? db
            .from('profiles')
            .select('id, full_name, first_name, last_name, email')
            .in('id', profileIds)
        : Promise.resolve({ data: [], error: null }),
      leadIds.length
        ? db
            .from('registration_leads')
            .select('id, full_name, phone_e164, status')
            .in('id', leadIds)
        : Promise.resolve({ data: [], error: null }),
      ticketIds.length
        ? db
            .from('support_ticket_messages')
            .select('id, ticket_id, author_kind, body, is_internal, created_at')
            .in('ticket_id', ticketIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (profileError) {
    throw new Error(profileError.message || 'Failed to load support ticket profiles');
  }
  if (leadError) {
    throw new Error(leadError.message || 'Failed to load support ticket leads');
  }
  if (messageError) {
    throw new Error(messageError.message || 'Failed to load support ticket messages');
  }

  const profileMap = new Map(
    ((profiles || []) as Array<Record<string, unknown>>).map((row) => {
      const fullName =
        [row.first_name, row.last_name]
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
          .join(' ') ||
        String(row.full_name || '').trim() ||
        'Unknown user';
      return [
        String(row.id),
        {
          id: String(row.id),
          fullName,
          email: (row.email as string | null) ?? null,
        },
      ];
    })
  );

  const leadMap = new Map(
    ((leads || []) as Array<Record<string, unknown>>).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        full_name: String(row.full_name || ''),
        phone_e164: (row.phone_e164 as string | null) ?? null,
        status: String(row.status || ''),
      },
    ])
  );

  const latestMessageMap = new Map<
    string,
    SupportTicketListItem['latestMessage']
  >();

  for (const row of (messages || []) as Array<Record<string, unknown>>) {
    const ticketId = String(row.ticket_id || '');
    const isInternal = row.is_internal === true;
    if (!ticketId || latestMessageMap.has(ticketId)) {
      continue;
    }
    if (!options?.includeInternalMessages && isInternal) {
      continue;
    }

    latestMessageMap.set(ticketId, {
      id: String(row.id),
      author_kind: String(row.author_kind) as SupportTicketMessageRecord['author_kind'],
      body: String(row.body || ''),
      is_internal: isInternal,
      created_at: String(row.created_at),
    });
  }

  return ticketRows.map((ticket) => ({
    ...ticket,
    fieldAgent: profileMap.get(ticket.field_agent_user_id) || null,
    assignedAdmin: ticket.assigned_admin_id
      ? profileMap.get(ticket.assigned_admin_id) || null
      : null,
    registrationLead: ticket.registration_lead_id
      ? leadMap.get(ticket.registration_lead_id) || null
      : null,
    latestMessage: latestMessageMap.get(ticket.id) || null,
  }));
}

export async function listSupportTicketsForFieldAgent(
  db: DatabaseClient,
  fieldAgentUserId: string,
  filters: SupportTicketFilters = {}
): Promise<SupportTicketListItem[]> {
  let query = db
    .from('support_tickets')
    .select(
      'id, requester_user_id, field_agent_user_id, field_officer_code_snapshot, registration_lead_id, target_role, subject_full_name, subject_phone_e164, subject_email, category, priority, assigned_team, status, assigned_admin_id, subject, description, resolution_summary, resolved_at, closed_at, last_message_at, created_at, updated_at'
    )
    .eq('field_agent_user_id', fieldAgentUserId)
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters.assignedTeam && filters.assignedTeam !== 'all') {
    query = query.eq('assigned_team', filters.assignedTeam);
  }
  if (filters.limit && Number.isFinite(filters.limit)) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to load support tickets');
  }

  const ticketRows = ((data || []) as Array<Record<string, unknown>>).map(toTicketRecord);
  return buildTicketListItems(db, ticketRows, { includeInternalMessages: false });
}

export async function listSupportTicketsForAdmin(
  db: DatabaseClient,
  filters: SupportTicketFilters = {}
): Promise<SupportTicketListItem[]> {
  let query = db
    .from('support_tickets')
    .select(
      'id, requester_user_id, field_agent_user_id, field_officer_code_snapshot, registration_lead_id, target_role, subject_full_name, subject_phone_e164, subject_email, category, priority, assigned_team, status, assigned_admin_id, subject, description, resolution_summary, resolved_at, closed_at, last_message_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters.assignedTeam && filters.assignedTeam !== 'all') {
    query = query.eq('assigned_team', filters.assignedTeam);
  }
  if (filters.limit && Number.isFinite(filters.limit)) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to load support tickets');
  }

  const ticketRows = ((data || []) as Array<Record<string, unknown>>).map(toTicketRecord);
  return buildTicketListItems(db, ticketRows, { includeInternalMessages: true });
}

export async function createSupportTicket(
  db: DatabaseClient,
  input: CreateSupportTicketInput
): Promise<SupportTicketRecord> {
  const targetRole = String(input.targetRole || '');
  const category = String(input.category || '');
  const priority = String(input.priority || '');
  const assignedTeam = String(input.assignedTeam || 'operations');
  if (!isTargetRole(targetRole)) {
    throw new Error('Invalid target role');
  }
  if (!isCategory(category)) {
    throw new Error('Invalid support category');
  }
  if (!isPriority(priority)) {
    throw new Error('Invalid support priority');
  }
  if (!isAssignedTeam(assignedTeam)) {
    throw new Error('Invalid support team');
  }

  let leadSnapshot:
    | {
        id: string;
        full_name: string;
        phone_e164: string | null;
        email: string | null;
        intended_role: RegistrationLeadRole;
      }
    | null = null;

  if (input.registrationLeadId) {
    const { data: lead, error: leadError } = await db
      .from('registration_leads')
      .select('id, officer_user_id, full_name, phone_e164, email, intended_role')
      .eq('id', input.registrationLeadId)
      .maybeSingle();

    if (leadError) {
      throw new Error(leadError.message || 'Failed to load related registration lead');
    }
    if (!lead || lead.officer_user_id !== input.fieldAgentUserId) {
      throw new Error('Related registration lead was not found');
    }

    const leadRole = String(lead.intended_role || '');
    if (!isTargetRole(leadRole)) {
      throw new Error('Related registration lead has an invalid role');
    }

    leadSnapshot = {
      id: String(lead.id),
      full_name: String(lead.full_name || ''),
      phone_e164: (lead.phone_e164 as string | null) ?? null,
      email: (lead.email as string | null) ?? null,
      intended_role: leadRole,
    };
  }

  const subjectFullName = sanitizeRequiredText(
    input.subjectFullName || leadSnapshot?.full_name || '',
    'Full name'
  );
  const normalizedPhone = input.subjectPhone
    ? normalizeLeadPhone(input.subjectPhone)
    : leadSnapshot?.phone_e164 || null;
  const subjectPhone = normalizedPhone || leadSnapshot?.phone_e164 || null;
  if (input.subjectPhone && !subjectPhone) {
    throw new Error('WhatsApp number is invalid');
  }

  const payload = {
    requester_user_id: input.requesterUserId ?? null,
    field_agent_user_id: input.fieldAgentUserId,
    field_officer_code_snapshot: sanitizeOptionalText(
      input.fieldOfficerCodeSnapshot
    ),
    registration_lead_id: leadSnapshot?.id ?? input.registrationLeadId ?? null,
    target_role: leadSnapshot?.intended_role ?? targetRole,
    subject_full_name: subjectFullName,
    subject_phone_e164: subjectPhone,
    subject_email: sanitizeEmail(input.subjectEmail) || leadSnapshot?.email || null,
    category,
    priority,
    assigned_team: assignedTeam,
    subject: sanitizeRequiredText(input.subject, 'Subject'),
    description: sanitizeRequiredText(input.description, 'Description'),
  };

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('support_tickets')
    .insert({
      ...payload,
      status: 'open',
      last_message_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(
      'id, requester_user_id, field_agent_user_id, field_officer_code_snapshot, registration_lead_id, target_role, subject_full_name, subject_phone_e164, subject_email, category, priority, assigned_team, status, assigned_admin_id, subject, description, resolution_summary, resolved_at, closed_at, last_message_at, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create support ticket');
  }

  const ticket = toTicketRecord(data as Record<string, unknown>);

  await insertTicketMessage(db, {
    ticketId: ticket.id,
    authorUserId: input.fieldAgentUserId,
    authorKind: 'field_agent',
    body: ticket.description,
    isInternal: false,
  });

  await insertTicketEvent(db, {
    ticketId: ticket.id,
    actorUserId: input.fieldAgentUserId,
    eventType: 'ticket_created',
    payload: {
      category: ticket.category,
      priority: ticket.priority,
      assigned_team: ticket.assigned_team,
      registration_lead_id: ticket.registration_lead_id,
    },
  });

  return ticket;
}

export async function updateSupportTicket(
  db: DatabaseClient,
  input: UpdateSupportTicketInput
): Promise<SupportTicketRecord> {
  const { data: existingRow, error: existingError } = await db
    .from('support_tickets')
    .select(
      'id, requester_user_id, field_agent_user_id, field_officer_code_snapshot, registration_lead_id, target_role, subject_full_name, subject_phone_e164, subject_email, category, priority, assigned_team, status, assigned_admin_id, subject, description, resolution_summary, resolved_at, closed_at, last_message_at, created_at, updated_at'
    )
    .eq('id', input.ticketId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || 'Failed to load support ticket');
  }
  if (!existingRow) {
    throw new Error('Support ticket not found');
  }

  const existing = toTicketRecord(existingRow as Record<string, unknown>);
  const updates: Record<string, unknown> = {};
  const eventPayload: Record<string, unknown> = {};

  if (input.status !== undefined && input.status !== null) {
    if (!isStatus(input.status)) {
      throw new Error('Invalid support status');
    }
    if (input.status !== existing.status) {
      updates.status = input.status;
      eventPayload.status = {
        from: existing.status,
        to: input.status,
      };
    }
  }

  if (input.priority !== undefined && input.priority !== null) {
    if (!isPriority(input.priority)) {
      throw new Error('Invalid support priority');
    }
    if (input.priority !== existing.priority) {
      updates.priority = input.priority;
      eventPayload.priority = {
        from: existing.priority,
        to: input.priority,
      };
    }
  }

  if (input.assignedTeam !== undefined && input.assignedTeam !== null) {
    if (!isAssignedTeam(input.assignedTeam)) {
      throw new Error('Invalid support team');
    }
    if (input.assignedTeam !== existing.assigned_team) {
      updates.assigned_team = input.assignedTeam;
      eventPayload.assigned_team = {
        from: existing.assigned_team,
        to: input.assignedTeam,
      };
    }
  }

  if (input.assignedAdminId !== undefined) {
    if ((input.assignedAdminId || null) !== existing.assigned_admin_id) {
      updates.assigned_admin_id = input.assignedAdminId || null;
      eventPayload.assigned_admin_id = {
        from: existing.assigned_admin_id,
        to: input.assignedAdminId || null,
      };
    }
  }

  if (input.resolutionSummary !== undefined) {
    const resolutionSummary = sanitizeOptionalText(input.resolutionSummary);
    if (resolutionSummary !== existing.resolution_summary) {
      updates.resolution_summary = resolutionSummary;
      eventPayload.resolution_summary_updated = true;
    }
  }

  const nextStatus = (updates.status as SupportTicketStatus | undefined) ?? existing.status;
  if (nextStatus === 'resolved') {
    updates.resolved_at = existing.resolved_at || new Date().toISOString();
    updates.closed_at = null;
  } else if (nextStatus === 'closed') {
    updates.resolved_at = existing.resolved_at || new Date().toISOString();
    updates.closed_at = new Date().toISOString();
  } else if (existing.status === 'resolved' || existing.status === 'closed') {
    updates.resolved_at = null;
    updates.closed_at = null;
  }

  const messageBody = sanitizeOptionalText(input.messageBody);
  const addMessage = Boolean(messageBody);
  if (addMessage) {
    const isInternal = input.messageVisibility !== 'public';
    await insertTicketMessage(db, {
      ticketId: input.ticketId,
      authorUserId: input.actorUserId,
      authorKind: 'admin',
      body: messageBody || '',
      isInternal,
    });
    updates.last_message_at = new Date().toISOString();
    eventPayload.message = {
      visibility: isInternal ? 'internal' : 'public',
    };
  }

  if (Object.keys(updates).length === 0 && !addMessage) {
    return existing;
  }

  const { data, error } = await db
    .from('support_tickets')
    .update(updates)
    .eq('id', input.ticketId)
    .select(
      'id, requester_user_id, field_agent_user_id, field_officer_code_snapshot, registration_lead_id, target_role, subject_full_name, subject_phone_e164, subject_email, category, priority, assigned_team, status, assigned_admin_id, subject, description, resolution_summary, resolved_at, closed_at, last_message_at, created_at, updated_at'
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update support ticket');
  }

  if (Object.keys(eventPayload).length > 0) {
    await insertTicketEvent(db, {
      ticketId: input.ticketId,
      actorUserId: input.actorUserId,
      eventType: 'ticket_updated',
      payload: eventPayload,
    });
  }

  return toTicketRecord(data as Record<string, unknown>);
}
