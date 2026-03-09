'use client';

interface ChartBucket {
  key: string;
  label: string;
}

interface ChartSeries<T extends ChartBucket> {
  key: Exclude<keyof T, 'key' | 'label'> & string;
  label: string;
  colorClass: string;
}

export default function RecruiterAnalyticsChart<T extends ChartBucket>({
  title,
  description,
  buckets,
  series,
}: {
  title: string;
  description: string;
  buckets: T[];
  series: ChartSeries<T>[];
}) {
  const maxValue = Math.max(
    1,
    ...buckets.flatMap((bucket) => series.map((item) => Number(bucket[item.key]) || 0))
  );

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">
            {title}
          </h3>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {series.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-xs text-gray-400">
              <span className={`h-2.5 w-2.5 rounded-full ${item.colorClass}`} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max items-end gap-4">
          {buckets.map((bucket) => (
            <div key={bucket.key} className="flex w-16 flex-col items-center gap-2">
              <div className="flex h-28 items-end gap-1">
                {series.map((item) => {
                  const value = Number(bucket[item.key]) || 0;
                  const height = value > 0 ? Math.max(8, (value / maxValue) * 112) : 4;

                  return (
                    <div
                      key={`${bucket.key}-${item.key}`}
                      className={`w-3 rounded-t ${item.colorClass}`}
                      style={{ height: `${height}px` }}
                      title={`${bucket.label}: ${item.label} ${value}`}
                    />
                  );
                })}
              </div>
              <div className="text-center">
                <p className="text-[11px] text-gray-500">{bucket.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
