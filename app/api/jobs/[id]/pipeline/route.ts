import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  loadJobPipelineBundle,
  requireAuthenticatedUser,
  requireRecruiterOwnedJob,
} from '@/lib/hiring-pipeline/server';
import { validatePipelineStageOrder } from '@/lib/hiring-pipeline/validation';

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedJob(params.id, user.id);
    const bundle = await loadJobPipelineBundle(params.id);

    return NextResponse.json(bundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load hiring pipeline';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Job not found'
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedJob(params.id, user.id);

    const body = await request.json();
    const bundle = await loadJobPipelineBundle(params.id);
    const db = createServiceSupabaseClient();

    if (typeof body.name === 'string' && body.name.trim()) {
      const { error } = await db
        .from('job_hiring_pipelines')
        .update({
          name: body.name.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bundle.pipeline.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (Array.isArray(body.stages) && body.stages.length > 0) {
      const stageIds = new Set(bundle.pipeline.stages.map((stage) => stage.id));
      const updates: Array<{ id: string; patch: Record<string, unknown> }> = body.stages
        .filter((stage: unknown) => !!stage && typeof stage === 'object')
        .map((stage: any) => {
          if (typeof stage.id !== 'string' || !stageIds.has(stage.id)) {
            throw new Error('Invalid stage update payload');
          }

          const patch: Record<string, unknown> = {};
          if (typeof stage.label === 'string' && stage.label.trim()) {
            patch.label = stage.label.trim();
          }
          if (typeof stage.orderIndex === 'number' && Number.isInteger(stage.orderIndex)) {
            patch.order_index = stage.orderIndex;
          }
          if (typeof stage.scoreWeight === 'number' && Number.isFinite(stage.scoreWeight)) {
            patch.score_weight = stage.scoreWeight;
          }
          if (typeof stage.isTerminal === 'boolean') {
            patch.is_terminal = stage.isTerminal;
          }
          if (typeof stage.allowsFeedback === 'boolean') {
            patch.allows_feedback = stage.allowsFeedback;
          }
          if (stage.config && typeof stage.config === 'object' && !Array.isArray(stage.config)) {
            patch.config = stage.config;
          }

          return { id: stage.id, patch };
        })
        .filter((item: { id: string; patch: Record<string, unknown> }) => {
          return Object.keys(item.patch).length > 0;
        });

      const projectedStages = bundle.pipeline.stages
        .map((stage) => {
          const update = updates.find((item) => item.id === stage.id);

          return {
            id: stage.id,
            label:
              typeof update?.patch.label === 'string' ? update.patch.label : stage.label,
            stageType: stage.stageType,
            isTerminal: stage.isTerminal,
            orderIndex:
              typeof update?.patch.order_index === 'number'
                ? (update.patch.order_index as number)
                : stage.orderIndex,
          };
        })
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const validation = validatePipelineStageOrder(projectedStages);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.message || 'Invalid pipeline stage ordering' },
          { status: 400 }
        );
      }

      const reorderedStages = updates.filter((update) => {
        return typeof update.patch.order_index === 'number';
      });

      for (const [index, update] of reorderedStages.entries()) {
        const { error } = await db
          .from('job_hiring_pipeline_stages')
          .update({
            order_index: 1000 + index,
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id)
          .eq('job_pipeline_id', bundle.pipeline.id);

        if (error) {
          throw new Error(error.message);
        }
      }

      for (const update of updates) {
        const { error } = await db
          .from('job_hiring_pipeline_stages')
          .update({
            ...update.patch,
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id)
          .eq('job_pipeline_id', bundle.pipeline.id);

        if (error) {
          throw new Error(error.message);
        }
      }
    }

    if (body.requirements && typeof body.requirements === 'object') {
      const requirements = body.requirements as Record<string, unknown>;
      const { error } = await db
        .from('job_hiring_requirements')
        .upsert(
          {
            job_id: params.id,
            must_have_skills: normalizeStringArray(requirements.mustHaveSkills),
            nice_to_have_skills: normalizeStringArray(requirements.niceToHaveSkills),
            required_languages: normalizeStringArray(requirements.requiredLanguages),
            education_requirements: normalizeStringArray(requirements.educationRequirements),
            min_years_experience:
              typeof requirements.minYearsExperience === 'number' &&
              Number.isFinite(requirements.minYearsExperience)
                ? requirements.minYearsExperience
                : null,
            location_rules: normalizeObject(requirements.locationRules),
            screening_rules: normalizeObject(requirements.screeningRules),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'job_id',
          }
        );

      if (error) {
        throw new Error(error.message);
      }
    }

    const updatedBundle = await loadJobPipelineBundle(params.id);
    return NextResponse.json(updatedBundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update hiring pipeline';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Job not found'
            ? 404
            : message === 'Invalid stage update payload'
              ? 400
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
