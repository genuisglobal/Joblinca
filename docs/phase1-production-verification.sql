-- Phase 1 production verification script
-- Run after migrations and before go-live.

-- 1. Core ATS backfills
select
  'non_draft_missing_current_stage' as check_name,
  count(*)::bigint as failing_rows
from public.applications
where coalesce(is_draft, false) = false
  and current_stage_id is null;

select
  'missing_application_channel' as check_name,
  count(*)::bigint as failing_rows
from public.applications
where application_channel is null;

select
  'missing_applicant_role' as check_name,
  count(*)::bigint as failing_rows
from public.applications
where applicant_role is null;

select
  'missing_eligibility_status_on_submitted' as check_name,
  count(*)::bigint as failing_rows
from public.applications
where coalesce(is_draft, false) = false
  and eligibility_status is null;

-- 2. Opportunity metadata integrity
select
  'internships_missing_track' as check_name,
  count(*)::bigint as failing_rows
from public.jobs
where job_type = 'internship'
  and coalesce(internship_track::text, 'unspecified') = 'unspecified';

select
  'education_internships_not_talent_only_roles' as check_name,
  count(*)::bigint as failing_rows
from public.jobs
where job_type = 'internship'
  and internship_track::text = 'education'
  and (
    eligible_roles is null
    or array_length(eligible_roles, 1) <> 1
    or not ('talent'::public.role_enum = any(eligible_roles))
  );

select
  'internships_missing_requirements_row' as check_name,
  count(*)::bigint as failing_rows
from public.jobs j
left join public.job_internship_requirements jir
  on jir.job_id = j.id
where j.job_type = 'internship'
  and j.internship_track::text in ('education', 'professional')
  and jir.job_id is null;

-- 3. Pipeline integrity
select
  'live_jobs_missing_pipeline' as check_name,
  count(*)::bigint as failing_rows
from public.jobs j
left join public.job_hiring_pipelines p
  on p.job_id = j.id
where j.published = true
  and coalesce(j.approval_status, 'approved') = 'approved'
  and p.id is null;

select
  'live_jobs_with_no_pipeline_stages' as check_name,
  count(*)::bigint as failing_rows
from public.job_hiring_pipelines p
left join public.job_hiring_pipeline_stages s
  on s.job_pipeline_id = p.id
group by p.id
having count(s.id) = 0;

-- 4. Ranking and match reasoning
select
  'submitted_apps_missing_ranking_breakdown' as check_name,
  count(*)::bigint as failing_rows
from public.applications
where coalesce(is_draft, false) = false
  and ranking_breakdown is null;

select
  'recent_match_notifications_missing_reason_signals' as check_name,
  count(*)::bigint as failing_rows
from public.job_match_notifications
where created_at >= now() - interval '30 days'
  and coalesce(jsonb_array_length(match_reason_signals), 0) = 0;

-- 5. Operational spot checks
select application_channel, count(*)::bigint as total
from public.applications
group by application_channel
order by total desc;

select
  coalesce(job_type::text, 'unknown') as job_type,
  coalesce(internship_track::text, 'unspecified') as internship_track,
  count(*)::bigint as total
from public.jobs
group by 1, 2
order by total desc;

select
  decision_status,
  eligibility_status,
  count(*)::bigint as total
from public.applications
group by decision_status, eligibility_status
order by total desc;

-- 6. Sample recent rows for manual inspection
select
  id,
  job_id,
  applicant_id,
  status,
  is_draft,
  current_stage_id,
  decision_status,
  eligibility_status,
  application_channel,
  created_at
from public.applications
order by created_at desc
limit 25;

select
  id,
  job_id,
  candidate_user_id,
  channel,
  status,
  score,
  created_at
from public.job_match_notifications
order by created_at desc
limit 25;
