export const SUPPORT_TICKET_CATEGORIES = [
  'login',
  'verification',
  'profile',
  'payment',
  'application',
  'bug',
  'other',
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_user',
  'escalated',
  'resolved',
  'closed',
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_TEAMS = [
  'support',
  'operations',
  'engineering',
] as const;

export type SupportTicketTeam = (typeof SUPPORT_TICKET_TEAMS)[number];

export interface SupportTicketRecord {
  id: string;
  requester_user_id: string | null;
  field_agent_user_id: string;
  field_officer_code_snapshot: string | null;
  registration_lead_id: string | null;
  target_role: 'job_seeker' | 'talent' | 'recruiter';
  subject_full_name: string;
  subject_phone_e164: string | null;
  subject_email: string | null;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  assigned_team: SupportTicketTeam;
  status: SupportTicketStatus;
  assigned_admin_id: string | null;
  subject: string;
  description: string;
  resolution_summary: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessageRecord {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_kind: 'field_agent' | 'admin' | 'system';
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface SupportTicketEventRecord {
  id: string;
  ticket_id: string;
  actor_user_id: string | null;
  event_type: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
}

export interface SupportTicketListItem extends SupportTicketRecord {
  fieldAgent: {
    id: string;
    fullName: string;
    email: string | null;
  } | null;
  assignedAdmin: {
    id: string;
    fullName: string;
    email: string | null;
  } | null;
  registrationLead: {
    id: string;
    full_name: string;
    phone_e164: string | null;
    status: string;
  } | null;
  latestMessage: Pick<
    SupportTicketMessageRecord,
    'id' | 'author_kind' | 'body' | 'is_internal' | 'created_at'
  > | null;
}
