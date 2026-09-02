'use server'

/**
 * Datos que faltan para producir los documentos del ciclo.
 *
 * QUÉ ALERTA Y QUÉ NO. El criterio es que solo entre aquí lo que impide
 * producir un documento correcto. Alertar de todo lo que está vacío convierte
 * el aviso en ruido y nadie lo mira — pasó con las planillas sin revisar, que
 * llegaron a 563 sin que nadie se enterara.
 *
 * Medido sobre los 72 contratos vigentes y los 174 periodos en curso antes de
 * escribir esto, quedaron FUERA a propósito:
 *
 *   · observacion_supervisor — falta en 173 de 174 y los PDF la pintan solo si
 *     existe. Es opcional, no un defecto.
 *   · base_cotizacion_ss — falta en 160, pero hay un valor por defecto
 *     calculado. No rompe nada.
 *   · CDP, CRP, objeto, cédulas, supervisores y obligaciones del contrato —
 *     cero faltantes. Alertarlos sería inventar un problema.
 *
 * EL OTROSÍ SE MIDE POR SUS PERIODOS, NO POR SU FECHA. Un otrosí se considera
 * aplicado si existen los periodos de los meses que cubre, no si la fecha de
 * terminación coincide con el cálculo. La razón es concreta: al medir, el
 * contrato 002 terminaba el 17 de diciembre y la fórmula daba el 19 — una
 * fecha ajustada a mano en la previsualización, que es justo para lo que
 * existe. Marcar eso como error sería castigar el uso correcto. La pregunta
 * que importa es otra: ¿puede el contratista reportar esos meses?
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { MESES } from '@/lib/constants'

/** `bloqueante`: el documento no puede salir bien. `incompleto`: sale flojo. */
export type Severidad = 'bloqueante' | 'incompleto'

export interface Faltante {
  severidad: Severidad
  /** Qué falta, en una línea que se lee sola. */
  detalle: string
  /** Documentos que quedan afectados. */
  afecta: string[]
}

export interface FilaFaltantes {
  contratoId: string
  contratoNumero: string
  contratista: string
  dependencia: string | null
  faltantes: Faltante[]
}

export interface ResumenFaltantes {
  filas: FilaFaltantes[]
  totalBloqueantes: number
  totalIncompletos: number
  contratosRevisados: number
}

export async function getDatosFaltantes(): Promise<{ data?: ResumenFaltantes; error?: string }> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada' }

    const { data: yo } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
    if (!yo || !['admin', 'contratacion'].includes(yo.rol)) return { error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const hoy = new Date().toISOString().slice(0, 10)

    // Solo contratos vigentes: un contrato terminado ya no va a producir
    // documentos nuevos, y arrastrar su historial llenaría la lista de cosas
    // que nadie va a resolver.
    const { data: contratosRaw, error: eC } = await admin
      .from('contratos')
      .select(`
        id, numero,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, firma_url, banco, numero_cuenta),
        dependencia:dependencias(nombre)
      `)
      .gte('fecha_fin', hoy)
      .order('numero')
    if (eC) return { error: eC.message }

    type ContratoRow = {
      id: string; numero: string
      contratista: {
        nombre_completo: string; firma_url: string | null
        banco: string | null; numero_cuenta: string | null
      } | null
      dependencia: { nombre: string } | null
    }
    const contratos = (contratosRaw ?? []) as unknown as ContratoRow[]
    if (!contratos.length) {
      return { data: { filas: [], totalBloqueantes: 0, totalIncompletos: 0, contratosRevisados: 0 } }
    }
    const ids = contratos.map(c => c.id)

    // Periodos vivos y otrosíes, en paralelo.
    const [{ data: periodosRaw }, { data: otrosiesRaw }] = await Promise.all([
      admin
        .from('periodos')
        .select('id, contrato_id, mes, anio, estado, planilla_ss_url, valor_cobro, es_historico')
        .in('contrato_id', ids)
        .eq('es_historico', false),
      admin
        .from('otrosies')
        .select('id, contrato_id, numero, fecha_inicio, valor_adicion, plazo_dias_adicion, cdp, crp')
        .in('contrato_id', ids),
    ])

    type PeriodoRow = {
      id: string; contrato_id: string; mes: string; anio: number; estado: string
      planilla_ss_url: string | null; valor_cobro: number | null
    }
    type OtrosiRow = {
      id: string; contrato_id: string; numero: number; fecha_inicio: string
      valor_adicion: number; plazo_dias_adicion: number; cdp: string | null; crp: string | null
    }
    const periodos = (periodosRaw ?? []) as PeriodoRow[]
    const otrosies = (otrosiesRaw ?? []) as OtrosiRow[]

    // Actividades y evidencias solo de los periodos que ya salieron del
    // borrador: a un borrador aún se le están cargando, y avisar de que está
    // vacío mientras el contratista trabaja sería avisar de nada.
    const periodosVivos = periodos.filter(p =>
      ['enviado', 'revision', 'aprobado', 'radicado'].includes(p.estado),
    )
    const idsVivos = periodosVivos.map(p => p.id)

    const conActividad = new Set<string>()
    const conEvidencia = new Set<string>()
    if (idsVivos.length) {
      const { data: actsRaw } = await admin
        .from('actividades')
        .select('id, periodo_id')
        .in('periodo_id', idsVivos)
      const acts = (actsRaw ?? []) as { id: string; periodo_id: string }[]
      acts.forEach(a => conActividad.add(a.periodo_id))

      if (acts.length) {
        const { data: evsRaw } = await admin
          .from('evidencias')
          .select('actividad_id')
          .in('actividad_id', acts.map(a => a.id))
        const porActividad = new Map(acts.map(a => [a.id, a.periodo_id]))
        for (const e of (evsRaw ?? []) as { actividad_id: string }[]) {
          const pid = porActividad.get(e.actividad_id)
          if (pid) conEvidencia.add(pid)
        }
      }
    }

    const filas: FilaFaltantes[] = []
    let totalBloqueantes = 0
    let totalIncompletos = 0

    for (const c of contratos) {
      const faltantes: Faltante[] = []
      const mios = periodos.filter(p => p.contrato_id === c.id)
      const miosVivos = periodosVivos.filter(p => p.contrato_id === c.id)

      // ── Del contratista ──────────────────────────────────────
      if (!c.contratista?.firma_url) {
        faltantes.push({
          severidad: 'bloqueante',
          detalle: 'El contratista no ha registrado su firma',
          afecta: ['Cuenta de Cobro', 'Informe de Actividades', 'Acta de Supervisión', 'Acta de Pago'],
        })
      }
      // Los PDF leen los datos bancarios del USUARIO, no los del contrato
      // (ver lib/pdf/data.ts): tenerlos solo en el contrato no sirve.
      if (!c.contratista?.numero_cuenta || !c.contratista?.banco) {
        faltantes.push({
          severidad: 'bloqueante',
          detalle: 'Sin datos bancarios del contratista',
          afecta: ['Cuenta de Cobro', 'Acta de Pago'],
        })
      }

      // ── De los periodos ya enviados ──────────────────────────
      const sinActividades = miosVivos.filter(p => !conActividad.has(p.id))
      if (sinActividades.length) {
        faltantes.push({
          severidad: 'incompleto',
          detalle: `${sinActividades.length} periodo(s) sin actividades: ${sinActividades.map(p => `${p.mes} ${p.anio}`).join(', ')}`,
          afecta: ['Informe de Actividades'],
        })
      }
      const sinEvidencias = miosVivos.filter(p => conActividad.has(p.id) && !conEvidencia.has(p.id))
      if (sinEvidencias.length) {
        faltantes.push({
          severidad: 'incompleto',
          detalle: `${sinEvidencias.length} periodo(s) sin evidencias: ${sinEvidencias.map(p => `${p.mes} ${p.anio}`).join(', ')}`,
          afecta: ['Informe de Actividades'],
        })
      }
      const sinPlanilla = miosVivos.filter(p => !p.planilla_ss_url)
      if (sinPlanilla.length) {
        faltantes.push({
          severidad: 'incompleto',
          detalle: `${sinPlanilla.length} periodo(s) sin planilla de seguridad social: ${sinPlanilla.map(p => `${p.mes} ${p.anio}`).join(', ')}`,
          afecta: ['Paquete SECOP II'],
        })
      }

      // ── De los otrosíes ──────────────────────────────────────
      for (const o of otrosies.filter(x => x.contrato_id === c.id)) {
        if (!o.cdp || !o.crp) {
          faltantes.push({
            severidad: 'incompleto',
            detalle: `Otrosí N.° ${o.numero} sin ${!o.cdp && !o.crp ? 'CDP ni CRP' : !o.cdp ? 'CDP' : 'CRP'}`,
            afecta: ['Cuenta de Cobro', 'Acta de Pago', 'Acta de Supervisión'],
          })
        }

        if (o.plazo_dias_adicion > 0) {
          // Meses que cubre el otrosí, y cuántos tienen periodo.
          const inicio = new Date(o.fecha_inicio + 'T00:00:00')
          const fin = new Date(inicio)
          fin.setDate(fin.getDate() + o.plazo_dias_adicion - 1)
          const meses: string[] = []
          const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1)
          while (cursor <= fin) {
            meses.push(`${MESES[cursor.getMonth()].toLowerCase()}-${cursor.getFullYear()}`)
            cursor.setMonth(cursor.getMonth() + 1)
          }
          const existentes = new Set(mios.map(p => `${p.mes.toLowerCase()}-${p.anio}`))
          const cubiertos = meses.filter(m => existentes.has(m)).length

          if (cubiertos === 0) {
            faltantes.push({
              severidad: 'bloqueante',
              detalle: `Otrosí N.° ${o.numero} sin aplicar: faltan los ${meses.length} periodos que adiciona`,
              afecta: ['Todos — el contratista no puede reportar esos meses'],
            })
          } else if (cubiertos < meses.length) {
            faltantes.push({
              severidad: 'bloqueante',
              detalle: `Otrosí N.° ${o.numero} aplicado a medias: faltan ${meses.length - cubiertos} de ${meses.length} periodos`,
              afecta: ['Todos — el contratista no puede reportar los meses que faltan'],
            })
          } else if (o.valor_adicion > 0) {
            // Con los periodos completos, se contrasta la plata.
            const suma = mios
              .filter(p => meses.includes(`${p.mes.toLowerCase()}-${p.anio}`))
              .reduce((a, p) => a + Number(p.valor_cobro ?? 0), 0)
            const diferencia = Math.round(suma - o.valor_adicion)
            if (diferencia !== 0) {
              faltantes.push({
                severidad: 'incompleto',
                detalle: `Otrosí N.° ${o.numero}: los periodos suman $ ${Math.abs(diferencia).toLocaleString('es-CO')} ${diferencia > 0 ? 'más' : 'menos'} que la adición`,
                afecta: ['Cuenta de Cobro', 'Acta de Pago'],
              })
            }
          }
        }
      }

      if (faltantes.length) {
        totalBloqueantes += faltantes.filter(f => f.severidad === 'bloqueante').length
        totalIncompletos += faltantes.filter(f => f.severidad === 'incompleto').length
        filas.push({
          contratoId: c.id,
          contratoNumero: c.numero,
          contratista: c.contratista?.nombre_completo ?? 'Sin nombre',
          dependencia: c.dependencia?.nombre ?? null,
          faltantes,
        })
      }
    }

    // Lo bloqueante primero: es lo que impide producir un documento.
    filas.sort((a, b) => {
      const ba = a.faltantes.filter(f => f.severidad === 'bloqueante').length
      const bb = b.faltantes.filter(f => f.severidad === 'bloqueante').length
      if (ba !== bb) return bb - ba
      return a.contratoNumero.localeCompare(b.contratoNumero)
    })

    return {
      data: { filas, totalBloqueantes, totalIncompletos, contratosRevisados: contratos.length },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
