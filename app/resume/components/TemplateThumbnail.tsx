'use client';

import type { ResumeData } from '@/lib/resume';

type Template = ResumeData['template'];

interface TemplateThumbnailProps {
  template: Template;
  selected: boolean;
  onClick: () => void;
  /** When provided, thumbnails render the user's real content instead of placeholder bars */
  data?: ResumeData;
}

const META: Record<Template, { label: string; desc: string }> = {
  professional: { label: 'Professional', desc: 'Classic single-column' },
  modern:       { label: 'Modern',       desc: 'Dark sidebar layout' },
  executive:    { label: 'Executive',    desc: 'Navy header, Times Roman' },
  creative:     { label: 'Creative',     desc: 'Purple accent sidebar' },
  minimal:      { label: 'Minimal',      desc: 'Clean black & white, ATS' },
  compact:      { label: 'Compact',      desc: 'Dense, fits more content' },
};

interface PreviewContent {
  name: string;
  title: string;
  contact: string;
  summary: string;
  expRole: string;
  expCompany: string;
  expDates: string;
  expSnippet: string;
  skills: string[];
  initials: string;
}

function buildContent(data?: ResumeData): PreviewContent {
  const name = data?.fullName?.trim() || 'Alex Morgan';
  const title = data?.title?.trim() || 'Product Designer';
  const summary =
    data?.summary?.trim() ||
    'Experienced professional delivering measurable results across teams and projects.';
  const exp = data?.experience?.find((e) => e.role?.trim() || e.company?.trim());
  const expRole = exp?.role?.trim() || 'Senior Role';
  const expCompany = exp?.company?.trim() || 'Company Inc.';
  const endLabel = exp?.current ? 'Present' : exp?.endDate?.trim() || '';
  const expDates = exp
    ? [exp.startDate?.trim(), endLabel].filter(Boolean).join(' – ') || '2021 – Present'
    : '2021 – Present';
  const expSnippet =
    exp?.description?.trim().split('\n')[0]?.replace(/^[•\-*]\s*/, '') ||
    'Led key initiatives and improved outcomes.';
  const skills = (data?.skills?.length
    ? data.skills
    : ['Leadership', 'Strategy', 'Analytics', 'Communication']
  ).slice(0, 5);
  const contact =
    [data?.email?.trim(), data?.location?.trim()].filter(Boolean).join(' · ') ||
    'you@email.com · City';
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return { name, title, contact, summary, expRole, expCompany, expDates, expSnippet, skills, initials };
}

export default function TemplateThumbnail({ template, selected, onClick, data }: TemplateThumbnailProps) {
  const { label, desc } = META[template];
  const content = buildContent(data);
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
        <Preview template={template} c={content} />
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

function Preview({ template, c }: { template: Template; c: PreviewContent }) {
  switch (template) {
    case 'professional': return <ProfessionalPreview c={c} />;
    case 'modern':       return <ModernPreview c={c} />;
    case 'executive':    return <ExecutivePreview c={c} />;
    case 'creative':     return <CreativePreview c={c} />;
    case 'minimal':      return <MinimalPreview c={c} />;
    case 'compact':      return <CompactPreview c={c} />;
  }
}

// Shared tiny-typography helpers
const body = 'text-[4px] leading-[6px] text-gray-500';
const sectionGap = 'mt-1';

function SkillChips({ skills, chipClass }: { skills: string[]; chipClass: string }) {
  return (
    <div className="flex gap-0.5 flex-wrap overflow-hidden max-h-[16px]">
      {skills.map((skill) => (
        <span key={skill} className={`text-[3.5px] leading-[5px] px-0.5 rounded-sm whitespace-nowrap ${chipClass}`}>
          {skill}
        </span>
      ))}
    </div>
  );
}

// ── Professional ────────────────────────────────────────────
function ProfessionalPreview({ c }: { c: PreviewContent }) {
  return (
    <div className="w-full h-full bg-white rounded-sm p-2 flex flex-col text-left overflow-hidden">
      <p className="text-[7px] leading-[9px] font-bold text-gray-900 truncate">{c.name}</p>
      <p className="text-[4.5px] leading-[6px] text-gray-500 truncate">{c.title}</p>
      <p className="text-[3.5px] leading-[5px] text-gray-400 truncate">{c.contact}</p>
      <div className="h-px bg-blue-500 w-full mt-1" />
      <p className="text-[4px] leading-[5px] font-semibold text-blue-700 uppercase mt-0.5">Summary</p>
      <p className={`${body} max-h-[12px] overflow-hidden`}>{c.summary}</p>
      <div className={`h-px bg-blue-500 w-full ${sectionGap}`} />
      <p className="text-[4px] leading-[5px] font-semibold text-blue-700 uppercase mt-0.5">Experience</p>
      <p className="text-[4px] leading-[6px] font-semibold text-gray-700 truncate">{c.expRole} · {c.expCompany}</p>
      <p className="text-[3.5px] leading-[5px] text-gray-400 truncate">{c.expDates}</p>
      <p className={`${body} max-h-[12px] overflow-hidden`}>{c.expSnippet}</p>
      <div className={`h-px bg-blue-500 w-full ${sectionGap}`} />
      <p className="text-[4px] leading-[5px] font-semibold text-blue-700 uppercase mt-0.5">Skills</p>
      <SkillChips skills={c.skills} chipClass="bg-gray-200 text-gray-600" />
    </div>
  );
}

// ── Modern ──────────────────────────────────────────────────
function ModernPreview({ c }: { c: PreviewContent }) {
  return (
    <div className="w-full h-full bg-white rounded-sm flex overflow-hidden text-left">
      <div className="w-[34%] bg-gray-800 p-1.5 flex flex-col overflow-hidden">
        <p className="text-[5px] leading-[7px] font-bold text-white break-words">{c.name}</p>
        <p className="text-[3.5px] leading-[5px] text-blue-300 break-words">{c.title}</p>
        <div className="h-0.5 w-full bg-blue-400 mt-1" />
        <p className="text-[3.5px] leading-[5px] text-gray-300 mt-0.5 break-words max-h-[16px] overflow-hidden">{c.contact}</p>
        <div className="h-0.5 w-full bg-blue-400 mt-1" />
        <p className="text-[3.5px] leading-[5px] font-semibold text-white uppercase mt-0.5">Skills</p>
        <div className="overflow-hidden">
          {c.skills.slice(0, 4).map((skill) => (
            <p key={skill} className="text-[3.5px] leading-[5px] text-gray-300 truncate">{skill}</p>
          ))}
        </div>
      </div>
      <div className="flex-1 p-1.5 flex flex-col overflow-hidden">
        <p className="text-[4px] leading-[5px] font-semibold text-blue-600 uppercase">Summary</p>
        <p className={`${body} max-h-[12px] overflow-hidden`}>{c.summary}</p>
        <div className="h-px bg-blue-400 w-full mt-1" />
        <p className="text-[4px] leading-[5px] font-semibold text-blue-600 uppercase mt-0.5">Experience</p>
        <p className="text-[4px] leading-[6px] font-semibold text-gray-700 truncate">{c.expRole}</p>
        <p className="text-[3.5px] leading-[5px] text-gray-400 truncate">{c.expCompany} · {c.expDates}</p>
        <p className={`${body} max-h-[18px] overflow-hidden`}>{c.expSnippet}</p>
      </div>
    </div>
  );
}

// ── Executive ───────────────────────────────────────────────
function ExecutivePreview({ c }: { c: PreviewContent }) {
  return (
    <div className="w-full h-full bg-white rounded-sm flex flex-col overflow-hidden font-serif">
      <div className="h-0.5 w-full bg-yellow-500 flex-shrink-0" />
      <div className="bg-[#17213f] flex flex-col items-center justify-center flex-shrink-0 px-2 py-1.5 text-center">
        <p className="text-[6px] leading-[8px] font-bold text-white truncate w-full">{c.name}</p>
        <p className="text-[4px] leading-[6px] text-blue-200 truncate w-full">{c.title}</p>
        <p className="text-[3.5px] leading-[5px] text-blue-100/70 truncate w-full">{c.contact}</p>
      </div>
      <div className="h-px w-4/5 self-center bg-yellow-500/60 flex-shrink-0" />
      <div className="flex-1 p-2 flex flex-col overflow-hidden text-left">
        <div className="flex items-center gap-1">
          <p className="text-[4px] leading-[5px] font-semibold text-[#17213f] uppercase">Profile</p>
          <div className="flex-1 h-px bg-[#17213f]/50" />
        </div>
        <p className={`${body} max-h-[12px] overflow-hidden`}>{c.summary}</p>
        <div className="flex items-center gap-1 mt-1">
          <p className="text-[4px] leading-[5px] font-semibold text-[#17213f] uppercase">Experience</p>
          <div className="flex-1 h-px bg-[#17213f]/50" />
        </div>
        <div className="flex justify-between gap-1">
          <p className="text-[4px] leading-[6px] font-semibold text-gray-700 truncate">{c.expRole}</p>
          <p className="text-[3.5px] leading-[6px] text-gray-400 whitespace-nowrap">{c.expDates}</p>
        </div>
        <p className="text-[3.5px] leading-[5px] text-[#17213f]/70 truncate">{c.expCompany}</p>
        <p className={`${body} max-h-[12px] overflow-hidden`}>{c.expSnippet}</p>
        <div className="flex items-center gap-1 mt-1">
          <p className="text-[4px] leading-[5px] font-semibold text-[#17213f] uppercase">Skills</p>
          <div className="flex-1 h-px bg-[#17213f]/50" />
        </div>
        <SkillChips skills={c.skills} chipClass="bg-gray-200 text-gray-600" />
      </div>
    </div>
  );
}

// ── Creative ────────────────────────────────────────────────
function CreativePreview({ c }: { c: PreviewContent }) {
  return (
    <div className="w-full h-full bg-white rounded-sm flex overflow-hidden text-left">
      <div className="w-1 bg-purple-700 flex-shrink-0" />
      <div className="w-[34%] bg-purple-50 p-1.5 flex flex-col items-center overflow-hidden">
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0">
          <span className="text-[6px] font-bold text-white">{c.initials}</span>
        </div>
        <p className="text-[4.5px] leading-[6px] font-bold text-gray-800 text-center break-words mt-0.5 w-full">{c.name}</p>
        <p className="text-[3.5px] leading-[5px] text-purple-600 text-center break-words w-full">{c.title}</p>
        <div className="w-full mt-1">
          <div className="h-0.5 w-full bg-purple-400" />
          <p className="text-[3.5px] leading-[5px] font-semibold text-purple-700 uppercase mt-0.5">Skills</p>
          <div className="overflow-hidden">
            {c.skills.slice(0, 4).map((skill) => (
              <p key={skill} className="text-[3.5px] leading-[5px] text-gray-500 truncate">{skill}</p>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 p-1.5 flex flex-col overflow-hidden">
        <p className="text-[4px] leading-[5px] font-semibold text-purple-600 uppercase">About</p>
        <p className={`${body} max-h-[12px] overflow-hidden`}>{c.summary}</p>
        <div className="h-px bg-purple-500 w-full mt-1" />
        <p className="text-[4px] leading-[5px] font-semibold text-purple-600 uppercase mt-0.5">Experience</p>
        <p className="text-[4px] leading-[6px] font-semibold text-gray-700 truncate">{c.expRole}</p>
        <p className="text-[3.5px] leading-[5px] text-purple-400 truncate">{c.expCompany} · {c.expDates}</p>
        <p className={`${body} max-h-[18px] overflow-hidden`}>{c.expSnippet}</p>
      </div>
    </div>
  );
}

// ── Minimal ─────────────────────────────────────────────────
function MinimalPreview({ c }: { c: PreviewContent }) {
  return (
    <div className="w-full h-full bg-white rounded-sm p-2 flex flex-col overflow-hidden text-left">
      <p className="text-[8px] leading-[10px] font-bold text-gray-900 truncate">{c.name}</p>
      <p className="text-[4.5px] leading-[6px] text-gray-500 truncate">{c.title}</p>
      <p className="text-[3.5px] leading-[5px] text-gray-400 truncate">{c.contact}</p>
      <div className="h-px bg-gray-300 w-full mt-1" />
      <p className="text-[4px] leading-[5px] font-semibold text-gray-800 uppercase mt-0.5">Summary</p>
      <div className="h-px bg-gray-200 w-full" />
      <p className={`${body} max-h-[12px] overflow-hidden`}>{c.summary}</p>
      <p className="text-[4px] leading-[5px] font-semibold text-gray-800 uppercase mt-1">Experience</p>
      <div className="h-px bg-gray-200 w-full" />
      <div className="flex justify-between gap-1">
        <p className="text-[4px] leading-[6px] font-semibold text-gray-700 truncate">{c.expRole}</p>
        <p className="text-[3.5px] leading-[6px] text-gray-400 whitespace-nowrap">{c.expDates}</p>
      </div>
      <p className="text-[3.5px] leading-[5px] text-gray-500 truncate">{c.expCompany}</p>
      <p className={`${body} max-h-[12px] overflow-hidden`}>{c.expSnippet}</p>
      <p className="text-[4px] leading-[5px] font-semibold text-gray-800 uppercase mt-1">Skills</p>
      <div className="h-px bg-gray-200 w-full" />
      <p className="text-[3.5px] leading-[5px] text-gray-500 truncate">{c.skills.join(' · ')}</p>
    </div>
  );
}

// ── Compact ─────────────────────────────────────────────────
function CompactPreview({ c }: { c: PreviewContent }) {
  return (
    <div className="w-full h-full bg-white rounded-sm p-2 flex flex-col overflow-hidden text-left">
      <div className="flex justify-between items-end gap-1">
        <p className="text-[6px] leading-[8px] font-bold text-gray-900 truncate">{c.name}</p>
        <p className="text-[3.5px] leading-[6px] text-gray-400 truncate">{c.title}</p>
      </div>
      <p className="text-[3.5px] leading-[5px] text-gray-400 truncate">{c.contact}</p>
      <div className="h-0.5 w-full bg-red-800 mt-0.5" />
      <div className="flex items-center gap-0.5 mt-0.5">
        <p className="text-[4px] leading-[5px] font-semibold text-red-800 uppercase">Summary</p>
        <div className="flex-1 h-px bg-red-800/40" />
      </div>
      <p className={`${body} max-h-[12px] overflow-hidden`}>{c.summary}</p>
      <div className="flex items-center gap-0.5 mt-0.5">
        <p className="text-[4px] leading-[5px] font-semibold text-red-800 uppercase">Experience</p>
        <div className="flex-1 h-px bg-red-800/40" />
      </div>
      <div className="flex justify-between gap-1">
        <p className="text-[4px] leading-[6px] font-semibold text-gray-700 truncate">{c.expRole}</p>
        <p className="text-[3.5px] leading-[6px] text-gray-400 whitespace-nowrap">{c.expDates}</p>
      </div>
      <p className="text-[3.5px] leading-[5px] text-red-700/70 truncate">{c.expCompany}</p>
      <p className={`${body} max-h-[10px] overflow-hidden`}>{c.expSnippet}</p>
      <div className="flex items-center gap-0.5 mt-0.5">
        <p className="text-[4px] leading-[5px] font-semibold text-red-800 uppercase">Skills</p>
        <div className="flex-1 h-px bg-red-800/40" />
      </div>
      <div className="grid grid-cols-2 gap-x-2 overflow-hidden">
        {c.skills.slice(0, 4).map((skill) => (
          <p key={skill} className="text-[3.5px] leading-[5px] text-gray-500 truncate">{skill}</p>
        ))}
      </div>
    </div>
  );
}
