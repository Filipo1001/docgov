/**
 * Shown by Next.js App Router while the informes server component streams —
 * mainly during requireRole + server-side data fetch.
 * Renders inside the already-mounted dashboard shell (sidebar stays visible).
 */
export default function InformesLoading() {
  return (
    <div className="space-y-4 animate-pulse max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 rounded-xl w-48" />
        <div className="h-9 bg-gray-200 rounded-xl w-32" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-2xl" />
        ))}
      </div>
      {/* Filter tabs */}
      <div className="h-10 bg-gray-200 rounded-xl w-full" />
      {/* Period cards */}
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-200 rounded-2xl" />
      ))}
    </div>
  )
}
