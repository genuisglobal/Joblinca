import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export interface FieldAgentCheckResult {
  userId: string;
  email: string | null;
  officerId: string;
  officerCode: string;
  isActive: boolean;
  profileRole: string | null;
}

export class FieldAgentRequiredError extends Error {
  constructor(message = 'Field agent access required') {
    super(message);
    this.name = 'FieldAgentRequiredError';
  }
}

export async function requireFieldAgent(options?: {
  allowInactive?: boolean;
}): Promise<FieldAgentCheckResult> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new FieldAgentRequiredError('Authentication required');
  }

  const serviceClient = createServiceSupabaseClient();
  const [{ data: profile }, { data: officer, error: officerError }] = await Promise.all([
    serviceClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle(),
    serviceClient
      .from('registration_officers')
      .select('id, officer_code, is_active')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (officerError) {
    throw new FieldAgentRequiredError(
      officerError.message || 'Failed to load field agent access'
    );
  }

  if (!profile || profile.role !== 'field_agent' || !officer) {
    throw new FieldAgentRequiredError('Field agent access required');
  }

  if (!options?.allowInactive && !officer.is_active) {
    throw new FieldAgentRequiredError('Field agent account is inactive');
  }

  return {
    userId: user.id,
    email: user.email || null,
    officerId: officer.id as string,
    officerCode: officer.officer_code as string,
    isActive: Boolean(officer.is_active),
    profileRole: (profile.role as string | null) ?? null,
  };
}
