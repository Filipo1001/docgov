import 'server-only'

/**
 * A quién le llega el correo masivo.
 *
 * Vive en un solo sitio porque lo necesitan dos: la pantalla, para enseñar la
 * lista antes de enviar, y la ruta que envía. Tenerlo duplicado era garantía
 * de que un día la lista que se ve y la lista que recibe dejaran de ser la
 * misma — y en un correo a cien personas eso no se descubre hasta después.
 */

import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { getMesActual } from '@/lib/constants'
import { DOMINIO_MARCADOR, ROLES_EQUIPO, type FiltroMasivo, type Destinatario } from '@/lib/correo-masivo'

export interface Resolucion {
  destinatarios: Destinatario[]
  /** Usuarios que entraban por el filtro pero no tienen un correo real. */
  excluidos: number
}

export async function resolverDestinatarios(filtro: FiltroMasivo): Promise<Resolucion> {
  const admin = createAdminSupabaseClient()

  // «No han enviado» no se saca de `usuarios`: se saca de los periodos del
  // mes en curso que siguen en borrador, y de ahí al contratista. Es la
  // misma población que persigue el recordatorio automático del día 22.
  let ids: string[] | null = null
  if (filtro === 'pendientes') {
    const { mes, anio } = getMesActual()
    const { data: periodos } = await admin
      .from('periodos')
      .select('contrato:contratos!inner(contratista_id, activo)')
      .eq('mes', mes)
      .eq('anio', anio)
      .eq('estado', 'borrador')
      .eq('es_historico', false)
      .eq('contratos.activo', true)

    const conjunto = new Set<string>()
    for (const p of (periodos ?? []) as unknown as Array<{ contrato: { contratista_id: string | null } | null }>) {
      const id = p.contrato?.contratista_id
      if (id) conjunto.add(id)
    }
    ids = [...conjunto]
    // Sin nadie pendiente no hay a quién escribir, y un `.in()` con la lista
    // vacía traería la tabla entera.
    if (!ids.length) return { destinatarios: [], excluidos: 0 }
  }

  let consulta = admin
    .from('usuarios')
    .select('nombre_completo, email, rol')
    .eq('activo', true)
    .order('nombre_completo')

  if (filtro === 'contratistas') consulta = consulta.eq('rol', 'contratista')
  if (filtro === 'equipo')       consulta = consulta.in('rol', [...ROLES_EQUIPO])
  if (ids)                       consulta = consulta.in('id', ids)

  const { data, error } = await consulta
  if (error) throw new Error(error.message)

  // Un correo real, y uno solo por dirección: dos cuentas de la misma persona
  // —que las hay— no se traducen en dos copias del mismo aviso.
  const vistos = new Set<string>()
  const destinatarios: Destinatario[] = []
  let excluidos = 0

  for (const f of (data ?? []) as Destinatario[]) {
    const email = (f.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@') || email.endsWith(DOMINIO_MARCADOR)) { excluidos++; continue }
    if (vistos.has(email)) continue
    vistos.add(email)
    destinatarios.push({ ...f, email })
  }

  return { destinatarios, excluidos }
}
