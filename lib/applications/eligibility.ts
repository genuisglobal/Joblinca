import {
  canRoleApplyToOpportunity,
  normalizeInternshipTrack,
  normalizeOpportunityJobType,
  type InternshipRequirementsInput,
} from '../opportunities';

export type ApplicationEligibilityStatus = 'eligible' | 'needs_review' | 'ineligible';

export interface ApplicationEligibilityPreview {
  eligible: boolean;
  eligibilityStatus: ApplicationEligibilityStatus;
  blockingReasons: string[];
  missingProfileFields: string[];
  recommendedProfileUpdates: string[];
  matchedSignals: string[];
}

export interface ApplicationEligibilityJob {
  published: boolean;
  approvalStatus: string | null;
  closesAt?: string | null;
  jobType: string | null;
  internshipTrack: string | null;
  visibility: string | null;
  eligibleRoles: unknown;
}

export interface CandidateEligibilityContext {
  role: string | null;
  schoolName?: string | null;
  fieldOfStudy?: string | null;
  schoolYear?: string | null;
  graduationYear?: number | null;
  needsCredit?: boolean;
  hasSchoolConvention?: boolean;
  academicSupervisor?: string | null;
  portfolioUrl?: string | null;
  weeklyAvailability?: string | null;
  projectCount: number;
  badgeCount: number;
  resumeUrl?: string | null;
  phone?: string | null;
  email?: string | null;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAllowedText(
  value: string | null | undefined,
  allowedValues: string[] | undefined
): boolean {
  const normalizedValue = normalizeComparableText(value);
  if (!normalizedValue) {
    return false;
  }

  const allowed = (allowedValues || [])
    .map((item) => normalizeComparableText(item))
    .filter(Boolean);

  if (allowed.length === 0) {
    return true;
  }

  return allowed.some(
    (item) =>
      item === normalizedValue ||
      item.includes(normalizedValue) ||
      normalizedValue.includes(item)
  );
}

function addUnique(target: string[], message: string | null | undefined) {
  if (!message) {
    return;
  }

  if (!target.includes(message)) {
    target.push(message);
  }
}

function evaluateEducationInternship(
  requirements: InternshipRequirementsInput,
  context: CandidateEligibilityContext,
  preview: ApplicationEligibilityPreview
) {
  const schoolName = context.schoolName?.trim() || '';
  const fieldOfStudy = context.fieldOfStudy?.trim() || '';
  const schoolYear = context.schoolYear?.trim() || '';
  const graduationYear = context.graduationYear ?? null;

  if (requirements.schoolRequired && !schoolName) {
    addUnique(
      preview.blockingReasons,
      'School or institution is required for this educational internship.'
    );
  } else if ((requirements.allowedSchools || []).length > 0) {
    if (!schoolName) {
      addUnique(preview.missingProfileFields, 'School / institution');
    } else if (!matchesAllowedText(schoolName, requirements.allowedSchools)) {
      addUnique(
        preview.blockingReasons,
        'Your school does not match the target schools listed for this internship.'
      );
    } else {
      addUnique(preview.matchedSignals, `School match: ${schoolName}`);
    }
  }

  if ((requirements.allowedFieldsOfStudy || []).length > 0) {
    if (!fieldOfStudy) {
      addUnique(preview.missingProfileFields, 'Field of study');
    } else if (!matchesAllowedText(fieldOfStudy, requirements.allowedFieldsOfStudy)) {
      addUnique(
        preview.blockingReasons,
        'Your field of study does not match the academic disciplines requested for this internship.'
      );
    } else {
      addUnique(preview.matchedSignals, `Field of study match: ${fieldOfStudy}`);
    }
  }

  if ((requirements.allowedSchoolYears || []).length > 0) {
    if (!schoolYear) {
      addUnique(preview.missingProfileFields, 'School year / level');
    } else if (!matchesAllowedText(schoolYear, requirements.allowedSchoolYears)) {
      addUnique(
        preview.blockingReasons,
        'Your school year does not match the required level for this internship.'
      );
    } else {
      addUnique(preview.matchedSignals, `School year match: ${schoolYear}`);
    }
  }

  if (
    requirements.graduationYearMin !== null &&
    requirements.graduationYearMin !== undefined
  ) {
    if (graduationYear === null || Number.isNaN(graduationYear)) {
      addUnique(preview.missingProfileFields, 'Graduation year');
    } else if (graduationYear < requirements.graduationYearMin) {
      addUnique(
        preview.blockingReasons,
        `Graduation year must be ${requirements.graduationYearMin} or later for this internship.`
      );
    } else {
      addUnique(preview.matchedSignals, `Graduation year meets minimum: ${graduationYear}`);
    }
  }

  if (
    requirements.graduationYearMax !== null &&
    requirements.graduationYearMax !== undefined &&
    graduationYear !== null &&
    !Number.isNaN(graduationYear)
  ) {
    if (graduationYear > requirements.graduationYearMax) {
      addUnique(
        preview.blockingReasons,
        `Graduation year must be ${requirements.graduationYearMax} or earlier for this internship.`
      );
    } else {
      addUnique(preview.matchedSignals, `Graduation year within range: ${graduationYear}`);
    }
  }

  if (requirements.requiresSchoolConvention && !context.hasSchoolConvention) {
    addUnique(
      preview.blockingReasons,
      'A school convention is required for this educational internship.'
    );
  } else if (requirements.requiresSchoolConvention && context.hasSchoolConvention) {
    addUnique(preview.matchedSignals, 'School convention available');
  }

  if (requirements.academicSupervisorRequired && !context.academicSupervisor?.trim()) {
    addUnique(
      preview.blockingReasons,
      'An academic supervisor is required for this educational internship.'
    );
  } else if (requirements.academicSupervisorRequired && context.academicSupervisor?.trim()) {
    addUnique(preview.matchedSignals, 'Academic supervisor provided');
  }

  if (requirements.creditBearing && context.needsCredit) {
    addUnique(preview.matchedSignals, 'Credit-bearing placement requested');
  }
}

function evaluateProfessionalInternship(
  requirements: InternshipRequirementsInput,
  context: CandidateEligibilityContext,
  preview: ApplicationEligibilityPreview
) {
  const portfolioUrl = context.portfolioUrl?.trim() || '';
  const weeklyAvailability = context.weeklyAvailability?.trim() || '';
  const fieldOfStudy = context.fieldOfStudy?.trim() || '';

  if (requirements.portfolioRequired && !portfolioUrl) {
    addUnique(
      preview.blockingReasons,
      'A portfolio or work sample is required for this professional internship.'
    );
  } else if (portfolioUrl) {
    addUnique(preview.matchedSignals, 'Portfolio provided');
  }

  if (
    requirements.minimumProjectCount !== null &&
    requirements.minimumProjectCount !== undefined
  ) {
    if (context.projectCount < requirements.minimumProjectCount) {
      addUnique(
        preview.recommendedProfileUpdates,
        `Add ${requirements.minimumProjectCount - context.projectCount} more project(s) to reach the preferred project threshold.`
      );
    } else {
      addUnique(preview.matchedSignals, `Project count meets threshold: ${context.projectCount}`);
    }
  }

  if (
    requirements.minimumBadgeCount !== null &&
    requirements.minimumBadgeCount !== undefined
  ) {
    if (context.badgeCount < requirements.minimumBadgeCount) {
      addUnique(
        preview.recommendedProfileUpdates,
        `Add ${requirements.minimumBadgeCount - context.badgeCount} more badge(s) to reach the preferred badge threshold.`
      );
    } else {
      addUnique(preview.matchedSignals, `Badge count meets threshold: ${context.badgeCount}`);
    }
  }

  if (requirements.expectedWeeklyAvailability && !weeklyAvailability) {
    addUnique(preview.missingProfileFields, 'Weekly availability');
  } else if (weeklyAvailability) {
    addUnique(preview.matchedSignals, `Availability provided: ${weeklyAvailability}`);
  }

  if ((requirements.allowedFieldsOfStudy || []).length > 0 && fieldOfStudy) {
    if (matchesAllowedText(fieldOfStudy, requirements.allowedFieldsOfStudy)) {
      addUnique(preview.matchedSignals, `Field of study aligned: ${fieldOfStudy}`);
    } else {
      addUnique(
        preview.recommendedProfileUpdates,
        'This role prefers a different field of study than the one currently on your profile.'
      );
    }
  }
}

export function evaluateApplicationEligibility(input: {
  job: ApplicationEligibilityJob;
  requirements: InternshipRequirementsInput | null;
  context: CandidateEligibilityContext;
}): ApplicationEligibilityPreview {
  const preview: ApplicationEligibilityPreview = {
    eligible: true,
    eligibilityStatus: 'eligible',
    blockingReasons: [],
    missingProfileFields: [],
    recommendedProfileUpdates: [],
    matchedSignals: [],
  };

  const normalizedJobType = normalizeOpportunityJobType(input.job.jobType);
  const normalizedTrack = normalizeInternshipTrack(
    normalizedJobType,
    input.job.internshipTrack
  );

  if (!input.job.published) {
    addUnique(preview.blockingReasons, 'This opportunity is not currently accepting applications.');
  }

  if (input.job.approvalStatus && input.job.approvalStatus !== 'approved') {
    addUnique(preview.blockingReasons, 'This opportunity is not currently accepting applications.');
  }

  if (input.job.closesAt && new Date(input.job.closesAt) <= new Date()) {
    addUnique(preview.blockingReasons, 'This opportunity is no longer accepting applications.');
  }

  if (
    !canRoleApplyToOpportunity(
      input.context.role,
      input.job.eligibleRoles,
      input.job.jobType,
      input.job.internshipTrack,
      input.job.visibility
    )
  ) {
    addUnique(
      preview.blockingReasons,
      'Your current profile type is not eligible for this opportunity.'
    );
  }

  if (!input.context.phone?.trim()) {
    addUnique(preview.missingProfileFields, 'Phone number');
  }

  if (!input.context.email?.trim()) {
    addUnique(preview.missingProfileFields, 'Email address');
  }

  if (!input.context.resumeUrl?.trim()) {
    addUnique(
      preview.recommendedProfileUpdates,
      'Upload a resume to improve screening and recruiter review quality.'
    );
  }

  if (normalizedJobType === 'internship' && normalizedTrack === 'education' && input.requirements) {
    evaluateEducationInternship(input.requirements, input.context, preview);
  }

  if (
    normalizedJobType === 'internship' &&
    normalizedTrack === 'professional' &&
    input.requirements
  ) {
    evaluateProfessionalInternship(input.requirements, input.context, preview);
  }

  if (preview.blockingReasons.length > 0) {
    preview.eligible = false;
    preview.eligibilityStatus = 'ineligible';
    return preview;
  }

  if (
    preview.missingProfileFields.length > 0 ||
    preview.recommendedProfileUpdates.length > 0
  ) {
    preview.eligibilityStatus = 'needs_review';
  }

  return preview;
}
