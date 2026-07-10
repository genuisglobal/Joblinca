export const REGISTRATION_LEAD_ROLES = ['job_seeker', 'talent', 'recruiter'] as const;
export type RegistrationLeadRole = (typeof REGISTRATION_LEAD_ROLES)[number];

export const REGISTRATION_LEAD_CAPTURE_MODES = [
  'quick_capture',
  'assisted_signup',
] as const;
export type RegistrationLeadCaptureMode = (typeof REGISTRATION_LEAD_CAPTURE_MODES)[number];

export const REGISTRATION_LEAD_STATUSES = [
  'captured',
  'invite_sent',
  'opened',
  'completed',
  'duplicate_existing_user',
  'opted_out',
  'expired',
  'cancelled',
] as const;
export type RegistrationLeadStatus = (typeof REGISTRATION_LEAD_STATUSES)[number];

export const REGISTRATION_LEAD_ACTIVE_STATUSES: RegistrationLeadStatus[] = [
  'captured',
  'invite_sent',
  'opened',
];

export const REGISTRATION_LEAD_TERMINAL_STATUSES: RegistrationLeadStatus[] = [
  'completed',
  'duplicate_existing_user',
  'opted_out',
  'expired',
  'cancelled',
];

export const REGISTRATION_LEAD_INVITE_STATUSES = [
  'pending',
  'sent',
  'opened',
  'claimed',
  'expired',
  'failed',
] as const;
export type RegistrationLeadInviteStatus =
  (typeof REGISTRATION_LEAD_INVITE_STATUSES)[number];

export interface RegistrationLeadRecord {
  id: string;
  officer_user_id: string;
  officer_code_snapshot: string;
  intended_role: RegistrationLeadRole;
  capture_mode: RegistrationLeadCaptureMode;
  full_name: string;
  phone_e164: string;
  email: string | null;
  payload_json: Record<string, unknown> | null;
  consent_whatsapp: boolean;
  consent_recorded_at: string | null;
  status: RegistrationLeadStatus;
  existing_user_id: string | null;
  completed_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationLeadInviteRecord {
  id: string;
  lead_id: string;
  token_hash: string;
  template_name: string;
  status: RegistrationLeadInviteStatus;
  sent_at: string | null;
  opened_at: string | null;
  claimed_at: string | null;
  expires_at: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistrationLeadEventRecord {
  id: string;
  lead_id: string;
  actor_user_id: string | null;
  event_type: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
}

export interface RegistrationLeadListItem extends RegistrationLeadRecord {
  latestInvite: Pick<
    RegistrationLeadInviteRecord,
    'id' | 'status' | 'sent_at' | 'opened_at' | 'claimed_at' | 'expires_at' | 'created_at'
  > | null;
}
