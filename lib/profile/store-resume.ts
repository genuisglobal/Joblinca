/**
 * Save a CV to a job seeker's or talent's profile. Shared by the website's
 * upload route and the WhatsApp agent, so both enforce the same rules: PDF or
 * Word only, 5MB max, extension whitelist, magic bytes matching the type.
 */

import type { createServiceSupabaseClient } from '@/lib/supabase/service';
import { validateExtension, validateFileBuffer } from '@/lib/file-validation';

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export type StoreResumeResult =
  | { status: 'stored'; resumeUrl: string }
  | { status: 'not_seeker' | 'too_large' | 'bad_type' | 'bad_content' }
  | { status: 'error'; message: string };

export function isResumeRole(role: string | null | undefined): boolean {
  return role === 'job_seeker' || role === 'talent';
}

export async function storeResumeForUser(
  service: ServiceClient,
  params: {
    userId: string;
    role: string | null;
    buffer: ArrayBuffer;
    mimeType: string;
    /** Original filename, when there is one; the extension must match the whitelist. */
    filename: string | null;
  }
): Promise<StoreResumeResult> {
  if (!isResumeRole(params.role)) return { status: 'not_seeker' };
  if (params.buffer.byteLength > RESUME_MAX_BYTES) return { status: 'too_large' };
  if (!RESUME_MIME_TYPES.includes(params.mimeType)) return { status: 'bad_type' };

  // WhatsApp documents may arrive without a filename; derive from the type then.
  const ext = params.filename
    ? validateExtension(params.filename, 'resume')
    : EXT_BY_MIME[params.mimeType];
  if (!ext) return { status: 'bad_type' };
  if (!validateFileBuffer(params.buffer, params.mimeType).valid) return { status: 'bad_content' };

  const filePath = `resumes/${params.userId}/resume-${Date.now()}.${ext}`;
  const { error: uploadError } = await service.storage
    .from('resumes')
    .upload(filePath, params.buffer, { contentType: params.mimeType, upsert: true });
  if (uploadError) return { status: 'error', message: uploadError.message };

  const { data: urlData } = service.storage.from('resumes').getPublicUrl(filePath);
  const resumeUrl = urlData.publicUrl;

  const table = params.role === 'job_seeker' ? 'job_seeker_profiles' : 'talent_profiles';
  const { error: updateError } = await service
    .from(table)
    .update({ resume_url: resumeUrl, updated_at: new Date().toISOString() })
    .eq('user_id', params.userId);
  if (updateError) return { status: 'error', message: updateError.message };

  return { status: 'stored', resumeUrl };
}
