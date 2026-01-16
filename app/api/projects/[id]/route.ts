import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// GET: Get a single project
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // If project is not public, check if user is the owner
  if (!project.public) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || project.candidate_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
  }

  return NextResponse.json(project);
}

// PUT: Update a project
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Check if user owns the project
  const { data: existingProject, error: fetchError } = await supabase
    .from('projects')
    .select('candidate_id')
    .eq('id', params.id)
    .single();

  if (fetchError || !existingProject) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (existingProject.candidate_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, githubUrl, youtubeUrl, category, tags, public: isPublic } = body;

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const { data: project, error } = await supabase
    .from('projects')
    .update({
      title,
      description,
      github_url: githubUrl,
      youtube_url: youtubeUrl,
      category,
      tags,
      public: isPublic ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('*')
    .single();

  if (error || !project) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update project' },
      { status: 500 }
    );
  }

  return NextResponse.json(project);
}

// DELETE: Delete a project
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Check if user owns the project
  const { data: existingProject, error: fetchError } = await supabase
    .from('projects')
    .select('candidate_id')
    .eq('id', params.id)
    .single();

  if (fetchError || !existingProject) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (existingProject.candidate_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { error } = await supabase.from('projects').delete().eq('id', params.id);

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete project' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
