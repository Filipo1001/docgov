/**
 * PDF access authorization helper.
 *
 * Access rules per role:
 *   admin       → always allowed
 *   contratista → only periods that belong to their own contracts
 *   asesor      → only periods in contracts of their dependencia
 *   supervisor  → only periods in contracts they supervise
 *
 * Called at the top of every /api/pdf/[periodoId]/* route handler,
 * BEFORE any expensive PDF generation, so unauthorized requests fail fast.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AccesoResult =
  | { ok: true;  rol: string }
  | { ok: false; status: 401 | 403; message: string }

export async function verificarAccesoPeriodo(
  supabase: SupabaseClient,
  periodoId: string,
): Promise<AccesoResult> {
  // ── 1. Require active session ─────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { ok: false, status: 401, message: 'No autorizado' }
  }

  const uid = session.user.id

  // ── 2. Fetch caller's role + dependencia ──────────────────────
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, dependencia_id')
    .eq('id', uid)
    .single()

  if (!usuario) {
    return { ok: false, status: 403, message: 'Usuario no encontrado' }
  }

  // ── 3. Admin shortcut ─────────────────────────────────────────
  if (usuario.rol === 'admin') {
    return { ok: true, rol: 'admin' }
  }

  // ── 4. Fetch the periodo's contract ownership data ────────────
  const { data: periodo } = await supabase
    .from('periodos')
    .select(`
      contrato:contratos(
        contratista_id,
        supervisor_id,
        dependencia_id
      )
    `)
    .eq('id', periodoId)
    .single()

  const contrato = (periodo?.contrato as unknown as {
    contratista_id: string
    supervisor_id: string
    dependencia_id: string
  } | null)

  if (!contrato) {
    return { ok: false, status: 403, message: 'Periodo no encontrado o sin contrato asociado' }
  }

  // ── 5. Role-based ownership check ────────────────────────────
  switch (usuario.rol) {
    case 'contratista':
      if (contrato.contratista_id !== uid) {
        return { ok: false, status: 403, message: 'No tienes permiso para acceder a este documento' }
      }
      return { ok: true, rol: 'contratista' }

    case 'asesor':
      if (contrato.dependencia_id !== usuario.dependencia_id) {
        return { ok: false, status: 403, message: 'Este contrato no pertenece a tu dependencia' }
      }
      return { ok: true, rol: 'asesor' }

    case 'supervisor':
      if (contrato.supervisor_id !== uid) {
        return { ok: false, status: 403, message: 'No eres el supervisor de este contrato' }
      }
      return { ok: true, rol: 'supervisor' }

    default:
      return { ok: false, status: 403, message: 'Rol no reconocido' }
  }
}
