import { NextResponse } from "next/server";
import { completeLeadFromInviteToken } from "@/lib/field-registration/service";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildProfileWrite,
  decideProvisionAccess,
  isSelfServiceRole,
  type SelfServiceRole,
} from "@/lib/profile/provision-access";
import { sendSignupWelcomeFromAgent } from "@/lib/whatsapp-agent/signup-welcome";
import { claimRegistrationAttribution } from "@/lib/registration-officers";

/**
 * Creates a profiles row after signup and creates role-specific rows.
 * Uses service role to bypass RLS for initial provisioning, so it decides
 * access itself (lib/profile/provision-access.ts): self-service roles only,
 * the caller must be the user (session cookie or Bearer token) unless the
 * auth user was created in the last few minutes, and an existing profile's
 * role is never changed.
 *
 * Database uses role_enum: job_seeker, talent, recruiter, field_agent, vetting_officer, verification_officer, admin, staff
 */
type IncomingRole =
  | "job_seeker"
  | "talent"
  | "recruiter"
  | "field_agent"
  | "admin"
  | "staff"
  | "vetting_officer"
  | "verification_officer";

/** The authenticated caller, from the session cookie or an Authorization: Bearer token. */
async function resolveCallerId(request: Request): Promise<string | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  try {
    const client = createServerSupabaseClient();
    const { data } = bearer ? await client.auth.getUser(bearer) : await client.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      userId,
      role,
      fullName,
      phone,
      avatarUrl, // use this from client if you have it
      companyName,
      contactEmail,
      contactPhone,
      resumeUrl,
      location,
      headline,
      schoolStatus,
      institution,
      graduationYear,
      recruiterType,
      referralCode,
      registrationOfficerCode,
      registrationInviteToken,
    } = body as {
      userId?: string;
      role?: IncomingRole;
      fullName?: string;
      phone?: string;
      avatarUrl?: string;
      companyName?: string;
      contactEmail?: string;
      contactPhone?: string;
      resumeUrl?: string;
      location?: string;
      headline?: string;
      schoolStatus?: string;
      institution?: string;
      graduationYear?: string;
      recruiterType?: string;
      referralCode?: string;
      registrationOfficerCode?: string;
      registrationInviteToken?: string;
    };

    if (!userId || !role) {
      return NextResponse.json({ error: "Missing userId or role" }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();

    const callerId = await resolveCallerId(request);
    let authUserCreatedAt: string | null = null;
    if (!callerId) {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      authUserCreatedAt = authUser?.user?.created_at ?? null;
    }
    const access = decideProvisionAccess({ userId, role, callerId, authUserCreatedAt });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const warnings: string[] = [];
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("id, role, full_name, phone")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfileError) {
      return NextResponse.json(
        { error: `profiles lookup failed: ${existingProfileError.message}` },
        { status: 500 }
      );
    }

    const isFirstProfileProvision = !existingProfile?.id;
    // An existing profile keeps its role; role-specific rows follow it.
    const requestedRole = role as SelfServiceRole;
    const existingRole = (existingProfile?.role as string | undefined) ?? null;
    const effectiveRole: string = existingRole ?? requestedRole;

    // Resolve referral: look up who referred this user (only if referral columns exist)
    let referredBy: string | null = null;
    let newReferralCode: string | null = null;
    if (referralCode) {
      try {
        const { data: referrer } = await supabase
          .from('profiles')
          .select('id')
          .eq('referral_code', referralCode.trim())
          .maybeSingle();
        if (referrer) {
          referredBy = referrer.id;
        }
        newReferralCode = Math.random().toString(36).slice(2, 10);
      } catch {
        // referral_code column may not exist yet — skip gracefully
      }
    }

    // 1) Write the profile. New: full row. Existing: never the role, and
    // only name/phone where empty -- this route provisions, it doesn't edit.
    const profileData = buildProfileWrite({
      userId,
      role: requestedRole,
      fullName: fullName ?? null,
      phone: phone ?? null,
      avatarUrl: avatarUrl ?? null,
      existing: existingProfile
        ? { full_name: (existingProfile.full_name as string | null) ?? null, phone: (existingProfile.phone as string | null) ?? null }
        : null,
    });

    let profileError: { message: string } | null = null;
    if (profileData && isFirstProfileProvision) {
      // Referral fields only on creation, and only if the columns exist.
      if (newReferralCode || referralCode) {
        profileData.referral_code = newReferralCode ?? Math.random().toString(36).slice(2, 10);
        profileData.referred_by = referredBy;
      }
      ({ error: profileError } = await supabase.from("profiles").insert(profileData));
      if (profileError && profileError.message.includes("referral_code")) {
        const { referral_code: _rc, referred_by: _rb, ...basicData } = profileData;
        ({ error: profileError } = await supabase.from("profiles").insert(basicData));
      }
    } else if (profileData) {
      ({ error: profileError } = await supabase.from("profiles").update(profileData).eq("id", userId));
    }

    if (profileError) {
      return NextResponse.json(
        { error: `profiles write failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 2) Role-specific inserts
    // NOTE: These tables may or may not exist depending on your migrations.
    // We attempt them, but if a table doesn't exist we return a clear message.

    // If UI role is job_seeker, try job_seeker_profiles (optional)
    // Only insert minimal required fields to avoid column mismatch issues
    if (effectiveRole === "job_seeker") {
      const { error } = await supabase.from("job_seeker_profiles").upsert(
        {
          user_id: userId,
        },
        { onConflict: "user_id" }
      );

      // If table doesn't exist or insert fails, log but don't block registration
      if (error) {
        console.error("job_seeker_profiles upsert failed (non-blocking):", error.message);
        // Don't return error - profile in main profiles table is sufficient
      }
    }

    // If UI role is talent, try talent_profiles (optional)
    // Only insert minimal required fields to avoid column mismatch issues
    if (effectiveRole === "talent") {
      const { error } = await supabase.from("talent_profiles").upsert(
        {
          user_id: userId,
        },
        { onConflict: "user_id" }
      );

      // If table doesn't exist or insert fails, log but don't block registration
      if (error) {
        console.error("talent_profiles upsert failed (non-blocking):", error.message);
        // Don't return error - profile in main profiles table is sufficient
      }
    }

    // Recruiter: MUST create public.recruiters row because jobs.recruiter_id FK points there
    if (effectiveRole === "recruiter") {
      // A) create/ensure recruiters row exists (critical for FK)
      const { error: recruitersError } = await supabase.from("recruiters").upsert(
        {
          id: userId, // recruiters.id references profiles.id
          company_name: companyName ?? "Company", // company_name is NOT NULL in your schema
          company_description: null,
          website: null,
          verified: false,
        },
        { onConflict: "id" }
      );

      if (recruitersError) {
        return NextResponse.json(
          { error: `recruiters upsert failed: ${recruitersError.message}` },
          { status: 500 }
        );
      }

      // B) also try recruiter_profiles (optional, only if your migration created it)
      const safeRecruiterType = recruiterType ?? "company_hr";
      const { error: recruiterProfilesError } = await supabase.from("recruiter_profiles").upsert(
        {
          user_id: userId,
          recruiter_type: safeRecruiterType,
          company_name: companyName ?? null,
          contact_email: contactEmail ?? null,
          contact_phone: contactPhone ?? null,
        },
        { onConflict: "user_id" }
      );

      // If recruiter_profiles doesn't exist yet, don't block account creation
      if (recruiterProfilesError) {
        warnings.push(
          `recruiter_profiles upsert failed (non-blocking): ${recruiterProfilesError.message}`
        );
      }
    }

    let officerCodeToClaim = registrationOfficerCode || null;
    if (registrationInviteToken) {
      try {
        const completedLead = await completeLeadFromInviteToken(supabase, {
          rawToken: registrationInviteToken,
          completedUserId: userId,
        });

        if (completedLead?.officer_code_snapshot) {
          officerCodeToClaim = completedLead.officer_code_snapshot;
        } else {
          warnings.push('Registration invite token was invalid or already claimed.');
        }
      } catch (leadCompletionError) {
        warnings.push(
          `registration lead completion failed (non-blocking): ${
            leadCompletionError instanceof Error
              ? leadCompletionError.message
              : 'unknown_error'
          }`
        );
      }
    }

    if (
      officerCodeToClaim &&
      isSelfServiceRole(effectiveRole)
    ) {
      try {
        await claimRegistrationAttribution(supabase, {
          userId,
          officerCode: officerCodeToClaim,
          source: "prefilled_link",
          confirmedByUser: true,
          actorUserId: userId,
        });
      } catch (attributionError) {
        console.error(
          "registration officer attribution failed (non-blocking):",
          attributionError instanceof Error ? attributionError.message : attributionError
        );
        warnings.push(
          `registration officer attribution failed (non-blocking): ${
            attributionError instanceof Error ? attributionError.message : 'unknown_error'
          }`
        );
      }
    }

    if (isFirstProfileProvision && effectiveRole === "job_seeker" && phone?.trim()) {
      try {
        await sendSignupWelcomeFromAgent({
          phone,
          userId,
          fullName: fullName ?? null,
        });
      } catch (welcomeError) {
        console.error(
          "signup WhatsApp welcome failed (non-blocking):",
          welcomeError instanceof Error ? welcomeError.message : welcomeError
        );
        warnings.push(
          `signup WhatsApp welcome failed (non-blocking): ${
            welcomeError instanceof Error ? welcomeError.message : 'unknown_error'
          }`
        );
      }
    }

    return NextResponse.json(
      warnings.length > 0
        ? { success: true, warning: warnings.join(" | ") }
        : { success: true }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
