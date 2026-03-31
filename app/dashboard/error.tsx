'use client'

/**
 * Dashboard error boundary — catches errors within the dashboard layout.
 * More contextual than the root boundary: shows the sidebar chrome is still alive.
 */

import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[DashboardError]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
        <span className="text-red-600 text-xl font-bold">!</span>
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Error al cargar esta página</h2>
        <p className="text-sm text-gray-500">
          {error.message || 'Ocurrió un error inesperado. Intenta de nuevo.'}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  )
}
