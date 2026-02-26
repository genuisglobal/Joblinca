'use client';

interface ResumeProgressBarProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
}

export default function ResumeProgressBar({ currentStep, totalSteps, labels }: ResumeProgressBarProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-400">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <span className="text-sm font-medium text-gray-300">
          {labels[currentStep]}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
