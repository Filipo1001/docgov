'use server'

/**
 * app/actions/alcalde.ts — el resumen que ve el alcalde.
 *
 * ── Qué responde esta pantalla ───────────────────────────────────────────
 *
 * «¿Cómo vamos y a quién llamo?». No «¿qué hago ahora?»: el alcalde no
 * aprueba informes, no radica y no corrige documentos. Cada dato que entra
 * aquí tiene que servir para una decisión suya —renovar, exigir, responder
 * ante un ente de control—; si sirve para una decisión de otro, sobra.
 *
 * ── Dos trampas que este cálculo evita a propósito ───────────────────────
 *
 * 1. EL DENOMINADOR. Medido el 6 de septiembre de 2026, Bienestar Social
 *    tenía 33 contratos vigentes y solo 4 cerraron agosto. Parece un
 *    desastre; no lo es: 19 de esos contratos empezaron DESPUÉS del 31 de
 *    agosto —el último, el 4 de septiembre— y no podían reportar. Sobre los
 *    que sí tenían periodo de agosto son 4 de 14. Sigue siendo el peor dato
 *    del municipio, pero es el dato verdadero. Por eso el denominador es
 *    «contratos con periodo de ese mes», nunca «contratos vigentes»: si no,
 *    la secretaría que más contrata es siempre la que peor se ve.
 *
 * 2. EL MES EN CURSO. El día 6, septiembre iba en 1%. Mostrarlo como
 *    porcentaje junto a los meses cerrados es sembrar una alarma falsa todos
 *    los días 1 a 15. La cifra grande es la del último mes CERRADO; el mes
 *    en curso va aparte, contado en informes y no en nota.
 *
 * ── Por qué agrega en el servidor y no consulta el alcalde ───────────────
 *
 * El rol no tiene políticas RLS propias. Se agrega aquí con el cliente de
 * administración y salen totales, no filas: así su pantalla nunca transporta
 * cédulas, cuentas bancarias ni teléfonos, que es información que no necesita
 * para ninguna de sus decisiones.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { MESES } from '@/lib/constants'

export type FilaSecretaria = {
  nombre: string
  conPeriodo: number
  cerrados: number
  esperando: number
  sinEnviar: number
  pct: number
  contratosVigentes: number
  valorVigente: number
}

export type Vencimiento = {
  fecha: string
  dias: number
  contratos: number
  valor: number
  secretarias: string[]
}

export type ResumenAlcalde = {
  // Cartera
  contratosVigentes: number
  personas: number
  valorVigente: number
  pagadoAnio: number
  pagosRadicados: number
  documentosEmitidos: number
  // Ciclo
  mesCerrado: string
  anioCerrado: number
  pctCerrado: number
  cerradosCerrado: number
  totalCerrado: number
  pctPrevio: number | null
  mesPrevio: string
  // Mes en curso (sin nota: va contado, no calificado)
  mesActual: string
  enviadosActual: number
  totalActual: number
  // Detalle
  secretarias: FilaSecretaria[]
  vencimientos: Vencimiento[]
}

/** Fecha de hoy en Bogotá; el servidor corre en UTC. */
function hoyBogota(): { anio: number; mesIdx: number; iso: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [anio, mes] = iso.split('-').map(Number)
  return { anio, mesIdx: mes - 1, iso }
}

const CERRADO = ['aprobado', 'radicado']
const ESPERANDO = ['enviado', 'revision']

export async function getResumenAlcalde(): Promise<{ data?: ResumenAlcalde; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada' }

    const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
    if (!yo || !['alcalde', 'admin'].includes(yo.rol)) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const hoy = hoyBogota()

    // Mes cerrado = el anterior al actual. Mismo criterio que el consolidado
    // mensual por correo, para que las dos cifras nunca se contradigan.
    const idxCerrado = (hoy.mesIdx + 11) % 12
    const anioCerrado = hoy.mesIdx === 0 ? hoy.anio - 1 : hoy.anio
    const mesCerrado = MESES[idxCerrado]
    const idxPrevio = (idxCerrado + 11) % 12
    const anioPrevio = idxCerrado === 0 ? anioCerrado - 1 : anioCerrado
    const mesPrevio = MESES[idxPrevio]
    const mesActual = MESES[hoy.mesIdx]

    const [{ data: contratos, error: eC }, { data: deps }, { count: docsCount }] = await Promise.all([
      admin.from('contratos')
        .select('id, dependencia_id, contratista_id, valor_total, fecha_fin, activo')
        .eq('activo', true),
      admin.from('dependencias').select('id, nombre'),
      // Cuenta, no filas: PostgREST corta en 1.000 y este contador solo crece
      // —van 518—, así que traer las filas daría un número mudo y erróneo el
      // día que se pase de mil.
      admin.from('documentos_emitidos').select('*', { count: 'exact', head: true }),
    ])
    if (eC) return { error: eC.message }

    const nombreDep = new Map((deps ?? []).map(d => [d.id as string, d.nombre as string]))
    const vigentes = (contratos ?? []).filter(c => (c.fecha_fin as string) >= hoy.iso)
    const porContrato = new Map((contratos ?? []).map(c => [c.id as string, c]))

    // Periodos de los tres meses en juego, en una consulta.
    const { data: periodos, error: eP } = await admin
      .from('periodos')
      .select('contrato_id, estado, mes, anio, valor_cobro, es_historico')
      .eq('es_historico', false)
      .in('mes', [...new Set([mesCerrado, mesPrevio, mesActual])])
      .in('anio', [...new Set([anioCerrado, anioPrevio, hoy.anio])])
    if (eP) return { error: eP.message }

    const delMes = (mes: string, anio: number) =>
      (periodos ?? []).filter(p => p.mes === mes && p.anio === anio && porContrato.has(p.contrato_id as string))

    const pCerrado = delMes(mesCerrado, anioCerrado)
    const pPrevio = delMes(mesPrevio, anioPrevio)
    const pActual = delMes(mesActual, hoy.anio)

    const pct = (lista: typeof pCerrado) =>
      lista.length ? Math.round(100 * lista.filter(p => CERRADO.includes(p.estado as string)).length / lista.length) : 0

    // Pagado en el año: solo lo radicado, que es lo que de verdad salió.
    const { data: radicados } = await admin
      .from('periodos')
      .select('valor_cobro')
      .eq('estado', 'radicado')
      .eq('anio', hoy.anio)
      .eq('es_historico', false)
    const pagadoAnio = (radicados ?? []).reduce((s, p) => s + Number(p.valor_cobro ?? 0), 0)

    // ── Por secretaría, sobre el mes cerrado ──────────────────────────────
    const acc = new Map<string, FilaSecretaria>()
    const fila = (depId: string | null) => {
      const nombre = nombreDep.get(depId ?? '') ?? 'Sin dependencia'
      if (!acc.has(nombre)) {
        acc.set(nombre, {
          nombre, conPeriodo: 0, cerrados: 0, esperando: 0, sinEnviar: 0,
          pct: 0, contratosVigentes: 0, valorVigente: 0,
        })
      }
      return acc.get(nombre)!
    }

    for (const c of vigentes) {
      const f = fila(c.dependencia_id as string | null)
      f.contratosVigentes++
      f.valorVigente += Number(c.valor_total ?? 0)
    }

    for (const p of pCerrado) {
      const c = porContrato.get(p.contrato_id as string)!
      const f = fila(c.dependencia_id as string | null)
      f.conPeriodo++
      if (CERRADO.includes(p.estado as string)) f.cerrados++
      else if (ESPERANDO.includes(p.estado as string)) f.esperando++
      else f.sinEnviar++
    }

    const secretarias = [...acc.values()]
      .map(f => ({ ...f, pct: f.conPeriodo ? Math.round(100 * f.cerrados / f.conPeriodo) : 0 }))
      // Lo peor arriba: es la única ordenación que sirve para decidir a quién
      // llamar. Las que no tuvieron periodo ese mes van al final, no primero:
      // 0 de 0 no es un incumplimiento.
      .sort((a, b) =>
        (b.conPeriodo === 0 ? -1 : 0) - (a.conPeriodo === 0 ? -1 : 0) || a.pct - b.pct)

    // ── Vencimientos: 60 días, agrupados por fecha ────────────────────────
    const tope = new Date(hoy.iso + 'T00:00:00')
    tope.setDate(tope.getDate() + 60)
    const topeISO = tope.toISOString().slice(0, 10)

    const porFecha = new Map<string, Vencimiento>()
    for (const c of vigentes) {
      const f = c.fecha_fin as string
      if (f > topeISO) continue
      if (!porFecha.has(f)) {
        const dias = Math.round(
          (new Date(f + 'T00:00:00').getTime() - new Date(hoy.iso + 'T00:00:00').getTime()) / 86_400_000,
        )
        porFecha.set(f, { fecha: f, dias, contratos: 0, valor: 0, secretarias: [] })
      }
      const v = porFecha.get(f)!
      v.contratos++
      v.valor += Number(c.valor_total ?? 0)
      const n = nombreDep.get((c.dependencia_id as string) ?? '')
      if (n && !v.secretarias.includes(n)) v.secretarias.push(n)
    }

    return {
      data: {
        contratosVigentes: vigentes.length,
        personas: new Set(vigentes.map(c => c.contratista_id)).size,
        valorVigente: vigentes.reduce((s, c) => s + Number(c.valor_total ?? 0), 0),
        pagadoAnio,
        pagosRadicados: (radicados ?? []).length,
        documentosEmitidos: docsCount ?? 0,
        mesCerrado,
        anioCerrado,
        pctCerrado: pct(pCerrado),
        cerradosCerrado: pCerrado.filter(p => CERRADO.includes(p.estado as string)).length,
        totalCerrado: pCerrado.length,
        pctPrevio: pPrevio.length ? pct(pPrevio) : null,
        mesPrevio,
        mesActual,
        enviadosActual: pActual.filter(p => !['borrador', 'rechazado'].includes(p.estado as string)).length,
        totalActual: pActual.length,
        secretarias,
        vencimientos: [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
