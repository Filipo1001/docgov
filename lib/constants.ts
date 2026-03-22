/**
 * Centralized constants for DocGov.
 *
 * Single source of truth for:
 * - Period state labels and colors
 * - Approval state machine
 * - Role → state mapping
 * - File upload constraints
 */

import type { EstadoPeriodo, Rol } from './types'

// ─── Period state display ────────────────────

export const ESTADO_LABEL: Record<EstadoPeriodo, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  revision_asesor: 'Rev. Asesor',
  revision_gobierno: 'Rev. Gobierno',
  revision_hacienda: 'Rev. Hacienda',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  pagado: 'Pagado',
}

export const ESTADO_COLOR: Record<EstadoPeriodo, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviado: 'bg-blue-100 text-blue-700',
  revision_asesor: 'bg-orange-100 text-orange-700',
  revision_gobierno: 'bg-cyan-100 text-cyan-700',
  revision_hacienda: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
  pagado: 'bg-emerald-100 text-emerald-800',
}

// ─── Approval state machine ──────────────────

/**
 * Maps each estado to the next estado on approval.
 * If a state is not here, it cannot be advanced via the normal flow.
 */
export const ESTADO_SIGUIENTE: Partial<Record<EstadoPeriodo, EstadoPeriodo>> = {
  enviado: 'revision_asesor',
  revision_asesor: 'revision_gobierno',
  revision_gobierno: 'revision_hacienda',
  revision_hacienda: 'aprobado',
}

/**
 * Maps each reviewer role to the estado they are responsible for reviewing.
 * Admin is not here because admin can review any pending state.
 */
export const ESTADO_REVISOR: Partial<Record<Rol, EstadoPeriodo>> = {
  supervisor: 'enviado',
  asesor: 'revision_asesor',
  gobierno: 'revision_gobierno',
  hacienda: 'revision_hacienda',
}

/** Who approved this transition (used in toast messages) */
export const LABEL_APROBADOR: Partial<Record<EstadoPeriodo, string>> = {
  enviado: 'Supervisor',
  revision_asesor: 'Asesor jurídico',
  revision_gobierno: 'Gobierno',
  revision_hacienda: 'Hacienda',
}

/** States where a contratista can edit activities and evidence */
export const ESTADOS_EDITABLES: EstadoPeriodo[] = ['borrador', 'rechazado']

/** States where a reviewer can approve or reject */
export const ESTADOS_EN_REVISION: EstadoPeriodo[] = [
  'enviado',
  'revision_asesor',
  'revision_gobierno',
  'revision_hacienda',
]

// ─── Month names ──────────────────────────────

export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const

// ─── File upload constraints ──────────────────

export const FILE_UPLOAD = {
  TIPOS_PERMITIDOS: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const,
  EXTENSIONES: ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const,
  TAMANO_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
  TAMANO_MAX_LABEL: '10 MB',
} as const

// ─── Sidebar navigation per role ─────────────

export const MENU_POR_ROL: Record<Rol, Array<{ href: string; label: string; icon: string }>> = {
  admin: [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/dashboard/contratos', label: 'Contratos', icon: '📄' },
    { href: '/dashboard/aprobaciones', label: 'Aprobaciones', icon: '✅' },
  ],
  supervisor: [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/dashboard/contratos', label: 'Mis contratos', icon: '📄' },
    { href: '/dashboard/aprobaciones', label: 'Por aprobar', icon: '✅' },
  ],
  contratista: [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/dashboard/contratos', label: 'Mis contratos', icon: '📄' },
  ],
  asesor: [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/dashboard/aprobaciones', label: 'Por aprobar', icon: '✅' },
  ],
  gobierno: [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/dashboard/aprobaciones', label: 'Por aprobar', icon: '✅' },
  ],
  hacienda: [
    { href: '/dashboard', label: 'Inicio', icon: '🏠' },
    { href: '/dashboard/aprobaciones', label: 'Por aprobar', icon: '✅' },
  ],
}

// ─── Pending review state per role ──────────

/** The estado a role sees in their approval queue */
export const ESTADO_COLA_POR_ROL: Partial<Record<Rol, EstadoPeriodo | EstadoPeriodo[]>> = {
  supervisor: 'enviado',
  asesor: 'revision_asesor',
  gobierno: 'revision_gobierno',
  hacienda: 'revision_hacienda',
  admin: ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda'],
}
