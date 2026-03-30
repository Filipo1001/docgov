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
  aprobado_asesor: 'Aprobado por asesor',
  aprobado: 'Aprobado',
  radicado: 'Radicado',
  rechazado: 'Rechazado',
}

export const ESTADO_COLOR: Record<EstadoPeriodo, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviado: 'bg-blue-100 text-blue-700',
  aprobado_asesor: 'bg-indigo-100 text-indigo-700',
  aprobado: 'bg-green-100 text-green-700',
  radicado: 'bg-emerald-100 text-emerald-800',
  rechazado: 'bg-red-100 text-red-700',
}

// ─── Approval state machine ──────────────────

/**
 * New simplified flow:
 *   borrador → enviado       (contratista submits)
 *   enviado → aprobado       (secretary approves — asesor pre-approval is just a flag)
 *   aprobado → radicado      (asesor registers physical filing)
 *
 * Pre-approval by asesor: stored in `preaprobaciones` table, does NOT change period state.
 * Secretary rejection: clears preaprobaciones, sets motivo_rechazo, state stays `enviado`.
 * Asesor rejection: state → `rechazado` (back to contratista).
 */
export const ESTADO_SIGUIENTE: Partial<Record<EstadoPeriodo, EstadoPeriodo>> = {
  enviado: 'aprobado',
}

/**
 * Maps each reviewer role to the estado they review.
 * - supervisor (secretaria) reviews 'enviado' periods
 * - asesor pre-approves 'enviado' periods (but doesn't change state)
 */
export const ESTADO_REVISOR: Partial<Record<Rol, EstadoPeriodo>> = {
  supervisor: 'enviado',
}

/** States where a contratista can edit activities and evidence */
export const ESTADOS_EDITABLES: EstadoPeriodo[] = ['borrador', 'rechazado']

/** States where a reviewer can approve or reject */
export const ESTADOS_EN_REVISION: EstadoPeriodo[] = ['enviado']

// ─── Month names ──────────────────────────────

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

// ─── File upload constraints ──────────────────

export const FILE_UPLOAD = {
  TIPOS_IMAGEN: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const,
  TIPOS_DOCUMENTO: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  EXTENSIONES_IMAGEN: ['jpg', 'jpeg', 'png', 'webp', 'heic'] as const,
  EXTENSIONES_DOCUMENTO: ['pdf', 'jpg', 'jpeg', 'png'] as const,
  TAMANO_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
  TAMANO_MAX_LABEL: '10 MB',
} as const

// ─── Current month helper ────────────────────

export function getMesActual() {
  const now = new Date()
  return { mes: MESES[now.getMonth()], anio: now.getFullYear(), mesIndex: now.getMonth() }
}

// ─── Sidebar navigation per role ─────────────

export function getMenuPorRol(rol: Rol): Array<{ href: string; label: string; icon: string }> {
  const { mes, anio } = getMesActual()
  const mesLabel = `${mes} ${anio}`

  const menus: Record<Rol, Array<{ href: string; label: string; icon: string }>> = {
    admin: [
      { href: '/dashboard', label: 'Inicio', icon: '🏠' },
      { href: '/dashboard/admin/usuarios', label: 'Usuarios', icon: '👥' },
      { href: '/dashboard/contratos', label: 'Contratos', icon: '📄' },
      { href: '/dashboard/informes', label: mesLabel, icon: '📋' },
      { href: '/dashboard/admin/municipio', label: 'Municipio', icon: '🏛️' },
      { href: '/dashboard/configuracion', label: 'Configuración', icon: '⚙️' },
    ],
    asesor: [
      { href: '/dashboard', label: 'Inicio', icon: '🏠' },
      { href: '/dashboard/contratistas', label: 'Contratistas', icon: '👥' },
      { href: '/dashboard/informes', label: mesLabel, icon: '📋' },
      { href: '/dashboard/configuracion', label: 'Configuración', icon: '⚙️' },
    ],
    supervisor: [
      { href: '/dashboard', label: 'Inicio', icon: '🏠' },
      { href: '/dashboard/colaboradores', label: 'Colaboradores', icon: '👥' },
      { href: '/dashboard/informes', label: mesLabel, icon: '📋' },
      { href: '/dashboard/configuracion', label: 'Configuración', icon: '⚙️' },
    ],
    contratista: [
      { href: '/dashboard', label: 'Inicio', icon: '🏠' },
      { href: '/dashboard/contratos', label: 'Mis contratos', icon: '📄' },
      { href: '/dashboard/configuracion', label: 'Configuración', icon: '⚙️' },
    ],
  }

  return menus[rol] ?? menus.contratista
}

// ─── Pending review state per role ──────────

/** The estado a role sees in their pending queue */
export const ESTADO_COLA_POR_ROL: Partial<Record<Rol, EstadoPeriodo | EstadoPeriodo[]>> = {
  supervisor: 'enviado',
  admin: 'enviado',
}
