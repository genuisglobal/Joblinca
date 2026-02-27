'use client';

import type { ResumeData } from '@/lib/resume';

type Template = ResumeData['template'];

interface TemplateThumbnailProps {
  template: Template;
  selected: boolean;
  onClick: () => void;
}

const META: Record<Template, { label: string; desc: string }> = {
  professional: { label: 'Professional', desc: 'Classic single-column' },
  modern:       { label: 'Modern',       desc: 'Dark sidebar layout' },
  executive:    { label: 'Executive',    desc: 'Navy header, Times Roman' },
  creative:     { label: 'Creative',     desc: 'Purple accent sidebar' },
  minimal:      { label: 'Minimal',      desc: 'Clean black & white, ATS' },
  compact:      { label: 'Compact',      desc: 'Dense, fits more content' },
};

export default function TemplateThumbnail({ template, selected, onClick }: TemplateThumbnailProps) {
  const { label, desc } = META[template];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full aspect-[3/4] rounded-lg border-2 transition-all overflow-hidden ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/30'
          : 'border-gray-600 hover:border-gray-400'
      }`}
    >
      <div className="absolute inset-0 p-2">
        <Preview template={template} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/90 py-2 px-3">
        <p className="text-sm font-medium text-gray-200">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>

      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center z-10">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

function Preview({ template }: { template: Template }) {
  switch (template) {
    case 'professional': return <ProfessionalPreview />;
    case 'modern':       return <ModernPreview />;
    case 'executive':    return <ExecutivePreview />;
    case 'creative':     return <CreativePreview />;
    case 'minimal':      return <MinimalPreview />;
    case 'compact':      return <CompactPreview />;
  }
}

// ── Professional ────────────────────────────────────────────
function ProfessionalPreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm p-2 flex flex-col gap-1.5">
      <div className="h-3 w-2/3 bg-gray-800 rounded-sm" />
      <div className="h-1.5 w-1/2 bg-gray-400 rounded-sm" />
      <div className="h-1 w-3/4 bg-gray-300 rounded-sm" />
      <div className="h-px bg-blue-500 w-full mt-1" />
      <div className="space-y-1 mt-0.5">
        <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
        <div className="h-1.5 w-5/6 bg-gray-200 rounded-sm" />
      </div>
      <div className="h-px bg-blue-500 w-full mt-1" />
      <div className="space-y-1 mt-0.5">
        <div className="h-2 w-1/3 bg-gray-700 rounded-sm" />
        <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
        <div className="h-1.5 w-4/5 bg-gray-200 rounded-sm" />
        <div className="h-1.5 w-3/5 bg-gray-200 rounded-sm" />
      </div>
      <div className="h-px bg-blue-500 w-full mt-1" />
      <div className="h-2 w-1/4 bg-gray-700 rounded-sm mt-0.5" />
      <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
      <div className="h-px bg-blue-500 w-full mt-1" />
      <div className="flex gap-1 mt-0.5 flex-wrap">
        <div className="h-1.5 w-7 bg-gray-300 rounded-sm" />
        <div className="h-1.5 w-5 bg-gray-300 rounded-sm" />
        <div className="h-1.5 w-9 bg-gray-300 rounded-sm" />
        <div className="h-1.5 w-6 bg-gray-300 rounded-sm" />
      </div>
    </div>
  );
}

// ── Modern ──────────────────────────────────────────────────
function ModernPreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm flex overflow-hidden">
      <div className="w-[32%] bg-gray-800 p-1.5 flex flex-col gap-1">
        <div className="h-2.5 w-full bg-gray-500 rounded-sm" />
        <div className="h-1 w-2/3 bg-blue-400 rounded-sm" />
        <div className="mt-1.5 space-y-0.5">
          <div className="h-0.5 w-full bg-blue-400" />
          <div className="h-1 w-full bg-gray-600 rounded-sm" />
          <div className="h-1 w-5/6 bg-gray-600 rounded-sm" />
        </div>
        <div className="mt-1 space-y-0.5">
          <div className="h-0.5 w-full bg-blue-400" />
          <div className="h-1 w-full bg-gray-600 rounded-sm" />
          <div className="h-1 w-4/5 bg-gray-600 rounded-sm" />
          <div className="h-1 w-3/5 bg-gray-600 rounded-sm" />
        </div>
        <div className="mt-1 space-y-0.5">
          <div className="h-0.5 w-full bg-blue-400" />
          <div className="h-1 w-2/3 bg-gray-600 rounded-sm" />
        </div>
      </div>
      <div className="flex-1 p-1.5 flex flex-col gap-1">
        <div className="h-px bg-blue-400 w-full" />
        <div className="space-y-0.5">
          <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
          <div className="h-1.5 w-5/6 bg-gray-200 rounded-sm" />
        </div>
        <div className="h-px bg-blue-400 w-full mt-1" />
        <div className="space-y-0.5">
          <div className="h-1.5 w-1/2 bg-gray-700 rounded-sm" />
          <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
          <div className="h-1.5 w-4/5 bg-gray-200 rounded-sm" />
          <div className="h-1.5 w-3/4 bg-gray-200 rounded-sm" />
        </div>
        <div className="h-px bg-blue-400 w-full mt-1" />
        <div className="space-y-0.5">
          <div className="h-1.5 w-2/5 bg-gray-700 rounded-sm" />
          <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

// ── Executive ───────────────────────────────────────────────
function ExecutivePreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm flex flex-col overflow-hidden">
      {/* Gold top bar */}
      <div className="h-0.5 w-full bg-yellow-500 flex-shrink-0" />
      {/* Navy header */}
      <div className="h-[22%] bg-[#17213f] flex flex-col items-center justify-center gap-0.5 flex-shrink-0 px-2">
        <div className="h-2.5 w-2/3 bg-white/80 rounded-sm" />
        <div className="h-1.5 w-1/2 bg-blue-200/60 rounded-sm" />
        <div className="h-1 w-3/4 bg-blue-100/40 rounded-sm" />
      </div>
      {/* Gold rule */}
      <div className="h-px w-4/5 self-center bg-yellow-500/60 flex-shrink-0" />
      {/* Body */}
      <div className="flex-1 p-2 flex flex-col gap-1 overflow-hidden">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1/4 bg-[#17213f] rounded-sm" />
          <div className="flex-1 h-px bg-[#17213f]/50" />
        </div>
        <div className="h-1 w-full bg-gray-200 rounded-sm" />
        <div className="h-1 w-5/6 bg-gray-200 rounded-sm" />
        <div className="flex items-center gap-1 mt-0.5">
          <div className="h-1.5 w-1/4 bg-[#17213f] rounded-sm" />
          <div className="flex-1 h-px bg-[#17213f]/50" />
        </div>
        <div className="flex justify-between">
          <div className="h-1.5 w-2/5 bg-gray-700 rounded-sm" />
          <div className="h-1 w-1/4 bg-gray-400 rounded-sm" />
        </div>
        <div className="h-1 w-1/3 bg-[#17213f]/40 rounded-sm" />
        <div className="h-1 w-full bg-gray-200 rounded-sm" />
        <div className="h-1 w-4/5 bg-gray-200 rounded-sm" />
        <div className="flex items-center gap-1 mt-0.5">
          <div className="h-1.5 w-1/5 bg-[#17213f] rounded-sm" />
          <div className="flex-1 h-px bg-[#17213f]/50" />
        </div>
        <div className="h-1 w-full bg-gray-200 rounded-sm" />
        <div className="flex gap-1 flex-wrap">
          <div className="h-1 w-8 bg-gray-300 rounded-sm" />
          <div className="h-1 w-6 bg-gray-300 rounded-sm" />
          <div className="h-1 w-10 bg-gray-300 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

// ── Creative ────────────────────────────────────────────────
function CreativePreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm flex overflow-hidden">
      {/* Purple left stripe */}
      <div className="w-1 bg-purple-700 flex-shrink-0" />
      {/* Light purple sidebar */}
      <div className="w-[32%] bg-purple-50 p-1.5 flex flex-col items-center gap-1">
        {/* Avatar circle */}
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
          <div className="h-2 w-3 bg-white/80 rounded-sm" />
        </div>
        <div className="h-1.5 w-4/5 bg-gray-700 rounded-sm" />
        <div className="h-1 w-3/5 bg-purple-400 rounded-sm" />
        <div className="mt-1 w-full space-y-0.5">
          <div className="h-0.5 w-full bg-purple-400" />
          <div className="h-1 w-full bg-gray-400 rounded-sm" />
          <div className="h-1 w-5/6 bg-gray-400 rounded-sm" />
        </div>
        <div className="mt-0.5 w-full space-y-0.5">
          <div className="h-0.5 w-full bg-purple-400" />
          <div className="h-1 w-full bg-gray-400 rounded-sm" />
          <div className="h-1 w-4/5 bg-gray-400 rounded-sm" />
          <div className="h-1 w-3/5 bg-gray-400 rounded-sm" />
        </div>
      </div>
      {/* Main content */}
      <div className="flex-1 p-1.5 flex flex-col gap-1">
        <div className="h-px bg-purple-500 w-full" />
        <div className="h-1 w-full bg-gray-200 rounded-sm" />
        <div className="h-1 w-5/6 bg-gray-200 rounded-sm" />
        <div className="h-px bg-purple-500 w-full mt-0.5" />
        <div className="flex justify-between">
          <div className="h-1.5 w-2/5 bg-gray-700 rounded-sm" />
        </div>
        <div className="h-1 w-1/3 bg-purple-300 rounded-sm" />
        <div className="h-1 w-full bg-gray-200 rounded-sm" />
        <div className="h-1 w-4/5 bg-gray-200 rounded-sm" />
        <div className="h-px bg-purple-500 w-full mt-0.5" />
        <div className="h-1.5 w-2/5 bg-gray-700 rounded-sm" />
        <div className="h-1 w-1/3 bg-purple-300 rounded-sm" />
        <div className="h-1 w-full bg-gray-200 rounded-sm" />
      </div>
    </div>
  );
}

// ── Minimal ─────────────────────────────────────────────────
function MinimalPreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm p-2 flex flex-col gap-1.5">
      <div className="h-4 w-2/3 bg-gray-900 rounded-sm" />
      <div className="h-1.5 w-1/2 bg-gray-400 rounded-sm" />
      <div className="h-1 w-3/4 bg-gray-300 rounded-sm" />
      <div className="h-px bg-gray-300 w-full mt-1" />
      <div className="mt-0.5">
        <div className="h-1.5 w-1/4 bg-gray-800 rounded-sm mb-0.5" />
        <div className="h-px bg-gray-200 w-full mb-0.5" />
        <div className="h-1 w-full bg-gray-200 rounded-sm" />
        <div className="h-1 w-5/6 bg-gray-200 rounded-sm mt-0.5" />
      </div>
      <div className="mt-0.5">
        <div className="h-1.5 w-1/4 bg-gray-800 rounded-sm mb-0.5" />
        <div className="h-px bg-gray-200 w-full mb-0.5" />
        <div className="flex justify-between">
          <div className="h-1.5 w-2/5 bg-gray-700 rounded-sm" />
          <div className="h-1 w-1/4 bg-gray-300 rounded-sm" />
        </div>
        <div className="h-1 w-1/3 bg-gray-400 rounded-sm mt-0.5" />
        <div className="h-1 w-full bg-gray-200 rounded-sm mt-0.5" />
        <div className="h-1 w-4/5 bg-gray-200 rounded-sm mt-0.5" />
      </div>
      <div className="mt-0.5">
        <div className="h-1.5 w-1/5 bg-gray-800 rounded-sm mb-0.5" />
        <div className="h-px bg-gray-200 w-full mb-0.5" />
        <div className="flex gap-1 flex-wrap">
          <div className="h-1 w-7 bg-gray-300 rounded-sm" />
          <div className="h-1 w-5 bg-gray-300 rounded-sm" />
          <div className="h-1 w-8 bg-gray-300 rounded-sm" />
          <div className="h-1 w-6 bg-gray-300 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

// ── Compact ─────────────────────────────────────────────────
function CompactPreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm p-2 flex flex-col gap-1 overflow-hidden">
      <div className="flex justify-between items-end">
        <div className="h-3 w-2/5 bg-gray-800 rounded-sm" />
        <div className="h-1.5 w-1/3 bg-gray-400 rounded-sm" />
      </div>
      <div className="h-1 w-2/3 bg-gray-300 rounded-sm" />
      <div className="h-0.5 w-full bg-red-800 mt-0.5" />
      <div className="flex items-center gap-0.5 mt-0.5">
        <div className="h-1.5 w-1/4 bg-red-800 rounded-sm" />
        <div className="flex-1 h-px bg-red-800/40" />
      </div>
      <div className="flex justify-between">
        <div className="h-1.5 w-2/5 bg-gray-700 rounded-sm" />
        <div className="h-1 w-1/4 bg-gray-400 rounded-sm" />
      </div>
      <div className="h-1 w-1/4 bg-red-700/50 rounded-sm" />
      <div className="h-1 w-full bg-gray-200 rounded-sm" />
      <div className="h-1 w-5/6 bg-gray-200 rounded-sm" />
      <div className="flex items-center gap-0.5 mt-0.5">
        <div className="h-1.5 w-1/4 bg-red-800 rounded-sm" />
        <div className="flex-1 h-px bg-red-800/40" />
      </div>
      <div className="flex justify-between">
        <div className="h-1.5 w-2/5 bg-gray-700 rounded-sm" />
        <div className="h-1 w-1/4 bg-gray-400 rounded-sm" />
      </div>
      <div className="h-1 w-1/4 bg-red-700/50 rounded-sm" />
      <div className="flex items-center gap-0.5 mt-0.5">
        <div className="h-1.5 w-1/5 bg-red-800 rounded-sm" />
        <div className="flex-1 h-px bg-red-800/40" />
      </div>
      {/* Two-column skills */}
      <div className="grid grid-cols-2 gap-x-2 mt-0.5">
        <div className="space-y-0.5">
          <div className="h-1 w-full bg-gray-200 rounded-sm" />
          <div className="h-1 w-4/5 bg-gray-200 rounded-sm" />
          <div className="h-1 w-full bg-gray-200 rounded-sm" />
        </div>
        <div className="space-y-0.5">
          <div className="h-1 w-full bg-gray-200 rounded-sm" />
          <div className="h-1 w-3/5 bg-gray-200 rounded-sm" />
          <div className="h-1 w-4/5 bg-gray-200 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
