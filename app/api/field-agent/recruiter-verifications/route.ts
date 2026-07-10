import { NextRequest, NextResponse } from 'next/server';
import { requireFieldAgent } from '@/lib/field-registration/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  FIELD_OFFICER_RECOMMENDATIONS,
  type FieldOfficerRecommendation,
  submitRecruiterVerification,
} from '@/lib/recruiter-verifications/service';

export async function POST(request: NextRequest) {
  try {
    const fieldAgent = await requireFieldAgent();
    const serviceClient = createServiceSupabaseClient();
    const formData = await request.formData();

    const recruiterUserId = String(formData.get('recruiterUserId') || '').trim();
    const idDocument = formData.get('idDocument') as File | null;
    const selfie = formData.get('selfie') as File | null;
    const businessRegistration = formData.get('businessRegistration') as File | null;
    const companyNameSnapshot = String(formData.get('companyNameSnapshot') || '').trim();
    const officeLocation = String(formData.get('officeLocation') || '').trim();
    const employerReference = String(formData.get('employerReference') || '').trim();
    const fieldVisitNotes = String(formData.get('fieldVisitNotes') || '').trim();
    const fieldOfficerRecommendation = String(
      formData.get('fieldOfficerRecommendation') || ''
    ).trim();
    const parsedRecommendation =
      fieldOfficerRecommendation &&
      FIELD_OFFICER_RECOMMENDATIONS.includes(
        fieldOfficerRecommendation as FieldOfficerRecommendation
      )
        ? (fieldOfficerRecommendation as FieldOfficerRecommendation)
        : null;

    if (!recruiterUserId) {
      return NextResponse.json(
        { error: 'Recruiter account is required' },
        { status: 400 }
      );
    }

    await submitRecruiterVerification(serviceClient, {
      recruiterUserId,
      actorUserId: fieldAgent.userId,
      source: 'field_agent',
      idDocument,
      selfie,
      businessRegistration,
      employerReference,
      companyNameSnapshot,
      officeLocation,
      fieldVisitNotes,
      fieldOfficerRecommendation: parsedRecommendation,
      submittedByOfficerUserId: fieldAgent.userId,
      officerCodeSnapshot: fieldAgent.officerCode,
    });

    return NextResponse.json({
      success: true,
      status: 'pending',
      message:
        'Recruiter verification intake submitted. Operations can now review it in the admin queue.',
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to submit recruiter verification intake';
    const status =
      message === 'Authentication required'
        ? 401
        : message.includes('Field agent')
          ? 403
          : message.includes('required') || message.includes('Invalid')
            ? 400
            : message.includes('not found') ||
                message.includes('only submit verification for recruiters attributed')
              ? 404
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
