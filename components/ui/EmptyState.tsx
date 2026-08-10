'use client'

import Link from 'next/link'
import Icono from './Icono'
import type { LucideIcon } from '@/lib/iconos'

interface EmptyStateProps {
  /** Icono del catálogo. Ver lib/iconos.ts. */
  icono: LucideIcon
  title: string
  description?: string
  action?: { href: string; label: string }
}

export default function EmptyState({ icono, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-50 text-gray-300 mb-4">
        <Icono glifo={icono} tamano="lg" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
