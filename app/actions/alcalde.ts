'use server'

/**
 * app/actions/alcalde.ts — las tarjetas que recibe el alcalde.
 *
 * Una tarjeta por secretaría con operación. Responde, sin párrafos: cuánto
 * pesa, si va al día y si hay algo que se le vence encima.
 *
 * ── Por qué la plata SÍ incluye los periodos históricos ──────────────────
 *
 * El resto de la aplicación filtra `es_historico = false`, y para el ciclo
 * mensual está bien: un periodo histórico se cargó ya cerrado y no dice nada
 * sobre si el supervisor está aprobando a tiempo.
 *
 * Para la plata ese filtro miente. El sistema entró en julio de 2026 y los
 * contratos empezaron en enero: los pagos anteriores están cargados como
 * históricos —215 periodos, 875 millones—. Excluyéndolos, Hacienda aparecía
 * con 14% ejecutado y 66% del plazo consumido, y el alcalde habría llamado a
 * pedir explicaciones por un problema inexistente. Con ellos da 61% contra
 * 66%: normal. Misma corrección en las cuatro secretarías.
 *
 * Se suman sin solaparse: (radicado Y NO histórico) O histórico.
 *
 * ── Por qué el porcentaje va contra el plazo transcurrido ────────────────
 *
 * «24% ejecutado» no dice nada solo. Bienestar Social está en 24% y es la que
 * mejor va, porque solo ha corrido el 16% de su plazo; Hacienda está en 61%
 * con el 66% corrido. La referencia convierte «cuánto llevan» en «van al día
 * o no», que es lo único que el alcalde puede accionar.
 *
 * El plazo se pondera por valor —no es el promedio simple de los contratos—
 * porque lo que se compara es contra pesos: un contrato de 60 millones pesa
 * más en la barra que uno de 12.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { MESES } from '@/lib/constants'

export type TarjetaSecretaria = {
  id: string
  nombre: string
  /** Cargo real del supervisor: «SECRETARÍA GENERAL Y DE GOBIERNO» y demás. */
  cargo: string | null
  secretario: string | null
  foto: string | null
  contratistas: number
  contratos: number
  contratado: number
  ejecutado: number
  pctEjecutado: number
  /** Cuánto del plazo contratado ya corrió, ponderado por valor. La referencia. */
  pctPlazo: number
  /** Último mes cerrado: 'bien' | 'atencion' | 'mal' | null si no hubo periodos. */
  estadoMes: 'bien' | 'atencion' | 'mal' | null
  cerradosMes: number
  totalMes: number
  /** Vencimientos dentro de 30 días, si los hay. */
  vencenPronto: number
  fechaVencimiento: string | null
}

export type ResumenAlcalde = {
  mesCerrado: string
  anioCerrado: number
  contratadoTotal: number
  ejecutadoTotal: number
  contratistasTotal: number
  secretarias: TarjetaSecretaria[]
}

function hoyBogota(): { anio: number; mesIdx: number; iso: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [anio, mes] = iso.split('-').map(Number)
  return { anio, mesIdx: mes - 1, iso }
}

const CERRADO = ['aprobado', 'radicado']
const dias = (a: string, b: string) =>
  (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000

/**
 * Trae TODAS las filas de una consulta, por páginas.
 *
 * PostgREST corta en 1.000 y no avisa. Los periodos que cuentan como plata
 * van en 435 y suben unos 200 al año: en un par de años la suma empezaría a
 * quedarse corta sin que nada fallara, y el número que ve el alcalde es
 * justo el que no puede mentir. Paginar cuesta cuatro líneas.
 */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000
  const salida: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error || !data) break
    salida.push(...data)
    if (data.length < PAGINA) break
  }
  return salida
}

export async function getResumenAlcalde(): Promise<{ data?: ResumenAlcalde; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada' }

    const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
    if (!yo || !['alcalde', 'admin'].includes(yo.rol)) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const hoy = hoyBogota()

    const idxCerrado = (hoy.mesIdx + 11) % 12
    const anioCerrado = hoy.mesIdx === 0 ? hoy.anio - 1 : hoy.anio
    const mesCerrado = MESES[idxCerrado]

    const [{ data: contratos, error: eC }, { data: deps }, { data: supers }] = await Promise.all([
      admin.from('contratos')
        .select('id, dependencia_id, contratista_id, valor_total, fecha_inicio, fecha_fin')
        .eq('activo', true),
      admin.from('dependencias').select('id, nombre'),
      admin.from('usuarios')
        .select('id, nombre_completo, cargo, foto_url, dependencia_id')
        .eq('rol', 'supervisor'),
    ])
    if (eC) return { error: eC.message }

    const vigentes = (contratos ?? []).filter(c => (c.fecha_fin as string) >= hoy.iso)
    const idsActivos = (contratos ?? []).map(c => c.id as string)

    // Periodos: los del mes cerrado para el semáforo, y todo lo que cuenta
    // como plata ejecutada. Se piden por separado porque el filtro difiere.
    type FilaMes = { contrato_id: string; estado: string }
    type FilaPlata = { contrato_id: string; valor_cobro: number | null; estado: string; es_historico: boolean }

    const [pMes, pPlata] = await Promise.all([
      todas<FilaMes>((desde, hasta) => admin.from('periodos')
        .select('contrato_id, estado')
        .in('contrato_id', idsActivos)
        .eq('es_historico', false)
        .eq('mes', mesCerrado)
        .eq('anio', anioCerrado)
        .range(desde, hasta)),
      todas<FilaPlata>((desde, hasta) => admin.from('periodos')
        .select('contrato_id, valor_cobro, estado, es_historico')
        .in('contrato_id', idsActivos)
        .or('estado.eq.radicado,es_historico.eq.true')
        .range(desde, hasta)),
    ])

    const ejecutadoPorContrato = new Map<string, number>()
    for (const p of pPlata) {
      // (radicado Y NO histórico) O histórico — sin solaparse.
      const cuenta = p.es_historico === true || p.estado === 'radicado'
      if (!cuenta) continue
      const k = p.contrato_id as string
      ejecutadoPorContrato.set(k, (ejecutadoPorContrato.get(k) ?? 0) + Number(p.valor_cobro ?? 0))
    }

    const mesPorContrato = new Map<string, string[]>()
    for (const p of pMes) {
      const k = p.contrato_id as string
      mesPorContrato.set(k, [...(mesPorContrato.get(k) ?? []), p.estado as string])
    }

    const supPorDep = new Map((supers ?? []).map(s => [s.dependencia_id as string, s]))

    const tarjetas: TarjetaSecretaria[] = []
    for (const dep of deps ?? []) {
      const depId = dep.id as string
      const suyos = vigentes.filter(c => c.dependencia_id === depId)
      // Sin contratos vigentes no hay tarjeta. Deja fuera a Comisaría de
      // Familia, que existe en la base pero no tiene operación ni supervisor.
      if (suyos.length === 0) continue

      const contratado = suyos.reduce((s, c) => s + Number(c.valor_total ?? 0), 0)
      const ejecutado = suyos.reduce((s, c) => s + (ejecutadoPorContrato.get(c.id as string) ?? 0), 0)

      // Plazo corrido, ponderado por valor.
      let plazoPonderado = 0
      for (const c of suyos) {
        const total = dias(c.fecha_inicio as string, c.fecha_fin as string)
        const corrido = dias(c.fecha_inicio as string, hoy.iso)
        const frac = total > 0 ? Math.min(1, Math.max(0, corrido / total)) : 0
        plazoPonderado += frac * Number(c.valor_total ?? 0)
      }

      const estados = suyos.flatMap(c => mesPorContrato.get(c.id as string) ?? [])
      const cerradosMes = estados.filter(e => CERRADO.includes(e)).length
      const totalMes = estados.length
      const pctMes = totalMes ? Math.round(100 * cerradosMes / totalMes) : null

      const proximos = suyos.filter(c => {
        const d = dias(hoy.iso, c.fecha_fin as string)
        return d >= 0 && d <= 30
      })
      const fechas = [...new Set(proximos.map(c => c.fecha_fin as string))].sort()

      const sup = supPorDep.get(depId)
      tarjetas.push({
        id: depId,
        nombre: dep.nombre as string,
        cargo: (sup?.cargo as string) ?? null,
        secretario: (sup?.nombre_completo as string) ?? null,
        foto: (sup?.foto_url as string) ?? null,
        contratistas: new Set(suyos.map(c => c.contratista_id)).size,
        contratos: suyos.length,
        contratado,
        ejecutado,
        pctEjecutado: contratado ? Math.round(100 * ejecutado / contratado) : 0,
        pctPlazo: contratado ? Math.round(100 * plazoPonderado / contratado) : 0,
        estadoMes: pctMes === null ? null : pctMes >= 90 ? 'bien' : pctMes >= 70 ? 'atencion' : 'mal',
        cerradosMes,
        totalMes,
        vencenPronto: proximos.length,
        fechaVencimiento: fechas[0] ?? null,
      })
    }

    // De mayor a menor valor contratado: el orden en que pesan.
    tarjetas.sort((a, b) => b.contratado - a.contratado)

    return {
      data: {
        mesCerrado,
        anioCerrado,
        contratadoTotal: tarjetas.reduce((s, t) => s + t.contratado, 0),
        ejecutadoTotal: tarjetas.reduce((s, t) => s + t.ejecutado, 0),
        contratistasTotal: new Set(vigentes.map(c => c.contratista_id)).size,
        secretarias: tarjetas,
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
