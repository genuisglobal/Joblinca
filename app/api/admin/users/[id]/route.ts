import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  const message = (error.message || '').toLowerCase();
  return error.code === '42703' || error.code === '42P01' || message.includes('does not exist');
}

async function ignoreMissingRelation<T extends { error?: { code?: string; message?: string } | null }>(
  operation: PromiseLike<T>
) {
  const result = await operation;
  if (isMissingRelationError(result.error || null)) {
    return null;
  }

  if (result.error) {
    throw new Error(result.error.message || 'Cleanup operation failed');
  }

  return result;
}

async function clearUserReferences(serviceClient: ReturnType<typeof createServiceSupabaseClient>, userId: string) {
  await Promise.all([
    ignoreMissingRelation(
      serviceClient
        .from('jobs')
        .update({ approved_by: null })
        .eq('approved_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('jobs')
        .update({ posted_by: null, posted_by_role: 'deleted_user' })
        .eq('posted_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('jobs')
        .update({ removed_by: null })
        .eq('removed_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('job_seeker_profiles')
        .update({ verified_by: null })
        .eq('verified_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('recruiter_profiles')
        .update({ verified_by: null })
        .eq('verified_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('profiles')
        .update({ admin_granted_by: null })
        .eq('admin_granted_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('profiles')
        .update({ referred_by: null })
        .eq('referred_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('job_reports')
        .update({ resolved_by: null })
        .eq('resolved_by', userId)
    ),
    ignoreMissingRelation(
      serviceClient
        .from('promo_codes')
        .update({ created_by: null })
        .eq('created_by', userId)
    ),
  ]);

  await ignoreMissingRelation(
    serviceClient
      .from('admin_audit_log')
      .delete()
      .eq('admin_id', userId)
  );

  await ignoreMissingRelation(
    serviceClient
      .from('promo_code_redemptions')
      .delete()
      .eq('user_id', userId)
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdminType('super');
    const serviceClient = createServiceSupabaseClient();
    const targetUserId = params.id;

    if (targetUserId === admin.userId) {
      return NextResponse.json(
        { error: 'You cannot delete your own admin account.' },
        { status: 400 }
      );
    }

    const { data: targetProfile, error: profileError } = await serviceClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, role, admin_type')
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message || 'Failed to load target user');
    }

    if (!targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetProfile.admin_type === 'super') {
      return NextResponse.json(
        { error: 'Super admin accounts cannot be deleted from the admin UI.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const deleteOwnedJobs = body?.deleteOwnedJobs !== false;

    let deletedJobs = 0;
    if (deleteOwnedJobs) {
      const { data: jobsToDelete, error: jobsLookupError } = await serviceClient
        .from('jobs')
        .select('id')
        .or(`recruiter_id.eq.${targetUserId},posted_by.eq.${targetUserId}`);

      if (jobsLookupError) {
        throw new Error(jobsLookupError.message || 'Failed to load related jobs');
      }

      const jobIds = (jobsToDelete || []).map((job) => job.id);
      if (jobIds.length > 0) {
        const { error: deleteJobsError } = await serviceClient
          .from('jobs')
          .delete()
          .in('id', jobIds);

        if (deleteJobsError) {
          throw new Error(deleteJobsError.message || 'Failed to delete related jobs');
        }

        deletedJobs = jobIds.length;
      }
    }

    await clearUserReferences(serviceClient, targetUserId);

    const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(targetUserId);
    if (authDeleteError) {
      throw new Error(authDeleteError.message || 'Failed to delete auth user');
    }

    try {
      await ignoreMissingRelation(
        serviceClient.from('admin_audit_log').insert({
          action: 'admin_delete_user',
          admin_id: admin.userId,
          admin_type: admin.adminType,
          target_table: 'profiles',
          target_id: targetProfile.id,
          new_values: {
            role: targetProfile.role,
            email: targetProfile.email,
            deleted_jobs: deletedJobs,
          },
        })
      );
    } catch (auditError) {
      console.warn('Admin user delete audit log failed', auditError);
    }

    return NextResponse.json({
      success: true,
      deletedUserId: targetProfile.id,
      deletedJobs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete user';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Admin access required'
          ? 403
          : message.includes('Insufficient admin privileges')
            ? 403
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
