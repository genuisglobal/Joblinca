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

type Role = "job_seeker" | "talent" | "recruiter" | "admin" | string;

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
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const [schoolStatus, setSchoolStatus] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [internshipEligible, setInternshipEligible] = useState(true);

  const [recruiterType, setRecruiterType] = useState("company_hr");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Prevent multiple concurrent loads
  const loadingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function resolveUserIdWithRetry(): Promise<string | null> {
      // 1) Quick local check (avoids false negatives during hydration)
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUserId = sessionData?.session?.user?.id ?? null;
      if (sessionUserId) return sessionUserId;

      // 2) Authoritative check (network) - can be briefly null right after redirect
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) return userData.user.id;

      // 3) Retry once after a short delay (session restore can lag)
      await new Promise((r) => setTimeout(r, 350));
      const { data: sessionData2 } = await supabase.auth.getSession();
      const sessionUserId2 = sessionData2?.session?.user?.id ?? null;
      if (sessionUserId2) return sessionUserId2;

      // Final authoritative attempt
      const { data: userData2 } = await supabase.auth.getUser();
      if (userData2?.user?.id) return userData2.user.id;

      return null;
    }

    async function loadProfile() {
      if (loadingRef.current) return;
      loadingRef.current = true;

      setLoading(true);
      setError(null);

      const userId = await resolveUserIdWithRetry();
      if (!mounted) return;

      if (!userId) {
        setLoading(false);
        setError("Session not found. Please log in again.");
        router.replace("/auth/login");
        loadingRef.current = false;
        return;
      }

      // Load base profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!mounted) return;

      if (profileError) {
        setError(profileError.message || "Unable to load profile.");
        setLoading(false);
        loadingRef.current = false;
        return;
      }

      if (!profileData) {
        setError(
          "Your account is logged in, but your profile record is missing. Please refresh. If it persists, contact support."
        );
        setLoading(false);
        loadingRef.current = false;
        return;
      }

      setProfile(profileData as Profile);
      if (profileData.full_name) setFullName(profileData.full_name);

      let isComplete = false;
      const role: Role = profileData.role;

      if (role === "job_seeker") {
        const { data, error: jsErr } = await supabase
          .from("job_seeker_profiles")
          .select("location, headline, resume_url")
          .eq("user_id", userId)
          .maybeSingle();

        if (jsErr) {
          setError(jsErr.message || "Unable to load job seeker profile.");
          setLoading(false);
          loadingRef.current = false;
          return;
        }

        if (data) {
          setLocation(data.location || "");
          setHeadline(data.headline || "");
          isComplete = !!(data.location && data.headline && data.resume_url);
        } else {
          isComplete = false;
        }
      } else if (role === "talent") {
        const { data, error: tErr } = await supabase
          .from("talent_profiles")
          .select("school_status, portfolio, internship_eligible")
          .eq("user_id", userId)
          .maybeSingle();

        if (tErr) {
          setError(tErr.message || "Unable to load talent profile.");
          setLoading(false);
          loadingRef.current = false;
          return;
        }

        if (data) {
          setSchoolStatus(data.school_status || "");
          setPortfolio(data.portfolio ? JSON.stringify(data.portfolio) : "");
          setInternshipEligible(!!data.internship_eligible);
          isComplete = !!(data.school_status && data.portfolio);
        } else {
          isComplete = false;
        }
      } else if (role === "recruiter") {
        const { data, error: rErr } = await supabase
          .from("recruiter_profiles")
          .select("recruiter_type, company_name, contact_email, contact_phone")
          .eq("user_id", userId)
          .maybeSingle();

        if (rErr) {
          setError(rErr.message || "Unable to load recruiter profile.");
          setLoading(false);
          loadingRef.current = false;
          return;
        }

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
        isComplete = true;
      }

      if (isComplete && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/dashboard");
        loadingRef.current = false;
        return;
      }

      setLoading(false);
      loadingRef.current = false;
    }

    loadProfile();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!mounted) return;
      loadProfile();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
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
        let resumeUrl: string | null = null;

        if (resumeFile) {
          const fileExt = resumeFile.name.split(".").pop();
          const fileName = `${profile.id}-resume-${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from("application-cvs")
            .upload(fileName, resumeFile);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage.from("application-cvs").getPublicUrl(fileName);
          resumeUrl = data.publicUrl;
        }

        // ✅ Do NOT overwrite resume_url with null if user didn't re-upload
        const payload: any = {
          user_id: profile.id,
          location: location || null,
          headline: headline || null,
        };
        if (resumeUrl) payload.resume_url = resumeUrl;

        const { error } = await supabase
          .from("job_seeker_profiles")
          .upsert(payload, { onConflict: "user_id" });

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

        const { error } = await supabase.from("talent_profiles").upsert(
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
        const { error } = await supabase.from("recruiter_profiles").upsert(
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
      <main className="min-h-screen flex items-center justify-center p-4 text-red-500 text-center">
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
        <p className="mb-6 text-gray-300">
          Please provide the required information to finish onboarding.
        </p>

        <label className="block text-sm font-medium mb-4 text-gray-300">
          Full Name *
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
            <label className="block text-sm font-medium mb-4 text-gray-300">
              Location *
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="e.g. Douala, Yaoundé"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Professional Headline *
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="e.g. Software Engineer | React & Node.js"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Upload Resume * (PDF, DOC, DOCX - Max 5MB)
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 5 * 1024 * 1024) {
                      setError("File size must be less than 5MB");
                      e.target.value = "";
                      return;
                    }
                    setResumeFile(file);
                    setError(null);
                  }
                }}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                required
              />
              {resumeFile && (
                <p className="text-sm text-green-400 mt-1">Selected: {resumeFile.name}</p>
              )}
            </label>
          </>
        )}

        {profile.role === "talent" && (
          <>
            <label className="block text-sm font-medium mb-4 text-gray-300">
              School Status *
              <select
                value={schoolStatus}
                onChange={(e) => setSchoolStatus(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                required
              >
                <option value="">Select status</option>
                <option value="Currently studying">Currently studying</option>
                <option value="Recent graduate">Recent graduate</option>
                <option value="On break">On break</option>
              </select>
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Portfolio (JSON format) *
              <textarea
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500 h-24"
                placeholder='[{"title":"My Project","link":"https://..."}]'
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter as JSON array. Example: [{"["}
                {"{"}"title":"Project","link":"https://..."{"}"}
                {"]"}
              </p>
            </label>

            <label className="flex items-center mb-4 text-gray-300">
              <input
                type="checkbox"
                checked={internshipEligible}
                onChange={(e) => setInternshipEligible(e.target.checked)}
                className="mr-2"
              />
              I am eligible for internships
            </label>
          </>
        )}

        {profile.role === "recruiter" && (
          <>
            <label className="block text-sm font-medium mb-4 text-gray-300">
              Recruiter Type *
              <select
                value={recruiterType}
                onChange={(e) => setRecruiterType(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                required
              >
                <option value="company_hr">Company HR</option>
                <option value="agency">Recruiting Agency</option>
                <option value="individual">Individual Recruiter</option>
              </select>
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Company Name *
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="Your company name"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Contact Email *
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="contact@company.com"
                required
              />
            </label>

            <label className="block text-sm font-medium mb-4 text-gray-300">
              Contact Phone *
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="+237 6XX XXX XXX"
                required
              />
            </label>
          </>
        )}

        <div className="flex justify-end mt-6">
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 text-white py-2 px-6 rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Save and Continue"}
          </button>
        </div>
      </form>
    </main>
  );
}
