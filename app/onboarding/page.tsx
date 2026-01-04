"use client";

import { useEffect, useMemo, useState } from "react";
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

  // Fetch profile and role-specific data
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
        .single();

      if (!mounted) return;

      if (profileError || !profileData) {
        setError(profileError?.message || "Unable to load profile");
        setLoading(false);
        return;
      }

      setProfile(profileData as Profile);

      // Pre-fill full name
      if (profileData.full_name) setFullName(profileData.full_name);

      // Role-specific prefill
      if (profileData.role === "job_seeker") {
        const { data } = await supabase
          .from("job_seeker_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setLocation(data.location || "");
          setHeadline(data.headline || "");
          setResumeUrl(data.resume_url || "");
        }
      } else if (profileData.role === "talent") {
        const { data } = await supabase
          .from("talent_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setSchoolStatus(data.school_status || "");
          setPortfolio(data.portfolio ? JSON.stringify(data.portfolio) : "");
          setInternshipEligible(!!data.internship_eligible);
        }
      } else if (profileData.role === "recruiter") {
        const { data } = await supabase
          .from("recruiter_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          setRecruiterType(data.recruiter_type || "company_hr");
          setCompanyName(data.company_name || "");
          setContactEmail(data.contact_email || "");
          setContactPhone(data.contact_phone || "");
        }
      }

      setLoading(false);
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  // If already complete, redirect (use refresh + replace to fix nav update timing)
  useEffect(() => {
    if (loading || !profile) return;

    let missing = false;

    if (profile.role === "job_seeker") {
      missing = !location || !headline || !resumeUrl;
    } else if (profile.role === "talent") {
      missing = !schoolStatus || !portfolio;
    } else if (profile.role === "recruiter") {
      missing = !companyName || !contactEmail || !contactPhone;
    }

    if (!missing) {
      router.refresh();
      router.replace("/dashboard");
    }
  }, [
    loading,
    profile,
    location,
    headline,
    resumeUrl,
    schoolStatus,
    portfolio,
    companyName,
    contactEmail,
    contactPhone,
    router,
  ]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;

    setError(null);
    setLoading(true);

    try {
      // Update profiles.full_name if changed
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
            throw new Error("Portfolio must be valid JSON (example: [{\"title\":\"Project\",\"link\":\"...\"}])");
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

      // ✅ Critical fix: ensure navbar updates immediately
      router.refresh();
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

        {/* Full name for all roles */}
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

        {profile.role === "job_seeker" && (
          <>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Location
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="City, Country"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-2 text-gray-300">
              Professional Headline
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="e.g. Senior Software Engineer"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Resume URL
              <input
                type="url"
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="https://..."
                required
              />
            </label>
          </>
        )}

        {profile.role === "talent" && (
          <>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              School Status
              <input
                type="text"
                value={schoolStatus}
                onChange={(e) => setSchoolStatus(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="e.g. Undergraduate, 3rd year"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-2 text-gray-300">
              Portfolio (JSON)
              <textarea
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder='[{"title":"Project 1","link":"..."}]'
                required
              />
            </label>

            <label className="flex items-center mb-4">
              <input
                type="checkbox"
                checked={internshipEligible}
                onChange={(e) => setInternshipEligible(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-300">
                I am eligible for internships
              </span>
            </label>
          </>
        )}

        {profile.role === "recruiter" && (
          <>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Recruiter Type
              <select
                value={recruiterType}
                onChange={(e) => setRecruiterType(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                required
              >
                <option value="company_hr">Company HR</option>
                <option value="agency">Agency</option>
                <option value="verified_individual">Verified Individual</option>
                <option value="institution">Institution</option>
              </select>
            </label>

            <label className="block text-sm font-medium mb-2 text-gray-300">
              Company Name
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="Company name"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-2 text-gray-300">
              Contact Email
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="contact@example.com"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Contact Phone
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="(+237) 6xx xxx xxx"
                required
              />
            </label>
          </>
        )}

        {error && <p className="text-red-500 mb-4">{error}</p>}

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
