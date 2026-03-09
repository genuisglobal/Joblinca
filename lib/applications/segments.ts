import {
  getOpportunityTypeLabel,
  opportunityBrowseCategoryFor,
} from '@/lib/opportunities';

export interface AnalyticsSegmentDescriptor {
  key: string;
  label: string;
}

export function getApplicationChannelSegment(
  value: string | null | undefined
): AnalyticsSegmentDescriptor {
  switch (value) {
    case 'managed_whatsapp':
    case 'whatsapp':
      return { key: 'whatsapp', label: 'WhatsApp' };
    case 'managed_email':
      return { key: 'email', label: 'Email' };
    case 'external_redirect':
      return { key: 'external', label: 'External' };
    case 'api':
      return { key: 'api', label: 'API' };
    case 'dashboard_quick_apply':
    case 'native_apply':
    case null:
    case undefined:
    case '':
      return { key: 'native', label: 'Native' };
    default:
      return { key: 'other', label: 'Other' };
  }
}

export function getOpportunityAnalyticsSegment(
  jobType: string | null | undefined,
  internshipTrack: string | null | undefined
): AnalyticsSegmentDescriptor {
  const key = opportunityBrowseCategoryFor(jobType, internshipTrack);
  return {
    key,
    label: getOpportunityTypeLabel(jobType, internshipTrack),
  };
}
