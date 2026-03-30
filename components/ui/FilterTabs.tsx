'use client'

interface FilterTabsProps<T extends string> {
  options: { key: T; label: string; count?: number }[]
  value: T
  onChange: (value: T) => void
}

export default function FilterTabs<T extends string>({
  options,
  value,
  onChange,
}: FilterTabsProps<T>) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === opt.key
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className="ml-1.5 text-xs opacity-60">{opt.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
