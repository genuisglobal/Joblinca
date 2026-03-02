import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

interface RouteContext {
  params: {
    id: string;
  };
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

async function getAuthorizedJobEditor(jobId: string) {
  const supabase = createServerSupabaseClient();
  const serviceClient = createServiceSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const [{ data: profile }, { data: job }] = await Promise.all([
    serviceClient
      .from('profiles')
      .select('id, admin_type')
      .eq('id', user.id)
      .maybeSingle(),
    serviceClient
      .from('jobs')
      .select('id, posted_by')
      .eq('id', jobId)
      .maybeSingle(),
  ]);

  if (!job) {
    return {
      error: NextResponse.json({ error: 'Job not found' }, { status: 404 }),
    };
  }

  const isSuperAdmin = profile?.admin_type === 'super';
  const isPoster = job.posted_by === user.id;

  if (!isPoster && !isSuperAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Only the original poster or a super admin can edit this job.' },
        { status: 403 }
      ),
    };
  }

  return {
    serviceClient,
    userId: user.id,
    isPoster,
    isSuperAdmin,
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedJobEditor(params.id);

  if ('error' in access) {
    return access.error;
  }

  const { data: job, error } = await access.serviceClient
    .from('jobs')
    .select(
      `
      id,
      posted_by,
      title,
      company_name,
      company_logo_url,
      location,
      salary,
      work_type,
      job_type,
      visibility,
      description
    `
    )
    .eq('id', params.id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedJobEditor(params.id);

  if ('error' in access) {
    return access.error;
  }

  const body = await request.json();
  const title = sanitizeText(body.title);
  const companyName = sanitizeText(body.companyName);
  const description = sanitizeText(body.description);
  const companyLogoUrl = sanitizeText(body.companyLogoUrl);
  const location = sanitizeText(body.location);
  const workType = sanitizeText(body.workType) || 'onsite';
  const jobType = sanitizeText(body.jobType) || 'job';
  const visibility = sanitizeText(body.visibility) || 'public';

  if (!title || !companyName || !description) {
    return NextResponse.json(
      { error: 'Title, company name, and description are required.' },
      { status: 400 }
    );
  }

  let salary: number | null = null;
  if (body.salary !== undefined && body.salary !== null && body.salary !== '') {
    const parsedSalary = Number(body.salary);

    if (Number.isNaN(parsedSalary) || parsedSalary < 0) {
      return NextResponse.json(
        { error: 'Salary must be a valid non-negative number.' },
        { status: 400 }
      );
    }

    salary = parsedSalary;
  }

  const { data: job, error } = await access.serviceClient
    .from('jobs')
    .update({
      title,
      company_name: companyName,
      company_logo_url: companyLogoUrl,
      location,
      salary,
      work_type: workType,
      job_type: jobType,
      visibility,
      description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select(
      `
      id,
      posted_by,
      title,
      company_name,
      company_logo_url,
      location,
      salary,
      work_type,
      job_type,
      visibility,
      description
    `
    )
    .single();

  if (error || !job) {
    console.error('Job update error:', error);
    return NextResponse.json({ error: 'Failed to update job.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, job });
}
