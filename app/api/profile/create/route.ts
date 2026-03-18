import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { sendSignupWelcomeFromAgent } from "@/lib/whatsapp-agent/signup-welcome";
import { claimRegistrationAttribution } from "@/lib/registration-officers";

/**
 * Creates/updates a profiles row after signup and creates role-specific rows.
 * Uses service role to bypass RLS for initial provisioning.
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

// The database role_enum values - pass through directly
function mapRoleToDb(role: IncomingRole): IncomingRole {
  // Valid roles in the database enum
  const validRoles: IncomingRole[] = [
    "job_seeker",
    "talent",
    "recruiter",
    "field_agent",
    "admin",
    "staff",
    "vetting_officer",
    "verification_officer",
  ];

  if (validRoles.includes(role)) {
    return role;
  }

  // fallback safety
  return "job_seeker";
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
    };

    if (!userId || !role) {
      return NextResponse.json({ error: "Missing userId or role" }, { status: 400 });
    }

    const dbRole = mapRoleToDb(role);

    const supabase = createServiceSupabaseClient();
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfileError) {
      return NextResponse.json(
        { error: `profiles lookup failed: ${existingProfileError.message}` },
        { status: 500 }
      );
    }

    const isFirstProfileProvision = !existingProfile?.id;

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

    // 1) Upsert into profiles (MATCH YOUR TABLE COLUMNS)
    // Build profile data — only include referral fields if the columns exist
    const profileData: Record<string, unknown> = {
      id: userId,
      full_name: fullName ?? null,
      phone: phone ?? null,
      role: dbRole,
      avatar_url: avatarUrl ?? null,
    };

    // Try with referral fields first, fall back without them
    if (newReferralCode || referralCode) {
      profileData.referral_code = newReferralCode ?? Math.random().toString(36).slice(2, 10);
      profileData.referred_by = referredBy;
    }

    let { error: profileError } = await supabase
      .from("profiles")
      .upsert(profileData, { onConflict: "id" });

    // If it fails due to missing referral columns, retry without them
    if (profileError && profileError.message.includes('referral_code')) {
      const { referral_code: _rc, referred_by: _rb, ...basicData } = profileData as Record<string, unknown> & { referral_code?: unknown; referred_by?: unknown };
      const result = await supabase
        .from("profiles")
        .upsert(basicData, { onConflict: "id" });
      profileError = result.error;
    }

    if (profileError) {
      return NextResponse.json(
        { error: `profiles upsert failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 2) Role-specific inserts
    // NOTE: These tables may or may not exist depending on your migrations.
    // We attempt them, but if a table doesn't exist we return a clear message.

    // If UI role is job_seeker, try job_seeker_profiles (optional)
    // Only insert minimal required fields to avoid column mismatch issues
    if (role === "job_seeker") {
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
    if (role === "talent") {
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
    if (role === "recruiter") {
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
        // If you prefer strict behavior, change this to return 500.
        // For now we allow signup to succeed as long as recruiters row exists.
        return NextResponse.json({
          success: true,
          warning: `recruiter_profiles upsert failed (non-blocking): ${recruiterProfilesError.message}`,
        });
      }
    }

    if (
      registrationOfficerCode &&
      !["field_agent", "admin", "staff", "vetting_officer", "verification_officer"].includes(role)
    ) {
      try {
        await claimRegistrationAttribution(supabase, {
          userId,
          officerCode: registrationOfficerCode,
          source: "prefilled_link",
          confirmedByUser: true,
          actorUserId: userId,
        });
      } catch (attributionError) {
        console.error(
          "registration officer attribution failed (non-blocking):",
          attributionError instanceof Error ? attributionError.message : attributionError
        );
      }
    }

    if (isFirstProfileProvision && role === "job_seeker" && phone?.trim()) {
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
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
