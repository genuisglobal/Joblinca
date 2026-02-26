'use client';

import { useState } from 'react';
import { Download, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { ResumeData } from '@/lib/resume';

interface PreviewStepProps {
  data: ResumeData;
}

export default function PreviewStep({ data }: PreviewStepProps) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/resume/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok && result.dataUrl) {
        setPdfUrl(result.dataUrl);
        setMessage({ type: 'success', text: 'PDF generated. Click Download to save it.' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to generate PDF' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to generate PDF' });
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload() {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${data.fullName || 'resume'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/resume/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Resume saved to your account.' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save resume' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Preview & Download</h2>
        <p className="text-gray-400">Generate your PDF resume, download it, or save it to your account.</p>
      </div>

      {/* Resume summary card */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-100">{data.fullName || 'Your Name'}</h3>
        {data.title && <p className="text-gray-400">{data.title}</p>}
        <div className="text-sm text-gray-500 flex flex-wrap gap-3">
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>{data.phone}</span>}
          {data.location && <span>{data.location}</span>}
        </div>

        {data.summary && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Summary</p>
            <p className="text-sm text-gray-300">{data.summary}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Experience</p>
            <p className="text-gray-200 font-medium">{data.experience.length} position{data.experience.length !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-gray-500">Education</p>
            <p className="text-gray-200 font-medium">{data.education.length} entr{data.education.length !== 1 ? 'ies' : 'y'}</p>
          </div>
          <div>
            <p className="text-gray-500">Skills</p>
            <p className="text-gray-200 font-medium">{data.skills.length} skill{data.skills.length !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-gray-500">Template</p>
            <p className="text-gray-200 font-medium capitalize">{data.template}</p>
          </div>
        </div>
      </div>

      {/* PDF preview iframe */}
      {pdfUrl && (
        <div className="w-full h-[500px] border border-gray-700 rounded-xl overflow-hidden">
          <iframe src={pdfUrl} className="w-full h-full" title="Resume PDF Preview" />
        </div>
      )}

      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating ? 'Generating...' : pdfUrl ? 'Regenerate PDF' : 'Generate PDF'}
        </button>

        {pdfUrl && (
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save to Account'}
        </button>
      </div>
    </div>
  );
}
