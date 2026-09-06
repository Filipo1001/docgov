'use server'

/**
 * app/actions/alcalde.ts — el panel de control de la alcaldía.
 *
 * Cifras de cabecera, una tarjeta por secretaría y tres series para graficar.
 * Nada del ciclo mensual: si una cuenta de cobro quedó sin revisar es asunto
 * del supervisor, no de esta pantalla.
 *
 * ── Por qué la plata SÍ incluye los periodos históricos ──────────────────
 *
 * El resto de la aplicación filtra `es_historico = false`. Para el ciclo
 * mensual está bien; para el dinero miente. El sistema entró en julio de 2026
 * y los contratos empezaron en enero: los pagos previos están cargados como
 * históricos —215 periodos, 875 millones—. Sin ellos, Hacienda aparecía
 * ejecutando 14% con 66% del plazo consumido y el alcalde habría llamado a
 * pedir explicaciones por un problema inexistente. Con ellos: 61% contra 66%.
 *
 * Se suman sin solaparse: (radicado Y NO histórico) O histórico.
 *
 * ── Por qué el porcentaje va contra el plazo transcurrido ────────────────
 *
 * «24% ejecutado» solo no dice nada. Bienestar Social va en 24% y es de las
 * que mejor están, porque apenas ha corrido el 31% de su plazo; Gobierno va
 * en 87% con el 86% corrido, o sea exactamente al día. El plazo se pondera
 * por valor, no por número de contratos: lo que se compara son pesos.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { MESES } from '@/lib/constants'

export type TarjetaSecretaria = {
  id: string
  nombre: string
  secretario: string | null
  foto: string | null
  contratistas: number
  contratos: number
  contratado: number
  ejecutado: number
  pctEjecutado: number
  pctPlazo: number
  vencenPronto: number
  fechaVencimiento: string | null
}

export type PuntoMes = { mes: string; valor: number; pagos: number; enCurso: boolean }
export type Vencimiento = { clave: string; etiqueta: string; contratos: number; valor: number }

export type ResumenAlcalde = {
  anio: number
  contratadoTotal: number
  ejecutadoTotal: number
  porEjecutar: number
  contratistasTotal: number
  secretarias: TarjetaSecretaria[]
  serieMensual: PuntoMes[]
  vencimientos: Vencimiento[]
}

function hoyBogota(): { anio: number; mesIdx: number; iso: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const [anio, mes] = iso.split('-').map(Number)
  return { anio, mesIdx: mes - 1, iso }
}

const dias = (a: string, b: string) =>
  (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000

/**
 * Trae TODAS las filas de una consulta, por páginas.
 *
 * PostgREST corta en 1.000 y no avisa. Los periodos que cuentan como plata van
 * en 435 y suben unos 200 al año; los contratos, en 145 y suben unos 150. En
 * pocos años ambas sumas empezarían a quedarse cortas sin que nada fallara, y
 * son justo las cifras que no pueden mentir.
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

type FilaContrato = {
  id: string; dependencia_id: string | null; contratista_id: string | null
  valor_total: number | null; fecha_inicio: string; fecha_fin: string
}
type FilaPlata = {
  contrato_id: string; valor_cobro: number | null; estado: string
  es_historico: boolean; mes: string; anio: number
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

    const [contratos, { data: deps }, { data: supers }] = await Promise.all([
      todas<FilaContrato>((desde, hasta) => admin.from('contratos')
        .select('id, dependencia_id, contratista_id, valor_total, fecha_inicio, fecha_fin')
        .eq('activo', true)
        .range(desde, hasta)),
      admin.from('dependencias').select('id, nombre'),
      admin.from('usuarios')
        .select('id, nombre_completo, foto_url, dependencia_id')
        .eq('rol', 'supervisor'),
    ])

    const vigentes = contratos.filter(c => c.fecha_fin >= hoy.iso)
    const ids = contratos.map(c => c.id)

    const plata = await todas<FilaPlata>((desde, hasta) => admin.from('periodos')
      .select('contrato_id, valor_cobro, estado, es_historico, mes, anio')
      .in('contrato_id', ids)
      .or('estado.eq.radicado,es_historico.eq.true')
      .range(desde, hasta))

    // (radicado Y NO histórico) O histórico — sin solaparse.
    const cuenta = (p: FilaPlata) => p.es_historico === true || p.estado === 'radicado'

    const ejecutadoPorContrato = new Map<string, number>()
    for (const p of plata) {
      if (!cuenta(p)) continue
      ejecutadoPorContrato.set(
        p.contrato_id,
        (ejecutadoPorContrato.get(p.contrato_id) ?? 0) + Number(p.valor_cobro ?? 0),
      )
    }

    // ── Serie mensual del año en curso ────────────────────────────────────
    // El mes actual va marcado: el día 6 lleva un pago y leerlo junto a los
    // meses cerrados parecería un desplome. Se pinta distinto, no se oculta.
    const porMes = new Map<string, { valor: number; pagos: number }>()
    for (const p of plata) {
      if (!cuenta(p) || p.anio !== hoy.anio) continue
      const k = p.mes
      const acc = porMes.get(k) ?? { valor: 0, pagos: 0 }
      acc.valor += Number(p.valor_cobro ?? 0)
      acc.pagos += 1
      porMes.set(k, acc)
    }
    const serieMensual: PuntoMes[] = MESES
      .slice(0, hoy.mesIdx + 1)
      .map((mes, i) => ({
        mes,
        valor: porMes.get(mes)?.valor ?? 0,
        pagos: porMes.get(mes)?.pagos ?? 0,
        enCurso: i === hoy.mesIdx,
      }))

    // ── Calendario de vencimientos ────────────────────────────────────────
    const porVenc = new Map<string, { contratos: number; valor: number }>()
    for (const c of vigentes) {
      const k = c.fecha_fin.slice(0, 7) // YYYY-MM
      const acc = porVenc.get(k) ?? { contratos: 0, valor: 0 }
      acc.contratos += 1
      acc.valor += Number(c.valor_total ?? 0)
      porVenc.set(k, acc)
    }
    const vencimientos: Vencimiento[] = [...porVenc.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([clave, v]) => ({
        clave,
        etiqueta: `${MESES[Number(clave.slice(5, 7)) - 1]} ${clave.slice(0, 4)}`,
        ...v,
      }))

    // ── Tarjetas por secretaría ───────────────────────────────────────────
    const supPorDep = new Map((supers ?? []).map(s => [s.dependencia_id as string, s]))
    const tarjetas: TarjetaSecretaria[] = []

    for (const dep of deps ?? []) {
      const depId = dep.id as string
      const suyos = vigentes.filter(c => c.dependencia_id === depId)
      // Sin contratos vigentes no hay tarjeta. Deja fuera a Comisaría de
      // Familia sin nombrarla: si algún día le asignan contratos, aparece sola.
      if (suyos.length === 0) continue

      const contratado = suyos.reduce((s, c) => s + Number(c.valor_total ?? 0), 0)
      const ejecutado = suyos.reduce((s, c) => s + (ejecutadoPorContrato.get(c.id) ?? 0), 0)

      let plazoPonderado = 0
      for (const c of suyos) {
        const total = dias(c.fecha_inicio, c.fecha_fin)
        const corrido = dias(c.fecha_inicio, hoy.iso)
        const frac = total > 0 ? Math.min(1, Math.max(0, corrido / total)) : 0
        plazoPonderado += frac * Number(c.valor_total ?? 0)
      }

      const proximos = suyos.filter(c => {
        const d = dias(hoy.iso, c.fecha_fin)
        return d >= 0 && d <= 30
      })
      const sup = supPorDep.get(depId)

      tarjetas.push({
        id: depId,
        nombre: dep.nombre as string,
        secretario: (sup?.nombre_completo as string) ?? null,
        foto: (sup?.foto_url as string) ?? null,
        contratistas: new Set(suyos.map(c => c.contratista_id)).size,
        contratos: suyos.length,
        contratado,
        ejecutado,
        pctEjecutado: contratado ? Math.round(100 * ejecutado / contratado) : 0,
        pctPlazo: contratado ? Math.round(100 * plazoPonderado / contratado) : 0,
        vencenPronto: proximos.length,
        fechaVencimiento: [...new Set(proximos.map(c => c.fecha_fin))].sort()[0] ?? null,
      })
    }
    tarjetas.sort((a, b) => b.contratado - a.contratado)

    const contratadoTotal = tarjetas.reduce((s, t) => s + t.contratado, 0)
    const ejecutadoTotal = tarjetas.reduce((s, t) => s + t.ejecutado, 0)

    return {
      data: {
        anio: hoy.anio,
        contratadoTotal,
        ejecutadoTotal,
        // Lo comprometido que todavía no ha salido. No existe en ninguna otra
        // pantalla y es la cifra de tesorería que le preguntan al alcalde.
        porEjecutar: Math.max(0, contratadoTotal - ejecutadoTotal),
        contratistasTotal: new Set(vigentes.map(c => c.contratista_id)).size,
        secretarias: tarjetas,
        serieMensual,
        vencimientos,
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
