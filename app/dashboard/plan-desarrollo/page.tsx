import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import PlanDesarrolloCliente, { type Vista } from '@/components/pdm/PlanDesarrolloCliente'
import { REPORTANTES, coincideNombre } from '@/lib/pdm/plan'

/**
 * Plan de Desarrollo — vista previa.
 *
 * ── Dos seguros para que esto no llegue a producción por accidente ────────
 *
 * 1. En producción esta ruta responde 404. Vercel marca cada despliegue con
 *    VERCEL_ENV (`production`, `preview` o `development`), y la página se
 *    apaga sola en el primero. Si un día esta rama se fusiona a main sin
 *    querer, en app.contratistadigital.com esta URL simplemente no existe.
 *
 * 2. No hay ni una escritura a la base de datos. Los indicadores salen de un
 *    archivo sembrado y los reportes viven en memoria. El único acceso a la
 *    base es el que ya hace `requireRole`, de solo lectura, para saber quién
 *    entra.
 *
 * No toca `middleware.ts` ni añade una entrada al menú: se llega por la URL.
 * La ruta cuelga de /dashboard, que ya está enrutada, así que `/verificar` no
 * se ve involucrada en nada de esto (regla 1 de CLAUDE.md).
 */

export const metadata = { title: 'Plan de Desarrollo — vista previa' }

/** Vista con la que entra cada rol, antes de que la persona use «Ver como». */
const VISTA_POR_ROL: Record<string, Vista> = {
  contratista: 'reportante',
  supervisor: 'secretario',
  alcalde: 'alcalde',
}

export default async function PlanDesarrolloPage() {
  if (process.env.VERCEL_ENV === 'production') notFound()

  const usuario = await requireRole(['admin', 'supervisor', 'contratista', 'asesor', 'contratacion', 'alcalde'])

  const personaInicial = REPORTANTES.find(p => coincideNombre(usuario.nombre_completo ?? '', p.nombre))?.nombre

  return (
    <PlanDesarrolloCliente
      vistaInicial={VISTA_POR_ROL[usuario.rol] ?? 'alcalde'}
      personaInicial={personaInicial}
    />
  )
}
