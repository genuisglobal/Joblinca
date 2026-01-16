'use client';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

export default function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  color = 'blue',
}: StatsCardProps) {
  const colorClasses = {
    blue: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    green: 'bg-green-600/20 text-green-400 border-green-600/30',
    yellow: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    red: 'bg-red-600/20 text-red-400 border-red-600/30',
    purple: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  };

  const iconBgClasses = {
    blue: 'bg-blue-600/30',
    green: 'bg-green-600/30',
    yellow: 'bg-yellow-600/30',
    red: 'bg-red-600/30',
    purple: 'bg-purple-600/30',
  };

  return (
    <div
      className={`rounded-xl border p-6 ${colorClasses[color]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 font-medium">{title}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
          {description && (
            <p className="text-sm text-gray-400 mt-1">{description}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={`text-sm font-medium ${
                  trend.isPositive ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {trend.isPositive ? '+' : '-'}
                {Math.abs(trend.value)}%
              </span>
              <span className="text-sm text-gray-500">vs last month</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className={`p-3 rounded-lg ${iconBgClasses[color]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
