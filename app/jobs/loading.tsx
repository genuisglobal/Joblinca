export default function JobsLoading() {
  return (
    <div className="min-h-screen bg-neutral-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-neutral-800 rounded-lg w-48" />
        {/* Search bar skeleton */}
        <div className="h-14 bg-neutral-900 border border-neutral-800 rounded-xl" />
        {/* Job cards skeleton */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="h-12 w-12 bg-neutral-800 rounded-lg mb-4" />
              <div className="h-6 bg-neutral-800 rounded w-3/4 mb-2" />
              <div className="h-4 bg-neutral-800/60 rounded w-1/2 mb-4" />
              <div className="h-4 bg-neutral-800/60 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
