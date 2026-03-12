import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin();
    const serviceClient = createServiceSupabaseClient();

    const { data: existingJob, error: jobLookupError } = await serviceClient
      .from('jobs')
      .select('id, title, company_name')
      .eq('id', params.id)
      .maybeSingle();

    if (jobLookupError) {
      throw new Error(jobLookupError.message || 'Failed to load job');
    }

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const { error: deleteError } = await serviceClient
      .from('jobs')
      .delete()
      .eq('id', params.id);

    if (deleteError) {
      throw new Error(deleteError.message || 'Failed to delete job');
    }

    try {
      await serviceClient.from('admin_audit_log').insert({
        action: 'admin_delete_job',
        admin_id: admin.userId,
        admin_type: admin.adminType,
        target_table: 'jobs',
        target_id: existingJob.id,
        new_values: {
          title: existingJob.title,
          company_name: existingJob.company_name,
        },
      });
    } catch (auditError) {
      console.warn('Admin job delete audit log failed', auditError);
    }

    return NextResponse.json({
      success: true,
      deletedJobId: existingJob.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete job';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Admin access required'
          ? 403
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
