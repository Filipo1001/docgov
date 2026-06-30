/**
 * lib/duplicados.ts — Server-side duplicate-evidence detection.
 *
 * Server-side only: uses Supabase server client, never imported from Client Components.
 *
 * buscarDuplicados compares every evidencia in periodoIdActual against evidencias from
 * all other periods of the same contrato, using two signals:
 *   - SHA-256 (file_hash): exact byte-level match → 'exacto'
 *   - aHash   (phash):     Hamming distance ≤ 10  → 'similar'
 *     (catches screenshots, re-encodings, rescaled copies of the same image)
 *
 * Hamming distance is computed byte-by-byte — no BigInt, compatible with ES2017.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DuplicadoMatch } from './types'

const PHASH_THRESHOLD = 10

function hammingDistance(hexA: string, hexB: string): number {
  if (!hexA || !hexB || hexA.length !== 16 || hexB.length !== 16) return 64
  let count = 0
  for (let i = 0; i < 16; i += 2) {
    let xor = parseInt(hexA.slice(i, i + 2), 16) ^ parseInt(hexB.slice(i, i + 2), 16)
    while (xor) { xor &= xor - 1; count++ }
  }
  return count
}

type EvidenciaRow = { id: string; file_hash: string | null; phash: string | null; created_at: string | null }
type ActividadRow = { id: string; descripcion: string; periodo_id: string; evidencias: EvidenciaRow[] }
type PeriodoRow   = { id: string; mes: string; anio: number; numero_periodo: number }

export async function buscarDuplicados(
  periodoIdActual: string,
  contratoId: string,
  supabase: SupabaseClient,
): Promise<Record<string, DuplicadoMatch[]>> {
  try {
    // All periods of this contrato except the one being reviewed
    const { data: periodosHistoricos } = await supabase
      .from('periodos')
      .select('id, mes, anio, numero_periodo')
      .eq('contrato_id', contratoId)
      .neq('id', periodoIdActual)

    if (!periodosHistoricos?.length) return {}

    const periodoMap = new Map<string, PeriodoRow>(
      (periodosHistoricos as PeriodoRow[]).map(p => [p.id, p])
    )
    const periodoIds = (periodosHistoricos as PeriodoRow[]).map(p => p.id)

    // Fetch current + historical actividades+evidencias concurrently
    const [{ data: actActuales }, { data: actHistoricas }] = await Promise.all([
      supabase
        .from('actividades')
        .select('id, descripcion, periodo_id, evidencias(id, file_hash, phash, created_at)')
        .eq('periodo_id', periodoIdActual),
      supabase
        .from('actividades')
        .select('id, descripcion, periodo_id, evidencias(id, file_hash, phash, created_at)')
        .in('periodo_id', periodoIds),
    ])

    // Collect current-period evidencias that have at least one hash
    const currentEvidencias = ((actActuales ?? []) as ActividadRow[]).flatMap(a =>
      (a.evidencias ?? [])
        .filter(e => e.file_hash || e.phash)
        .map(e => ({ ...e, actDesc: a.descripcion }))
    )

    if (!currentEvidencias.length) return {}

    // Build lookup structures for historical evidencias
    const byHash = new Map<string, { actDesc: string; periodoId: string; createdAt: string | null }[]>()
    const withPhash: { phash: string; actDesc: string; periodoId: string; createdAt: string | null }[] = []

    for (const act of (actHistoricas ?? []) as ActividadRow[]) {
      for (const ev of act.evidencias ?? []) {
        if (ev.file_hash) {
          const arr = byHash.get(ev.file_hash) ?? []
          arr.push({ actDesc: act.descripcion, periodoId: act.periodo_id, createdAt: ev.created_at })
          byHash.set(ev.file_hash, arr)
        }
        if (ev.phash) {
          withPhash.push({ phash: ev.phash, actDesc: act.descripcion, periodoId: act.periodo_id, createdAt: ev.created_at })
        }
      }
    }

    const result: Record<string, DuplicadoMatch[]> = {}

    for (const ev of currentEvidencias) {
      const matches: DuplicadoMatch[] = []
      const seen = new Set<string>()

      // Exact SHA-256 match
      if (ev.file_hash) {
        for (const hist of byHash.get(ev.file_hash) ?? []) {
          const periodo = periodoMap.get(hist.periodoId)
          if (!periodo) continue
          const key = `${hist.periodoId}:${hist.actDesc}`
          if (seen.has(key)) continue
          seen.add(key)
          matches.push({
            tipo: 'exacto',
            periodoMes: periodo.mes,
            periodoAnio: periodo.anio,
            numeroPeriodo: periodo.numero_periodo,
            actividadDescripcion: hist.actDesc,
            fechaCarga: hist.createdAt,
          })
        }
      }

      // Perceptual hash match (aHash Hamming distance ≤ threshold)
      if (ev.phash) {
        for (const hist of withPhash) {
          if (hammingDistance(ev.phash, hist.phash) > PHASH_THRESHOLD) continue
          const periodo = periodoMap.get(hist.periodoId)
          if (!periodo) continue
          const key = `${hist.periodoId}:${hist.actDesc}`
          if (seen.has(key)) continue
          seen.add(key)
          matches.push({
            tipo: 'similar',
            periodoMes: periodo.mes,
            periodoAnio: periodo.anio,
            numeroPeriodo: periodo.numero_periodo,
            actividadDescripcion: hist.actDesc,
            fechaCarga: hist.createdAt,
          })
        }
      }

      if (matches.length) result[ev.id] = matches
    }

    return result
  } catch {
    return {}
  }
}
