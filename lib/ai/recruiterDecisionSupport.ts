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

function isFrenchLocale(locale: string | null | undefined) {
  return locale === 'fr';
}

export function buildRecruiterTemplateMessage(input: {
  applicantName: string;
  jobTitle: string;
  companyName?: string | null;
  purpose: RecruiterMessagePurpose;
  locale?: 'en' | 'fr' | null;
}) {
  const useFrench = isFrenchLocale(input.locale);
  const firstName = getFirstName(input.applicantName);
  const companyName = input.companyName?.trim() || (useFrench ? 'notre equipe' : 'our team');

  switch (input.purpose) {
    case 'phone_screen':
      return useFrench
        ? `Bonjour ${firstName}, merci d'avoir postule au poste ${input.jobTitle}. Nous souhaitons organiser un court entretien telephonique avec ${companyName}. Merci de nous communiquer vos disponibilites.`
        : `Hi ${firstName}, thank you for applying for the ${input.jobTitle} role. We would like to schedule a short phone screening with ${companyName}. Please reply with your availability.`;
    case 'interview':
      return useFrench
        ? `Bonjour ${firstName}, vous avez ete preselectionne pour le poste ${input.jobTitle}. Nous souhaitons vous faire passer a l'etape entretien. Merci de repondre afin que nous puissions confirmer l'heure de l'entretien.`
        : `Hi ${firstName}, you have been shortlisted for the ${input.jobTitle} role. We would like to move you to the interview stage. Please reply so we can confirm the interview time.`;
    case 'document_request':
      return useFrench
        ? `Bonjour ${firstName}, merci pour votre candidature au poste ${input.jobTitle}. Merci d'envoyer tout CV mis a jour, portfolio ou document complementaire pouvant nous aider a poursuivre notre evaluation.`
        : `Hi ${firstName}, thank you for your application for the ${input.jobTitle} role. Please send any updated CV, portfolio, or supporting document that can help us continue your review.`;
    case 'rejection':
      return useFrench
        ? `Bonjour ${firstName}, merci d'avoir postule au poste ${input.jobTitle}. Apres examen, nous ne poursuivrons pas votre candidature a ce stade. Nous vous remercions pour l'interet porte a ${companyName}.`
        : `Hi ${firstName}, thank you for applying for the ${input.jobTitle} role. After review, we will not be moving forward with your application at this time. We appreciate your interest in ${companyName}.`;
    case 'initial_contact':
    default:
      return useFrench
        ? `Bonjour ${firstName}, merci d'avoir postule au poste ${input.jobTitle}. Nous examinons votre candidature et souhaitons poursuivre la conversation ici sur JobLinca.`
        : `Hi ${firstName}, thank you for applying for the ${input.jobTitle} role. We are reviewing your application and would like to continue the conversation here on JobLinca.`;
  }
}

export function getRecruiterDecisionSupport(
  input: RecruiterDecisionSupportInput & { locale?: 'en' | 'fr' | null }
): RecruiterDecisionSupportSummary {
  const useFrench = isFrenchLocale(input.locale);
  const score = typeof input.matchScore === 'number' ? input.matchScore : null;
  const hasBlockingEligibility = input.eligibilityStatus === 'ineligible';
  const hasNeedsReviewEligibility = input.eligibilityStatus === 'needs_review';
  const alreadyClosed =
    input.decisionStatus === 'hired' || input.decisionStatus === 'rejected';

  if (alreadyClosed) {
    const purpose = input.decisionStatus === 'hired' ? 'interview' : 'rejection';

    return {
      fitLabel:
        input.decisionStatus === 'hired'
          ? useFrench
            ? 'Decision fermee'
            : 'Decision closed'
          : useFrench
            ? 'Decision enregistree'
            : 'Decision recorded',
      fitTone: 'slate',
      headline:
        input.decisionStatus === 'hired'
          ? useFrench
            ? 'Cette candidature est deja marquee comme retenue.'
            : 'This application is already marked as hired.'
          : useFrench
            ? 'Cette candidature a deja une decision finale de rejet.'
            : 'This application already has a final rejection decision.',
      recommendedAction:
        input.decisionStatus === 'hired'
          ? useFrench
            ? 'Utilisez la messagerie uniquement pour l integration ou la logistique.'
            : 'Use messaging only for onboarding or logistics.'
          : useFrench
            ? 'Utilisez la messagerie uniquement si vous souhaitez envoyer un suivi courtois.'
            : 'Use messaging only if you want to send a polite follow-up.',
      recommendedPurpose: purpose,
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose,
        locale: input.locale,
      }),
    };
  }

  if (hasBlockingEligibility || (score !== null && score < 45)) {
    return {
      fitLabel: useFrench ? 'Faible adequation' : 'Low fit',
      fitTone: 'red',
      headline:
        useFrench
          ? "La candidature semble trop faible pour avancer immediatement selon les elements disponibles."
          : 'The application looks weak for immediate progression based on the available evidence.',
      recommendedAction: useFrench
        ? 'Rejetez la candidature, ou gardez-la en attente seulement si le poste est tres difficile a pourvoir.'
        : 'Reject, or keep on hold only if the role is very hard to fill.',
      recommendedPurpose: 'rejection',
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose: 'rejection',
        locale: input.locale,
      }),
    };
  }

  if (score !== null && score >= 80 && !hasNeedsReviewEligibility) {
    return {
      fitLabel: useFrench ? 'Forte adequation' : 'Strong fit',
      fitTone: 'emerald',
      headline: useFrench
        ? 'Ce candidat semble pret pour une progression rapide.'
        : 'This candidate looks ready for fast progression.',
      recommendedAction: useFrench
        ? "Preselectionnez maintenant et envoyez aujourd'hui un message d'entretien ou de prequalification telephonique."
        : 'Shortlist now and send an interview or phone-screen message today.',
      recommendedPurpose: 'interview',
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose: 'interview',
        locale: input.locale,
      }),
    };
  }

  if (score !== null && score >= 65) {
    return {
      fitLabel: useFrench ? 'Profil prometteur' : 'Promising fit',
      fitTone: 'amber',
      headline: useFrench
        ? "Le profil merite d'etre poursuivi, mais une etape de prequalification rapide reste preferable."
        : 'The profile looks worth pursuing, but a quick screening step is safer.',
      recommendedAction: useFrench
        ? 'Contactez le candidat et effectuez un bref entretien telephonique avant la preselection finale.'
        : 'Contact the candidate and run a short phone screen before final shortlisting.',
      recommendedPurpose: 'phone_screen',
      suggestedMessage: buildRecruiterTemplateMessage({
        applicantName: input.applicantName,
        jobTitle: input.jobTitle,
        companyName: input.companyName,
        purpose: 'phone_screen',
        locale: input.locale,
      }),
    };
  }

  return {
    fitLabel: hasNeedsReviewEligibility
      ? useFrench
        ? 'A revoir'
        : 'Needs review'
      : useFrench
        ? 'Adequation limite'
        : 'Borderline fit',
    fitTone: 'amber',
    headline: useFrench
      ? 'La candidature doit etre clarifiee avant une decision finale.'
      : 'The application needs clarification before you make a final decision.',
    recommendedAction: useFrench
      ? 'Demandez d abord un CV mis a jour, un portfolio ou une breve reponse de clarification.'
      : 'Ask for an updated CV, portfolio, or a short clarifying response first.',
    recommendedPurpose: 'document_request',
    suggestedMessage: buildRecruiterTemplateMessage({
      applicantName: input.applicantName,
      jobTitle: input.jobTitle,
      companyName: input.companyName,
      purpose: 'document_request',
      locale: input.locale,
    }),
  };
}
