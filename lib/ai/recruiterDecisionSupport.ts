export type RecruiterMessagePurpose =
  | 'initial_contact'
  | 'phone_screen'
  | 'interview'
  | 'document_request'
  | 'rejection';

export interface RecruiterDecisionSupportInput {
  applicantName: string;
  jobTitle: string;
  companyName?: string | null;
  matchScore?: number | null;
  strengths?: string[] | null;
  gaps?: string[] | null;
  eligibilityStatus?: 'eligible' | 'needs_review' | 'ineligible' | null;
  decisionStatus?: string | null;
}

export interface RecruiterDecisionSupportSummary {
  fitLabel: string;
  fitTone: 'emerald' | 'amber' | 'red' | 'slate';
  headline: string;
  recommendedAction: string;
  recommendedPurpose: RecruiterMessagePurpose;
  suggestedMessage: string;
}

function getFirstName(name: string) {
  const compact = name.trim();
  if (!compact) {
    return 'there';
  }

  return compact.split(/\s+/)[0] || 'there';
}

export function buildRecruiterTemplateMessage(input: {
  applicantName: string;
  jobTitle: string;
  companyName?: string | null;
  purpose: RecruiterMessagePurpose;
}) {
  const firstName = getFirstName(input.applicantName);
  const companyName = input.companyName?.trim() || 'our team';

  switch (input.purpose) {
    case 'phone_screen':
      return `Hi ${firstName}, thank you for applying for the ${input.jobTitle} role. We would like to schedule a short phone screening with ${companyName}. Please reply with your availability.`;
    case 'interview':
      return `Hi ${firstName}, you have been shortlisted for the ${input.jobTitle} role. We would like to move you to the interview stage. Please reply so we can confirm the interview time.`;
    case 'document_request':
      return `Hi ${firstName}, thank you for your application for the ${input.jobTitle} role. Please send any updated CV, portfolio, or supporting document that can help us continue your review.`;
    case 'rejection':
      return `Hi ${firstName}, thank you for applying for the ${input.jobTitle} role. After review, we will not be moving forward with your application at this time. We appreciate your interest in ${companyName}.`;
    case 'initial_contact':
    default:
      return `Hi ${firstName}, thank you for applying for the ${input.jobTitle} role. We are reviewing your application and would like to continue the conversation here on JobLinca.`;
  }
}

export function getRecruiterDecisionSupport(
  input: RecruiterDecisionSupportInput
): RecruiterDecisionSupportSummary {
  const score = typeof input.matchScore === 'number' ? input.matchScore : null;
  const hasBlockingEligibility = input.eligibilityStatus === 'ineligible';
  const hasNeedsReviewEligibility = input.eligibilityStatus === 'needs_review';
  const alreadyClosed =
    input.decisionStatus === 'hired' || input.decisionStatus === 'rejected';

  if (alreadyClosed) {
    const purpose = input.decisionStatus === 'hired' ? 'interview' : 'rejection';

    return {
      fitLabel: input.decisionStatus === 'hired' ? 'Decision closed' : 'Decision recorded',
      fitTone: 'slate',
      headline:
        input.decisionStatus === 'hired'
          ? 'This application is already marked as hired.'
          : 'This application already has a final rejection decision.',
      recommendedAction:
        input.decisionStatus === 'hired'
          ? 'Use messaging only for onboarding or logistics.'
          : 'Use messaging only if you want to send a polite follow-up.',
      recommendedPurpose: purpose,
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose,
      }),
    };
  }

  if (hasBlockingEligibility || (score !== null && score < 45)) {
    return {
      fitLabel: 'Low fit',
      fitTone: 'red',
      headline:
        'The application looks weak for immediate progression based on the available evidence.',
      recommendedAction: 'Reject, or keep on hold only if the role is very hard to fill.',
      recommendedPurpose: 'rejection',
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose: 'rejection',
      }),
    };
  }

  if (score !== null && score >= 80 && !hasNeedsReviewEligibility) {
    return {
      fitLabel: 'Strong fit',
      fitTone: 'emerald',
      headline: 'This candidate looks ready for fast progression.',
      recommendedAction: 'Shortlist now and send an interview or phone-screen message today.',
      recommendedPurpose: 'interview',
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose: 'interview',
      }),
    };
  }

  if (score !== null && score >= 65) {
    return {
      fitLabel: 'Promising fit',
      fitTone: 'amber',
      headline: 'The profile looks worth pursuing, but a quick screening step is safer.',
      recommendedAction: 'Contact the candidate and run a short phone screen before final shortlisting.',
      recommendedPurpose: 'phone_screen',
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose: 'phone_screen',
      }),
    };
  }

  return {
    fitLabel: hasNeedsReviewEligibility ? 'Needs review' : 'Borderline fit',
    fitTone: 'amber',
    headline: 'The application needs clarification before you make a final decision.',
    recommendedAction: 'Ask for an updated CV, portfolio, or a short clarifying response first.',
    recommendedPurpose: 'document_request',
    suggestedMessage: buildRecruiterTemplateMessage({
      applicantName: input.applicantName,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      purpose: 'document_request',
    }),
  };
}
