type DatabaseClient = {
  from: (table: string) => any;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: ArrayBuffer,
        options?: { contentType?: string; upsert?: boolean }
      ) => Promise<{ error: { message?: string } | null }>;
      remove: (paths: string[]) => Promise<{ error: { message?: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

export const VERIFICATION_SUBMISSION_SOURCES = [
  'self_service',
  'field_agent',
] as const;
export type VerificationSubmissionSource =
  (typeof VERIFICATION_SUBMISSION_SOURCES)[number];

export const FIELD_OFFICER_RECOMMENDATIONS = [
  'approve',
  'needs_review',
  'reject',
] as const;
export type FieldOfficerRecommendation =
  (typeof FIELD_OFFICER_RECOMMENDATIONS)[number];

export interface RecruiterVerificationFileInput {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface AttributedRecruiterForOfficer {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  contactEmail: string | null;
  verificationStatus: string;
  latestVerificationStatus: string | null;
  latestSubmissionSource: VerificationSubmissionSource | null;
  attributedAt: string;
}

interface SubmitRecruiterVerificationInput {
  recruiterUserId: string;
  actorUserId: string;
  source: VerificationSubmissionSource;
  idDocument: RecruiterVerificationFileInput | null;
  selfie: RecruiterVerificationFileInput | null;
  businessRegistration?: RecruiterVerificationFileInput | null;
  employerReference?: string | null;
  companyNameSnapshot?: string | null;
  officeLocation?: string | null;
  fieldVisitNotes?: string | null;
  fieldOfficerRecommendation?: FieldOfficerRecommendation | null;
  submittedByOfficerUserId?: string | null;
  officerCodeSnapshot?: string | null;
}

function sanitizeRequiredText(value: string, fieldLabel: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    throw new Error(`${fieldLabel} is required`);
  }
  return compact;
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact || null;
}

function sanitizeOptionalEmail(value: string | null | undefined): string | null {
  const compact = sanitizeOptionalText(value);
  return compact ? compact.toLowerCase() : null;
}

function isSubmissionSource(value: string): value is VerificationSubmissionSource {
  return VERIFICATION_SUBMISSION_SOURCES.includes(
    value as VerificationSubmissionSource
  );
}

function isFieldOfficerRecommendation(
  value: string
): value is FieldOfficerRecommendation {
  return FIELD_OFFICER_RECOMMENDATIONS.includes(
    value as FieldOfficerRecommendation
  );
}

function validateFile(
  file: RecruiterVerificationFileInput | null,
  options: {
    fieldLabel: string;
    required: boolean;
    allowedTypes: string[];
    maxBytes?: number;
  }
): RecruiterVerificationFileInput | null {
  if (!file) {
    if (options.required) {
      throw new Error(`${options.fieldLabel} is required`);
    }
    return null;
  }

  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(
      `${options.fieldLabel} file is too large. Maximum size is 5MB.`
    );
  }

  if (!options.allowedTypes.includes(file.type)) {
    throw new Error(
      `Invalid ${options.fieldLabel.toLowerCase()} format.`
    );
  }

  return file;
}

function buildUploadPath(
  recruiterUserId: string,
  label: 'id-document' | 'selfie' | 'business-registration',
  fileName: string,
  fallbackExtension: string
): string {
  const extension = fileName.split('.').pop() || fallbackExtension;
  return `verifications/${recruiterUserId}/${label}-${Date.now()}.${extension}`;
}

async function uploadVerificationFile(
  db: DatabaseClient,
  recruiterUserId: string,
  label: 'id-document' | 'selfie' | 'business-registration',
  file: RecruiterVerificationFileInput,
  fallbackExtension: string
): Promise<{ publicUrl: string; storagePath: string }> {
  const storagePath = buildUploadPath(
    recruiterUserId,
    label,
    file.name,
    fallbackExtension
  );
  const buffer = await file.arrayBuffer();

  const { error } = await db.storage.from('documents').upload(storagePath, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    throw new Error(
      error.message || `Failed to upload ${label.replace(/-/g, ' ')}`
    );
  }

  const { data } = db.storage.from('documents').getPublicUrl(storagePath);
  return {
    publicUrl: data.publicUrl,
    storagePath,
  };
}

export async function listAttributedRecruitersForOfficer(
  db: DatabaseClient,
  officerUserId: string,
  limit = 12
): Promise<AttributedRecruiterForOfficer[]> {
  const { data: attributions, error: attributionError } = await db
    .from('registration_attributions')
    .select('user_id, created_at')
    .eq('officer_user_id', officerUserId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(limit * 3);

  if (attributionError) {
    throw new Error(
      attributionError.message || 'Failed to load attributed recruiters'
    );
  }

  const attributionRows = (attributions || []) as Array<{
    user_id: string;
    created_at: string;
  }>;
  const userIds = Array.from(
    new Set(attributionRows.map((row) => row.user_id).filter(Boolean))
  );

  if (userIds.length === 0) {
    return [];
  }

  const [{ data: profiles, error: profilesError }, { data: recruiters, error: recruitersError }, { data: verifications, error: verificationsError }] =
    await Promise.all([
      db
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, phone, role')
        .in('id', userIds),
      db
        .from('recruiter_profiles')
        .select('user_id, company_name, contact_email, verification_status')
        .in('user_id', userIds),
      db
        .from('verifications')
        .select('user_id, status, submission_source, updated_at')
        .in('user_id', userIds)
        .order('updated_at', { ascending: false }),
    ]);

  if (profilesError) {
    throw new Error(profilesError.message || 'Failed to load recruiter profiles');
  }
  if (recruitersError) {
    throw new Error(
      recruitersError.message || 'Failed to load recruiter account details'
    );
  }
  if (verificationsError) {
    throw new Error(
      verificationsError.message || 'Failed to load recruiter verifications'
    );
  }

  const profileMap = new Map(
    ((profiles || []) as Array<Record<string, unknown>>)
      .filter((row) => row.role === 'recruiter')
      .map((row) => {
        const fullName =
          [row.first_name, row.last_name]
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
            .join(' ') ||
          String(row.full_name || '').trim() ||
          String(row.email || '').trim() ||
          'Unknown recruiter';
        return [
          String(row.id),
          {
            fullName,
            email: sanitizeOptionalEmail((row.email as string | null) ?? null),
            phone: sanitizeOptionalText((row.phone as string | null) ?? null),
          },
        ];
      })
  );

  const recruiterMap = new Map(
    ((recruiters || []) as Array<Record<string, unknown>>).map((row) => [
      String(row.user_id),
      {
        companyName: sanitizeOptionalText((row.company_name as string | null) ?? null),
        contactEmail: sanitizeOptionalEmail(
          (row.contact_email as string | null) ?? null
        ),
        verificationStatus: String(row.verification_status || 'unverified'),
      },
    ])
  );

  const latestVerificationMap = new Map<
    string,
    { status: string; submissionSource: VerificationSubmissionSource | null }
  >();
  for (const row of (verifications || []) as Array<Record<string, unknown>>) {
    const userId = String(row.user_id || '');
    if (!userId || latestVerificationMap.has(userId)) {
      continue;
    }
    const source = String(row.submission_source || '');
    latestVerificationMap.set(userId, {
      status: String(row.status || ''),
      submissionSource: isSubmissionSource(source) ? source : null,
    });
  }

  const results: AttributedRecruiterForOfficer[] = [];
  for (const attribution of attributionRows) {
    if (results.length >= limit) {
      break;
    }

    const profile = profileMap.get(attribution.user_id);
    const recruiter = recruiterMap.get(attribution.user_id);
    if (!profile || !recruiter) {
      continue;
    }

    const latestVerification = latestVerificationMap.get(attribution.user_id);
    results.push({
      userId: attribution.user_id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      companyName: recruiter.companyName,
      contactEmail: recruiter.contactEmail,
      verificationStatus: recruiter.verificationStatus,
      latestVerificationStatus: latestVerification?.status || null,
      latestSubmissionSource: latestVerification?.submissionSource || null,
      attributedAt: attribution.created_at,
    });
  }

  return results;
}

export async function submitRecruiterVerification(
  db: DatabaseClient,
  input: SubmitRecruiterVerificationInput
): Promise<{ status: 'pending'; created: boolean }> {
  const idDocument = validateFile(input.idDocument, {
    fieldLabel: 'ID document',
    required: true,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  });
  const selfie = validateFile(input.selfie, {
    fieldLabel: 'Selfie',
    required: true,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  const businessRegistration = validateFile(input.businessRegistration || null, {
    fieldLabel: 'Business registration',
    required: false,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  });

  const source = String(input.source || '');
  if (!isSubmissionSource(source)) {
    throw new Error('Invalid verification submission source');
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, role')
    .eq('id', input.recruiterUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message || 'Failed to load recruiter account');
  }
  if (!profile || profile.role !== 'recruiter') {
    throw new Error('Recruiter account not found');
  }

  const [{ data: recruiterProfile, error: recruiterProfileError }, { data: existingVerification, error: existingVerificationError }] =
    await Promise.all([
      db
        .from('recruiter_profiles')
        .select('company_name, contact_email, verification_status')
        .eq('user_id', input.recruiterUserId)
        .maybeSingle(),
      db
        .from('verifications')
        .select('id, status')
        .eq('user_id', input.recruiterUserId)
        .maybeSingle(),
    ]);

  if (recruiterProfileError) {
    throw new Error(
      recruiterProfileError.message || 'Failed to load recruiter profile'
    );
  }
  if (!recruiterProfile) {
    throw new Error('Recruiter profile not found');
  }
  if (existingVerificationError) {
    throw new Error(
      existingVerificationError.message || 'Failed to load verification record'
    );
  }

  if (existingVerification?.status === 'pending') {
    throw new Error(
      'This recruiter already has a pending verification request.'
    );
  }
  if (existingVerification?.status === 'approved') {
    throw new Error('This recruiter is already verified.');
  }

  if (source === 'field_agent') {
    if (!input.submittedByOfficerUserId || !input.officerCodeSnapshot) {
      throw new Error('Field agent submission details are required');
    }

    const recommendation = sanitizeOptionalText(input.fieldOfficerRecommendation);
    if (
      recommendation &&
      !isFieldOfficerRecommendation(recommendation)
    ) {
      throw new Error('Invalid field officer recommendation');
    }

    const { data: attribution, error: attributionError } = await db
      .from('registration_attributions')
      .select('id')
      .eq('user_id', input.recruiterUserId)
      .eq('officer_user_id', input.submittedByOfficerUserId)
      .is('revoked_at', null)
      .maybeSingle();

    if (attributionError) {
      throw new Error(
        attributionError.message ||
          'Failed to validate field agent recruiter attribution'
      );
    }
    if (!attribution) {
      throw new Error(
        'You can only submit verification for recruiters attributed to your officer account.'
      );
    }
  }

  const uploadedPaths: string[] = [];

  try {
    const idUpload = await uploadVerificationFile(
      db,
      input.recruiterUserId,
      'id-document',
      idDocument!,
      'pdf'
    );
    uploadedPaths.push(idUpload.storagePath);

    const selfieUpload = await uploadVerificationFile(
      db,
      input.recruiterUserId,
      'selfie',
      selfie!,
      'jpg'
    );
    uploadedPaths.push(selfieUpload.storagePath);

    const businessUpload = businessRegistration
      ? await uploadVerificationFile(
          db,
          input.recruiterUserId,
          'business-registration',
          businessRegistration,
          'pdf'
        )
      : null;

    if (businessUpload) {
      uploadedPaths.push(businessUpload.storagePath);
    }

    const now = new Date().toISOString();
    const verificationData = {
      user_id: input.recruiterUserId,
      id_document_url: idUpload.publicUrl,
      selfie_url: selfieUpload.publicUrl,
      business_registration_url: businessUpload?.publicUrl || null,
      employer_reference: sanitizeOptionalText(input.employerReference),
      status: 'pending',
      submission_source: source,
      submitted_by_officer_user_id:
        source === 'field_agent' ? input.submittedByOfficerUserId || null : null,
      officer_code_snapshot:
        source === 'field_agent'
          ? sanitizeOptionalText(input.officerCodeSnapshot)
          : null,
      company_name_snapshot:
        sanitizeOptionalText(input.companyNameSnapshot) ||
        sanitizeOptionalText(recruiterProfile.company_name) ||
        null,
      office_location: sanitizeOptionalText(input.officeLocation),
      field_visit_notes:
        source === 'field_agent'
          ? sanitizeOptionalText(input.fieldVisitNotes)
          : null,
      field_officer_recommendation:
        source === 'field_agent' &&
        sanitizeOptionalText(input.fieldOfficerRecommendation)
          ? sanitizeOptionalText(input.fieldOfficerRecommendation)
          : null,
      updated_at: now,
    };

    if (existingVerification) {
      const { error: updateError } = await db
        .from('verifications')
        .update(verificationData)
        .eq('user_id', input.recruiterUserId);

      if (updateError) {
        throw new Error(
          updateError.message || 'Failed to update verification request'
        );
      }
    } else {
      const { error: insertError } = await db
        .from('verifications')
        .insert({
          ...verificationData,
          created_at: now,
        });

      if (insertError) {
        throw new Error(
          insertError.message || 'Failed to submit verification request'
        );
      }
    }

    const { error: profileUpdateError } = await db
      .from('recruiter_profiles')
      .update({ verification_status: 'pending' })
      .eq('user_id', input.recruiterUserId);

    if (profileUpdateError) {
      throw new Error(
        profileUpdateError.message || 'Failed to update recruiter verification status'
      );
    }

    return {
      status: 'pending',
      created: !existingVerification,
    };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      try {
        await db.storage.from('documents').remove(uploadedPaths);
      } catch {
        // Ignore cleanup failures.
      }
    }
    throw error;
  }
}
