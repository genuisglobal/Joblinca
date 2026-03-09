import type { InternshipRequirementsInput, NormalizedOpportunityConfiguration } from './opportunities';

type SupabaseLikeClient = {
  from: (table: string) => {
    select: (query: string) => any;
    upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => any;
    delete: () => any;
  };
};

function requirementsRowFromInput(
  jobId: string,
  internshipTrack: string,
  requirements: InternshipRequirementsInput | null
) {
  if (!requirements) {
    return null;
  }

  return {
    job_id: jobId,
    internship_track: internshipTrack,
    school_required: requirements.schoolRequired ?? false,
    allowed_schools: requirements.allowedSchools || [],
    allowed_fields_of_study: requirements.allowedFieldsOfStudy || [],
    allowed_school_years: requirements.allowedSchoolYears || [],
    graduation_year_min: requirements.graduationYearMin ?? null,
    graduation_year_max: requirements.graduationYearMax ?? null,
    credit_bearing: requirements.creditBearing ?? false,
    requires_school_convention: requirements.requiresSchoolConvention ?? false,
    academic_calendar: requirements.academicCalendar ?? null,
    academic_supervisor_required: requirements.academicSupervisorRequired ?? false,
    portfolio_required: requirements.portfolioRequired ?? false,
    minimum_project_count: requirements.minimumProjectCount ?? null,
    minimum_badge_count: requirements.minimumBadgeCount ?? null,
    conversion_possible: requirements.conversionPossible ?? false,
    expected_weekly_availability: requirements.expectedWeeklyAvailability ?? null,
    stipend_type: requirements.stipendType ?? null,
    notes: requirements.notes || {},
  };
}

export async function persistJobOpportunityMetadata(
  client: SupabaseLikeClient,
  jobId: string,
  config: NormalizedOpportunityConfiguration
) {
  if (config.jobType !== 'internship' || !config.internshipRequirements) {
    const { error } = await client
      .from('job_internship_requirements')
      .delete()
      .eq('job_id', jobId);

    return { error };
  }

  const row = requirementsRowFromInput(
    jobId,
    config.internshipTrack,
    config.internshipRequirements
  );

  const { error } = await client
    .from('job_internship_requirements')
    .upsert(row || {}, { onConflict: 'job_id' });

  return { error };
}

export async function loadJobOpportunityMetadata(
  client: SupabaseLikeClient,
  jobId: string
) {
  const { data, error } = await client
    .from('job_internship_requirements')
    .select(
      `
      job_id,
      internship_track,
      school_required,
      allowed_schools,
      allowed_fields_of_study,
      allowed_school_years,
      graduation_year_min,
      graduation_year_max,
      credit_bearing,
      requires_school_convention,
      academic_calendar,
      academic_supervisor_required,
      portfolio_required,
      minimum_project_count,
      minimum_badge_count,
      conversion_possible,
      expected_weekly_availability,
      stipend_type,
      notes
    `
    )
    .eq('job_id', jobId)
    .maybeSingle();

  if (error || !data) {
    return {
      data: null,
      error,
    };
  }

  return {
    data: {
      internshipTrack: data.internship_track,
      schoolRequired: data.school_required,
      allowedSchools: data.allowed_schools || [],
      allowedFieldsOfStudy: data.allowed_fields_of_study || [],
      allowedSchoolYears: data.allowed_school_years || [],
      graduationYearMin: data.graduation_year_min,
      graduationYearMax: data.graduation_year_max,
      creditBearing: data.credit_bearing,
      requiresSchoolConvention: data.requires_school_convention,
      academicCalendar: data.academic_calendar,
      academicSupervisorRequired: data.academic_supervisor_required,
      portfolioRequired: data.portfolio_required,
      minimumProjectCount: data.minimum_project_count,
      minimumBadgeCount: data.minimum_badge_count,
      conversionPossible: data.conversion_possible,
      expectedWeeklyAvailability: data.expected_weekly_availability,
      stipendType: data.stipend_type,
      notes: data.notes || {},
    },
    error: null,
  };
}
