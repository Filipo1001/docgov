/**
 * Dashboard loading.tsx — shown by Next.js App Router while any dashboard
 * page segment is being fetched (RSC streaming / server component delay).
 *
 * Rendered inside the dashboard layout shell (sidebar + header stay visible).
 * Keeps the UI responsive during navigation rather than showing a blank page.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-2xl" />
        ))}
      </div>
      <div className="h-64 bg-gray-200 rounded-2xl" />
      <div className="h-32 bg-gray-200 rounded-2xl" />
    </div>
  )
}
