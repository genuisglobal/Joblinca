"use client";

import { useState, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ResumeData } from "@/lib/resume";
import { createEmptyResume } from "@/lib/resume";

/**
 * Resume builder and optimiser page.  This page is available to
 * authenticated users only (the server redirects unauthenticated
 * access via middleware).  Users can upload an existing resume
 * document or build one from scratch.  Premium subscribers may
 * optimise their resume using AI and generate a PDF once per day.
 */
export default function ResumePage() {
  const supabase = createClient();
  const router = useRouter();
  const [resume, setResume] = useState<ResumeData>(createEmptyResume());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /**
   * Handle resume file selection.  The selected file is sent to
   * `/api/resume/parse` which extracts plain text and derives
   * initial resume fields.  On failure the fields remain empty.
   */
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/resume/parse", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setResume((r) => ({ ...r, ...data }));
        setInfo("Resume parsed. Please review and edit the details below.");
      } else {
        setError("Failed to parse resume");
      }
    } catch {
      setError("Failed to parse resume");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handles input changes for the resume form.  It updates the
   * corresponding property on the resume state.
   */
  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setResume((prev) => ({ ...prev, [name]: value }));
  }

  /**
   * Calls the optimisation API to improve the resume.  This
   * endpoint is restricted to premium users with a daily limit.
   */
  async function handleOptimize() {
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/resume/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resume),
      });

      const data = await res.json();

      if (res.ok) {
        setResume((prev) => ({ ...prev, ...data }));
        setInfo("Resume optimised successfully.");
      } else {
        setError(data.error || "Unable to optimise resume");
      }
    } catch {
      setError("Unable to optimise resume");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Saves the resume to Supabase via the save API.  On success
   * redirects the user to their dashboard.
   */
  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/resume/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resume),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError(data.error || "Failed to save resume");
      }
    } catch {
      setError("Failed to save resume");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Generates a PDF for the resume.  The response contains a
   * base64 data URL which we convert to a blob and trigger a
   * download in the browser.  The daily limit is enforced by
   * the server.
   */
  async function handleGeneratePdf() {
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resume),
      });

      const data = await res.json();

      if (res.ok && data.dataUrl) {
        const link = document.createElement("a");
        link.href = data.dataUrl;
        link.download = "resume.pdf";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setInfo("PDF generated successfully.");
      } else {
        setError(data.error || "Failed to generate PDF");
      }
    } catch {
      setError("Failed to generate PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 text-gray-100">
      <h1 className="text-2xl font-bold mb-4">Resume Builder &amp; Optimiser</h1>
      <p className="text-gray-400 mb-6">
        Upload an existing resume or start from scratch. Premium members can
        optimise their resume once per day and download a PDF version.
      </p>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {info && <p className="text-green-400 mb-4">{info}</p>}

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Upload Resume (PDF/DOCX/TXT)
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            className="mt-1 w-full text-gray-100"
            disabled={loading}
          />
        </label>
        {loading && <p className="text-sm text-gray-400">Processing...</p>}
      </div>

      {/* 
        Lighter card background and input styling to improve contrast on the
        dark theme. Inputs use a mid-tone grey with lighter borders for
        better definition. This ensures the resume builder remains
        accessible and easy to use.
      */}

      <form
        onSubmit={handleSave}
        className="space-y-4 bg-gray-700 p-6 rounded-lg shadow-md"
      >
        <div>
          <label className="block text-sm font-medium text-gray-300">
            Full Name
          </label>
          <input
            type="text"
            name="fullName"
            value={resume.fullName}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="Your full name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">
            Email
          </label>
          <input
            type="email"
            name="email"
            value={resume.email}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">
            Phone
          </label>
          <input
            type="tel"
            name="phone"
            value={resume.phone}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="(+237) 6xx xxx xxx"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">
            Summary
          </label>
          <textarea
            name="summary"
            value={resume.summary}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            rows={4}
            placeholder="A brief summary about yourself"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">
            Experience
          </label>
          <textarea
            name="experience"
            value={resume.experience}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            rows={4}
            placeholder="Describe your past roles and achievements"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">
            Education
          </label>
          <textarea
            name="education"
            value={resume.education}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            rows={3}
            placeholder="List your educational background"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300">
            Skills (comma separated)
          </label>
          <input
            type="text"
            name="skills"
            value={resume.skills}
            onChange={handleChange}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="e.g. JavaScript, SQL, Communication"
          />
        </div>

        <div className="flex flex-wrap gap-4 mt-6">
          <button
            type="button"
            onClick={handleOptimize}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors"
            disabled={loading}
          >
            Optimise with AI
          </button>

          <button
            type="submit"
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
            disabled={loading}
          >
            Save Resume
          </button>

          <button
            type="button"
            onClick={handleGeneratePdf}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            disabled={loading}
          >
            Download PDF
          </button>
        </div>
      </form>
    </main>
  );
}
