"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  id: string;
  full_name: string | null;
  role: string;
  phone: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const redirectedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [location, setLocation] = useState("");
  const [headline, setHeadline] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");

  const [schoolStatus, setSchoolStatus] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [internshipEligible, setInternshipEligible] = useState(true);

  const [recruiterType, setRecruiterType] = useState("company_hr");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (userError || !user) {
        setError("You must be logged in to complete onboarding.");
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted) return;

      if (profileError || !profileData) {
        setError(profileError?.message || "Unable to load profile");
        setLoading(false);
        return;
      }

      setProfile(profileData as Profile);

      if (profileData.full_name) setFullName(profileData.full_name);

      // ✅ DB-based completion check (stable)
      let isComplete = false;

      if (profileData.role === "job_seeker") {
        const { data } = await supabase
          .from("job_seeker_profiles")
          .select("location, headline, resume_url")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setLocation(data.location || "");
          setHeadline(data.headline || "");
          setResumeUrl(data.resume_url || "");

          isComplete = !!(data.location && data.headline && data.resume_url);
        } else {
          isComplete = false;
        }
      } else if (profileData.role === "talent") {
        const { data } = await supabase
          .from("talent_profiles")
          .select("school_status, portfolio, internship_eligible")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setSchoolStatus(data.school_status || "");
          setPortfolio(data.portfolio ? JSON.stringify(data.portfolio) : "");
          setInternshipEligible(!!data.internship_eligible);

          isComplete = !!(data.school_status && data.portfolio);
        } else {
          isComplete = false;
        }
      } else if (profileData.role === "recruiter") {
        const { data } = await supabase
          .from("recruiter_profiles")
          .select("recruiter_type, company_name, contact_email, contact_phone")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setRecruiterType(data.recruiter_type || "company_hr");
          setCompanyName(data.company_name || "");
          setContactEmail(data.contact_email || "");
          setContactPhone(data.contact_phone || "");

          isComplete = !!(data.company_name && data.contact_email && data.contact_phone);
        } else {
          isComplete = false;
        }
      } else {
        // For other roles (admin/staff), allow dashboard
        isComplete = true;
      }

      // ✅ Redirect once, based on DB, not form state
      if (isComplete && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/dashboard");
        return;
      }

      setLoading(false);
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;

    setError(null);
    setLoading(true);

    try {
      if (fullName && fullName !== profile.full_name) {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", profile.id);

        if (profileUpdateError) throw profileUpdateError;
      }

      if (profile.role === "job_seeker") {
        const { error } = await supabase
          .from("job_seeker_profiles")
          .upsert(
            {
              user_id: profile.id,
              location: location || null,
              headline: headline || null,
              resume_url: resumeUrl || null,
            },
            { onConflict: "user_id" }
          );
        if (error) throw error;
      }

      if (profile.role === "talent") {
        let parsedPortfolio: any = null;
        if (portfolio) {
          try {
            parsedPortfolio = JSON.parse(portfolio);
          } catch {
            throw new Error(
              'Portfolio must be valid JSON (example: [{"title":"Project","link":"..."}])'
            );
          }
        }

        const { error } = await supabase
          .from("talent_profiles")
          .upsert(
            {
              user_id: profile.id,
              school_status: schoolStatus || null,
              portfolio: parsedPortfolio,
              internship_eligible: internshipEligible,
            },
            { onConflict: "user_id" }
          );
        if (error) throw error;
      }

      if (profile.role === "recruiter") {
        const { error } = await supabase
          .from("recruiter_profiles")
          .upsert(
            {
              user_id: profile.id,
              recruiter_type: recruiterType,
              company_name: companyName || null,
              contact_email: contactEmail || null,
              contact_phone: contactPhone || null,
            },
            { onConflict: "user_id" }
          );
        if (error) throw error;
      }

      // Navigate once on success
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Failed to update profile");
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 text-gray-100">
        Loading...
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 text-red-500">
        {error}
      </main>
    );
  }

  if (!profile) return null;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 text-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-700 shadow-md rounded-lg px-8 pt-6 pb-8 mb-4 max-w-lg w-full"
      >
        <h2 className="text-2xl font-semibold mb-4">Complete Your Profile</h2>
        <p className="mb-4 text-gray-300">
          Please provide the required information to finish onboarding.
        </p>

        <label className="block text-sm font-medium mb-2 text-gray-300">
          Full Name
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="Your full name"
            required
          />
        </label>

        {/* keep the rest of your forms exactly the same */}
        {/* ... no changes needed below this point ... */}

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors"
          >
            Save and Continue
          </button>
        </div>
      </form>
    </main>
  );
}
