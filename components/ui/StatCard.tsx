'use client'

interface StatCardProps {
  label: string
  value: number | string
  icon?: string
  color?: 'emerald' | 'blue' | 'amber' | 'red' | 'indigo' | 'gray'
}

const colorClasses: Record<string, { bg: string; text: string; icon: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'bg-emerald-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'bg-blue-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'bg-amber-100' },
  red: { bg: 'bg-red-50', text: 'text-red-700', icon: 'bg-red-100' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'bg-indigo-100' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-700', icon: 'bg-gray-100' },
}

export default function StatCard({ label, value, icon, color = 'gray' }: StatCardProps) {
  const c = colorClasses[color]
  return (
    <div className={`${c.bg} rounded-2xl p-5 border border-transparent`}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`w-10 h-10 ${c.icon} rounded-xl flex items-center justify-center text-lg`}>
            {icon}
          </div>
        )}
        <div>
          <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  )
}
