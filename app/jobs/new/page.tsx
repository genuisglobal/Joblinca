"use client";

import { useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function NewJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Additional fields for enhanced job posting
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [workType, setWorkType] = useState('onsite');
  const [jobType, setJobType] = useState('job');
  const [visibility, setVisibility] = useState('public');
  const [uploading, setUploading] = useState(false);

  /**
   * Handle file upload and invoke the parse API.  When a file is selected
   * the file is uploaded via FormData to /api/parse-job.  The response
   * is used to prefill the title and description fields.  Parsing
   * failures are silently ignored to avoid disrupting the form flow.
   */
  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      const res = await fetch('/api/parse-job', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
      }
    } catch {
      // ignore parse errors
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        description,
        location,
        salary,
        companyName: companyName || undefined,
        companyLogoUrl: companyLogoUrl || undefined,
        workType,
        jobType,
        visibility,
      }),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/jobs/${id}`);
    } else {
      const data = await res.json();
      setError(data.error || 'Unable to create job');
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6 text-gray-100">
      <h1 className="text-2xl font-bold mb-4">Post a New Job</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {/* Use lighter card and input backgrounds for better readability */}
      <form onSubmit={handleSubmit} className="space-y-4 bg-gray-700 p-6 rounded-lg shadow-md">
        <div>
          <label className="block text-sm font-medium text-gray-300">Upload Job Description (PDF/DOCX/TXT)</label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            className="mt-1 w-full text-gray-100"
          />
          {uploading && <p className="text-sm text-gray-400 mt-1">Parsing file…</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Job Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="e.g. Software Engineer"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="e.g. Acme Corp"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Company Logo URL (optional)</label>
          <input
            type="url"
            value={companyLogoUrl}
            onChange={(e) => setCompanyLogoUrl(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="https://example.com/logo.png"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="City / Region"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Salary (XAF)</label>
          <input
            type="number"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            min="0"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Work Type</label>
          <select
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
          >
            <option value="onsite">Onsite</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Job Type</label>
          <select
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
          >
            <option value="job">Job</option>
            <option value="internship">Internship</option>
            <option value="gig">Gig</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Visibility</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
          >
            <option value="public">Public</option>
            <option value="talent_only">Talent Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="Describe the role, responsibilities and requirements"
            rows={5}
            required
          />
        </div>
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
        >
          Create Job
        </button>
      </form>
    </main>
  );
}