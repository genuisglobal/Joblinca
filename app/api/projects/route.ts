import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// GET: list public projects
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('public', true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(projects);
}

// POST: create a new project
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const body = await request.json();
  const { title, description, githubUrl, youtubeUrl, category, tags, public: isPublic } = body;
  if (!title) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      candidate_id: user.id,
      title,
      description,
      github_url: githubUrl,
      youtube_url: youtubeUrl,
      category,
      tags,
      public: isPublic ?? true,
    })
    .select('*')
    .single();
  if (error || !project) {
    return NextResponse.json({ error: error?.message || 'Failed to create project' }, { status: 500 });
  }
  return NextResponse.json(project, { status: 201 });
}