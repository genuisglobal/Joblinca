'use client';

interface TemplateThumbnailProps {
  template: 'professional' | 'modern';
  selected: boolean;
  onClick: () => void;
}

export default function TemplateThumbnail({ template, selected, onClick }: TemplateThumbnailProps) {
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
      {/* Mini preview illustration */}
      <div className="absolute inset-0 p-3">
        {template === 'professional' ? (
          <ProfessionalPreview />
        ) : (
          <ModernPreview />
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/90 py-2 px-3">
        <p className="text-sm font-medium text-gray-200">
          {template === 'professional' ? 'Professional' : 'Modern'}
        </p>
        <p className="text-xs text-gray-400">
          {template === 'professional'
            ? 'Clean single-column layout'
            : 'Two-column with sidebar'}
        </p>
      </div>
      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

function ProfessionalPreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm p-2 flex flex-col gap-1.5">
      <div className="h-3 w-2/3 bg-gray-800 rounded-sm" />
      <div className="h-1.5 w-1/2 bg-gray-300 rounded-sm" />
      <div className="h-px bg-blue-400 w-full mt-1" />
      <div className="space-y-1 mt-1">
        <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
        <div className="h-1.5 w-5/6 bg-gray-200 rounded-sm" />
        <div className="h-1.5 w-4/6 bg-gray-200 rounded-sm" />
      </div>
      <div className="h-px bg-blue-400 w-full mt-1" />
      <div className="space-y-1 mt-1">
        <div className="h-2 w-1/3 bg-gray-700 rounded-sm" />
        <div className="h-1.5 w-full bg-gray-200 rounded-sm" />
        <div className="h-1.5 w-3/4 bg-gray-200 rounded-sm" />
      </div>
      <div className="h-px bg-blue-400 w-full mt-1" />
      <div className="flex gap-1 mt-1 flex-wrap">
        <div className="h-1.5 w-8 bg-gray-300 rounded-sm" />
        <div className="h-1.5 w-6 bg-gray-300 rounded-sm" />
        <div className="h-1.5 w-10 bg-gray-300 rounded-sm" />
      </div>
    </div>
  );
}

function ModernPreview() {
  return (
    <div className="w-full h-full bg-white rounded-sm flex overflow-hidden">
      <div className="w-1/3 bg-gray-800 p-1.5 flex flex-col gap-1">
        <div className="h-2.5 w-full bg-gray-500 rounded-sm" />
        <div className="h-1 w-2/3 bg-gray-600 rounded-sm" />
        <div className="mt-1 space-y-0.5">
          <div className="h-1 w-full bg-gray-600 rounded-sm" />
          <div className="h-1 w-4/5 bg-gray-600 rounded-sm" />
        </div>
        <div className="mt-1 space-y-0.5">
          <div className="h-1 w-full bg-gray-600 rounded-sm" />
          <div className="h-1 w-3/5 bg-gray-600 rounded-sm" />
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
          <div className="h-1.5 w-3/4 bg-gray-200 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
