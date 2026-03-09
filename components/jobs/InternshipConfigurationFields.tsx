'use client';

import {
  getEligibleRolesLabel,
  getInternshipTrackPostingPreset,
  type InternshipRequirementsFormState,
} from '@/lib/internship-posting';
import { type InternshipTrack } from '@/lib/opportunities';

export {
  applyInternshipTrackPreset,
  buildInternshipRequirementsPayload,
  createEmptyInternshipRequirementsFormState,
  internshipRequirementsFormStateFromPayload,
} from '@/lib/internship-posting';

interface Props {
  jobType: string;
  visibility: string;
  internshipTrack: string;
  requirements: InternshipRequirementsFormState;
  onInternshipTrackChange: (next: InternshipTrack | '') => void;
  onRequirementsChange: (next: InternshipRequirementsFormState) => void;
}

export default function InternshipConfigurationFields({
  jobType,
  visibility,
  internshipTrack,
  requirements,
  onInternshipTrackChange,
  onRequirementsChange,
}: Props) {
  if (jobType !== 'internship') {
    return null;
  }

  const updateField = <K extends keyof InternshipRequirementsFormState>(
    key: K,
    value: InternshipRequirementsFormState[K]
  ) => {
    onRequirementsChange({
      ...requirements,
      [key]: value,
    });
  };

  const preset = getInternshipTrackPostingPreset(internshipTrack as InternshipTrack | '');
  const eligibleRolesLabel =
    internshipTrack === 'education' || internshipTrack === 'professional'
      ? getEligibleRolesLabel('internship', internshipTrack, visibility)
      : '';

  return (
    <div className="border-t border-gray-600 pt-4 mt-4 space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-200">Internship Setup</h3>
        <p className="text-sm text-gray-400 mt-1">
          Pick the internship track first. Joblinca uses it to set applicant targeting, ATS pipeline defaults, and matching logic.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(['education', 'professional'] as const).map((track) => {
          const optionPreset = getInternshipTrackPostingPreset(track);
          const isSelected = internshipTrack === track;

          return (
            <button
              key={track}
              type="button"
              onClick={() => onInternshipTrackChange(track)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-700 bg-gray-800/60 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{optionPreset?.label}</p>
                  <p className="mt-1 text-sm text-gray-400">{optionPreset?.summary}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isSelected
                      ? 'bg-blue-500/20 text-blue-200'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {isSelected ? 'Selected' : 'Choose'}
                </span>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                Default ATS pipeline: {optionPreset?.pipelineLabel}
              </p>
            </button>
          );
        })}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300">Internship Type</label>
        <select
          value={internshipTrack}
          onChange={(event) => onInternshipTrackChange(event.target.value as InternshipTrack | '')}
          className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
        >
          <option value="">Select internship type</option>
          <option value="education">Educational Internship</option>
          <option value="professional">Professional Internship</option>
        </select>
      </div>

      {preset && (
        <div className="rounded-xl border border-blue-700/60 bg-blue-900/20 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-blue-100">{preset.label}</p>
            <p className="mt-1 text-sm text-blue-200">{preset.recruiterHint}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-blue-800/70 bg-slate-950/30 p-3">
              <p className="text-xs uppercase tracking-wide text-blue-300">Eligible Profiles</p>
              <p className="mt-1 text-sm text-white">{eligibleRolesLabel}</p>
            </div>
            <div className="rounded-lg border border-blue-800/70 bg-slate-950/30 p-3">
              <p className="text-xs uppercase tracking-wide text-blue-300">Default ATS Pipeline</p>
              <p className="mt-1 text-sm text-white">{preset.pipelineLabel}</p>
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {preset.highlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-lg border border-blue-800/50 bg-slate-950/20 px-3 py-2 text-sm text-blue-100"
              >
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {internshipTrack === 'education' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              Academic Placement Filters
            </h4>
            <p className="mt-1 text-xs text-gray-400">
              Use these to target the schools, levels, and departments eligible for this internship.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Target Schools</label>
              <input
                type="text"
                value={requirements.allowedSchools}
                onChange={(event) => updateField('allowedSchools', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="University of Buea, ENSPY"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">School Years / Levels</label>
              <input
                type="text"
                value={requirements.allowedSchoolYears}
                onChange={(event) => updateField('allowedSchoolYears', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="3rd year, final year"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Fields of Study</label>
              <input
                type="text"
                value={requirements.allowedFieldsOfStudy}
                onChange={(event) => updateField('allowedFieldsOfStudy', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="Computer Science, Marketing"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Academic Calendar</label>
              <input
                type="text"
                value={requirements.academicCalendar}
                onChange={(event) => updateField('academicCalendar', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="June - August"
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              Placement Controls
            </h4>
            <p className="mt-1 text-xs text-gray-400">
              These settings define whether the internship depends on school paperwork or supervision.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2">
              <input
                type="checkbox"
                checked={requirements.schoolRequired}
                onChange={(event) => updateField('schoolRequired', event.target.checked)}
              />
              <span className="text-sm text-gray-200">School enrollment required</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2">
              <input
                type="checkbox"
                checked={requirements.creditBearing}
                onChange={(event) => updateField('creditBearing', event.target.checked)}
              />
              <span className="text-sm text-gray-200">Credit-bearing internship</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2">
              <input
                type="checkbox"
                checked={requirements.requiresSchoolConvention}
                onChange={(event) => updateField('requiresSchoolConvention', event.target.checked)}
              />
              <span className="text-sm text-gray-200">Requires school convention</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2">
              <input
                type="checkbox"
                checked={requirements.academicSupervisorRequired}
                onChange={(event) => updateField('academicSupervisorRequired', event.target.checked)}
              />
              <span className="text-sm text-gray-200">Academic supervisor required</span>
            </label>
          </div>
        </div>
      )}

      {internshipTrack === 'professional' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              Work-Readiness Filters
            </h4>
            <p className="mt-1 text-xs text-gray-400">
              Use these fields to define how much proof of work, time availability, and execution readiness you expect.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Fields of Study</label>
              <input
                type="text"
                value={requirements.allowedFieldsOfStudy}
                onChange={(event) => updateField('allowedFieldsOfStudy', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="Software Engineering, Finance"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Weekly Availability</label>
              <input
                type="text"
                value={requirements.expectedWeeklyAvailability}
                onChange={(event) => updateField('expectedWeeklyAvailability', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="30-40 hours / week"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Minimum Projects</label>
              <input
                type="number"
                min="0"
                value={requirements.minimumProjectCount}
                onChange={(event) => updateField('minimumProjectCount', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Minimum Badges</label>
              <input
                type="number"
                min="0"
                value={requirements.minimumBadgeCount}
                onChange={(event) => updateField('minimumBadgeCount', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Stipend Type</label>
              <input
                type="text"
                value={requirements.stipendType}
                onChange={(event) => updateField('stipendType', event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
                placeholder="Monthly stipend, transport allowance"
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              Hiring Controls
            </h4>
            <p className="mt-1 text-xs text-gray-400">
              Enable these when the role depends on portfolio evidence or may convert into a full-time hire.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2">
              <input
                type="checkbox"
                checked={requirements.portfolioRequired}
                onChange={(event) => updateField('portfolioRequired', event.target.checked)}
              />
              <span className="text-sm text-gray-200">Portfolio or work sample required</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2">
              <input
                type="checkbox"
                checked={requirements.conversionPossible}
                onChange={(event) => updateField('conversionPossible', event.target.checked)}
              />
              <span className="text-sm text-gray-200">Can convert to full-time</span>
            </label>
          </div>
        </div>
      )}

      {internshipTrack && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Graduation Year Min</label>
            <input
              type="number"
              value={requirements.graduationYearMin}
              onChange={(event) => updateField('graduationYearMin', event.target.value)}
              className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
              placeholder="2025"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Graduation Year Max</label>
            <input
              type="number"
              value={requirements.graduationYearMax}
              onChange={(event) => updateField('graduationYearMax', event.target.value)}
              className="mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500"
              placeholder="2028"
            />
          </div>
        </div>
      )}
    </div>
  );
}
