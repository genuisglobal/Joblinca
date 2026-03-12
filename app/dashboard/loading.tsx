export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-neutral-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="h-8 bg-neutral-800 rounded-lg w-48" />
        <div className="h-4 bg-neutral-800/60 rounded w-72" />

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="h-4 bg-neutral-800 rounded w-20 mb-3" />
              <div className="h-8 bg-neutral-800 rounded w-16" />
            </div>
          ))}
        </div>

        {/* Content skeleton */}
        <div className="grid md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="h-5 bg-neutral-800 rounded w-32 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-4 bg-neutral-800/60 rounded w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
