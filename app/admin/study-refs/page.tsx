import StudyRefsClient from './StudyRefsClient';

export default function AdminStudyRefsPage() {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-white">Study Refs Moderation</h1>
        <p className="text-gray-400">
          Approve or reject AI-suggested study resources that appear after a talent
          misses a quiz question.
        </p>
      </div>
      <StudyRefsClient />
    </div>
  );
}
