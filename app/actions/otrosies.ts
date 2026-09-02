'use server'

/**
 * Server Actions: gestión de otrosíes (admin y contratación)
 *
 * Un otrosí modifica un contrato existente (valor, plazo, obligaciones) sin
 * crear uno nuevo. Un contrato puede tener varios. Las mutaciones corren
 * server-side (cookies httpOnly), igual que obligaciones/contratos.
 *
 * Al crear/editar/eliminar un otrosí se invalida el caché de PDF de TODOS los
 * periodos del contrato, porque los documentos (cuenta de cobro, actas)
 * muestran los valores del otrosí y deben regenerarse.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { invalidarCachePDF } from '@/lib/pdf/cache'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'
import { calcularDistribucionPeriodos } from '@/services/contratos'

export type TipoOtrosi = 'adicion' | 'prorroga' | 'modificatorio' | 'aclaratorio'

export interface Otrosi {
  id: string
  contrato_id: string
  numero: number
  tipo: TipoOtrosi
  fecha_inicio: string
  valor_adicion: number
  plazo_dias_adicion: number
  cdp: string | null
  crp: string | null
  nota: string | null
  created_at: string
}

/**
 * Edición de un otrosí ya registrado.
 *
 * Todos los campos son modificables —valor, plazo, CDP, CRP, fecha, tipo y
 * nota— porque un otrosí se digita a partir de un documento firmado y los
 * errores de transcripción se descubren después. Contratación es la oficina
 * que responde por esas cifras, así que es quien las corrige.
 *
 * El `numero` NO se edita: es el consecutivo del contrato y renumerarlo
 * rompería la referencia con el documento físico.
 */
export interface ActualizarOtrosiInput {
  otrosiId: string
  contratoId: string
  tipo: TipoOtrosi
  fecha_inicio: string
  valor_adicion: number
  plazo_dias_adicion: number
  cdp: string | null
  crp: string | null
  nota: string | null
}

export interface CrearOtrosiInput {
  contratoId: string
  tipo: TipoOtrosi
  fecha_inicio: string
  valor_adicion: number
  plazo_dias_adicion: number
  cdp: string | null
  crp: string | null
  nota: string | null
}

async function requireAdminId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  // Contratación registra otrosíes — es función natural de esa dependencia
  return data?.rol === 'admin' || data?.rol === 'contratacion' ? user.id : null
}

/** Invalida el caché de PDF de todos los periodos del contrato. */
async function invalidarCacheContrato(adminClient: ReturnType<typeof createAdminSupabaseClient>, contratoId: string) {
  const { data: periodos } = await adminClient
    .from('periodos')
    .select('id')
    .eq('contrato_id', contratoId)
  await Promise.all(
    (periodos ?? []).map((p: { id: string }) => invalidarCachePDF(adminClient, p.id).catch(() => {})),
  )
}

// ─── Listar ─────────────────────────────────────────────────────────────────

export async function getOtrosies(contratoId: string): Promise<Otrosi[]> {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('otrosies')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('numero')
  return (data ?? []) as Otrosi[]
}

// ─── Crear ──────────────────────────────────────────────────────────────────

export async function crearOtrosi(input: CrearOtrosiInput): Promise<ActionResult<{ id: string }>> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const tiposValidos: TipoOtrosi[] = ['adicion', 'prorroga', 'modificatorio', 'aclaratorio']
    if (!tiposValidos.includes(input.tipo)) return { error: 'Tipo de otrosí inválido' }
    if (!input.fecha_inicio) return { error: 'La fecha de inicio del otrosí es obligatoria' }
    if (!Number.isFinite(input.valor_adicion) || input.valor_adicion < 0) {
      return { error: 'El valor de la adición debe ser 0 o mayor' }
    }
    if (!Number.isInteger(input.plazo_dias_adicion) || input.plazo_dias_adicion < 0) {
      return { error: 'El plazo de la adición debe ser 0 o mayor' }
    }

    const adminClient = createAdminSupabaseClient()

    // numero = max + 1 (calculado en servidor para evitar colisiones)
    const { data: existentes } = await adminClient
      .from('otrosies')
      .select('numero')
      .eq('contrato_id', input.contratoId)
      .order('numero', { ascending: false })
      .limit(1)
    const siguienteNumero = (existentes?.[0]?.numero ?? 0) + 1

    const { data, error } = await adminClient
      .from('otrosies')
      .insert({
        contrato_id: input.contratoId,
        numero: siguienteNumero,
        tipo: input.tipo,
        fecha_inicio: input.fecha_inicio,
        valor_adicion: Math.round(input.valor_adicion),
        plazo_dias_adicion: input.plazo_dias_adicion,
        cdp: input.cdp?.trim() || null,
        crp: input.crp?.trim() || null,
        nota: input.nota?.trim() || null,
      })
      .select('id')
      .single()

    if (error) return { error: `Error al guardar el otrosí: ${error.message}` }

    await invalidarCacheContrato(adminClient, input.contratoId)
    revalidatePath(`/dashboard/contratos/${input.contratoId}`)
    return { data: { id: data.id as string } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Eliminar ───────────────────────────────────────────────────────────────

/**
 * Corrige un otrosí ya registrado.
 *
 * No existía: solo se podía crear y eliminar, así que corregir una cifra mal
 * digitada obligaba a borrar y volver a crear —perdiendo el consecutivo y el
 * rastro—. Aquí se edita en su sitio y queda constancia de qué cambió.
 *
 * Lo que este cambio NO hace por su cuenta es rehacer los periodos que el
 * otrosí ya hubiera generado. Es deliberado: un periodo puede estar radicado,
 * y reescribirlo desde aquí contradiría el expediente ya presentado. Tras
 * corregir, contratación ajusta los periodos que corresponda —puede hacerlo,
 * salvo los radicados, que quedan para el admin.
 */
export async function actualizarOtrosi(input: ActualizarOtrosiInput): Promise<ActionResult> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return { error: 'No autorizado' }

    const tiposValidos: TipoOtrosi[] = ['adicion', 'prorroga', 'modificatorio', 'aclaratorio']
    if (!tiposValidos.includes(input.tipo)) return { error: 'Tipo de otrosí inválido' }
    if (!input.fecha_inicio) return { error: 'La fecha de inicio del otrosí es obligatoria' }
    if (!Number.isFinite(input.valor_adicion) || input.valor_adicion < 0) {
      return { error: 'El valor de la adición debe ser 0 o mayor' }
    }
    if (!Number.isInteger(input.plazo_dias_adicion) || input.plazo_dias_adicion < 0) {
      return { error: 'El plazo de la adición debe ser 0 o mayor' }
    }

    const adminClient = createAdminSupabaseClient()

    // Se comprueba que el otrosí pertenezca al contrato indicado: sin esto,
    // un id de otro contrato pasaría la validación y editaría lo que no toca.
    const { data: actual } = await adminClient
      .from('otrosies')
      .select('id, contrato_id, numero')
      .eq('id', input.otrosiId)
      .single()
    if (!actual) return { error: 'El otrosí no existe' }
    if (actual.contrato_id !== input.contratoId) {
      return { error: 'El otrosí no pertenece a este contrato' }
    }

    const { error } = await adminClient
      .from('otrosies')
      .update({
        tipo: input.tipo,
        fecha_inicio: input.fecha_inicio,
        valor_adicion: Math.round(input.valor_adicion),
        plazo_dias_adicion: input.plazo_dias_adicion,
        cdp: input.cdp?.trim() || null,
        crp: input.crp?.trim() || null,
        nota: input.nota?.trim() || null,
      })
      .eq('id', input.otrosiId)

    if (error) return { error: `Error al guardar el otrosí: ${error.message}` }

    await invalidarCacheContrato(adminClient, input.contratoId)
    revalidatePath(`/dashboard/contratos/${input.contratoId}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}


// ─── Aplicar el otrosí al contrato ──────────────────────────────────────────
//
// EL PROBLEMA QUE RESUELVE. Hasta ahora el otrosí era solo un registro: se
// guardaba en su tabla y ahí terminaba. El valor sí se reflejaba —las
// pantallas y los PDF suman las adiciones al vuelo— pero el PLAZO no, y esa
// omisión bloqueaba al contratista: su contrato figuraba terminado en la
// fecha original y sin periodos donde reportar. Medido el 2 de septiembre de
// 2026, tres contratos reales (002, 003 y 004) llevaban un día en esa
// situación, con otrosí vigente hasta diciembre.
//
// EL SOFTWARE PROPONE, CONTRATACIÓN DECIDE. La previsualización calcula las
// fechas y reparte el valor de la adición entre los meses nuevos, pero es una
// sugerencia: contratación la revisa, la ajusta y confirma. Y después puede
// seguir editando cada periodo, porque el valor definitivo lo fija esa
// oficina, no una fórmula.
//
// NO TOCA LO EXISTENTE. Solo crea los periodos que faltan. Los que ya existen
// —y sobre todo los radicados— quedan intactos: reescribirlos contradiría un
// expediente ya presentado en SECOP II.

export interface PeriodoPropuesto {
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
}

export interface PrevisualizacionOtrosi {
  fechaFinActual: string
  fechaFinPropuesta: string
  valorAdicion: number
  periodosPropuestos: PeriodoPropuesto[]
  /** Meses que ya tienen periodo y por eso no se proponen de nuevo. */
  mesesOmitidos: string[]
}

/**
 * Calcula —sin escribir nada— cómo quedaría el contrato si se aplica el
 * otrosí. Sirve para que contratación vea las cifras antes de confirmar.
 */
export async function previsualizarOtrosi(
  otrosiId: string,
): Promise<ActionResult<PrevisualizacionOtrosi>> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return { error: 'No autorizado' }

    const adminClient = createAdminSupabaseClient()
    const { data: otrosi } = await adminClient
      .from('otrosies')
      .select('id, contrato_id, fecha_inicio, valor_adicion, plazo_dias_adicion')
      .eq('id', otrosiId)
      .single()
    if (!otrosi) return { error: 'El otrosí no existe' }

    const { data: contrato } = await adminClient
      .from('contratos')
      .select('id, fecha_fin, valor_mensual')
      .eq('id', otrosi.contrato_id)
      .single()
    if (!contrato) return { error: 'El contrato no existe' }

    if (!otrosi.plazo_dias_adicion || otrosi.plazo_dias_adicion <= 0) {
      return { error: 'Este otrosí no adiciona plazo, así que no genera periodos nuevos.' }
    }

    // El plazo cuenta DESDE la fecha de inicio del otrosí, inclusive: 110 días
    // desde el 1 de septiembre terminan el 19 de diciembre, no el 20. Esa
    // fecha es una propuesta — contratación la confirma o la cambia.
    const inicio = new Date(otrosi.fecha_inicio + 'T00:00:00')
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + otrosi.plazo_dias_adicion - 1)
    const fechaFinPropuesta = fin.toISOString().slice(0, 10)

    // El reparto sugerido usa el valor mensual vigente y deja el residuo en el
    // último mes, igual que al crear un contrato. En los otrosíes registrados
    // hasta hoy la adición equivale a un número exacto de mensualidades, así
    // que el residuo da cero; cuando no dé, el ajuste queda a la vista.
    const distribucion = calcularDistribucionPeriodos({
      fechaInicio: otrosi.fecha_inicio,
      fechaFin: fechaFinPropuesta,
      valorTotal: Number(otrosi.valor_adicion) || 0,
      valorMensual: Number(contrato.valor_mensual) || 0,
    })

    // Los meses que ya tienen periodo no se vuelven a crear.
    const { data: existentes } = await adminClient
      .from('periodos')
      .select('mes, anio, numero_periodo')
      .eq('contrato_id', otrosi.contrato_id)
    const yaExiste = new Set(
      (existentes ?? []).map((p: { mes: string; anio: number }) => `${p.mes.toLowerCase()}-${p.anio}`),
    )
    const ultimoNumero = Math.max(
      0,
      ...(existentes ?? []).map((p: { numero_periodo: number }) => p.numero_periodo ?? 0),
    )

    const mesesOmitidos: string[] = []
    const periodosPropuestos: PeriodoPropuesto[] = []
    let n = ultimoNumero
    for (const d of distribucion) {
      const clave = `${d.mes.toLowerCase()}-${d.anio}`
      if (yaExiste.has(clave)) { mesesOmitidos.push(`${d.mes} ${d.anio}`); continue }
      n += 1
      periodosPropuestos.push({
        numero_periodo: n,
        mes: d.mes,
        anio: d.anio,
        fecha_inicio: d.fechaInicio,
        fecha_fin: d.fechaFin,
        valor_cobro: d.valorCobro,
      })
    }

    return {
      data: {
        fechaFinActual: contrato.fecha_fin as string,
        fechaFinPropuesta,
        valorAdicion: Number(otrosi.valor_adicion) || 0,
        periodosPropuestos,
        mesesOmitidos,
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Aplica el otrosí con las cifras que contratación confirmó.
 *
 * Recibe los periodos ya revisados —no los recalcula— porque el valor de cada
 * mes lo decide contratación y puede diferir de la sugerencia.
 */
export async function aplicarOtrosi(
  otrosiId: string,
  fechaFinNueva: string,
  periodos: PeriodoPropuesto[],
): Promise<ActionResult<{ creados: number }>> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return { error: 'No autorizado' }

    if (!fechaFinNueva) return { error: 'La nueva fecha de terminación es obligatoria' }
    for (const p of periodos) {
      if (!Number.isFinite(p.valor_cobro) || p.valor_cobro < 0) {
        return { error: `El valor de ${p.mes} ${p.anio} debe ser 0 o mayor` }
      }
    }

    const adminClient = createAdminSupabaseClient()
    const { data: otrosi } = await adminClient
      .from('otrosies')
      .select('id, contrato_id, numero')
      .eq('id', otrosiId)
      .single()
    if (!otrosi) return { error: 'El otrosí no existe' }

    const { data: contrato } = await adminClient
      .from('contratos')
      .select('id, fecha_fin')
      .eq('id', otrosi.contrato_id)
      .single()
    if (!contrato) return { error: 'El contrato no existe' }

    // La fecha nueva no puede acortar el contrato: eso dejaría periodos ya
    // creados fuera de su vigencia. Para recortar hay que ir por otra vía.
    if (fechaFinNueva < (contrato.fecha_fin as string)) {
      return { error: 'La nueva fecha de terminación no puede ser anterior a la actual' }
    }

    // 1. Extender la vigencia del contrato. Sin esto el contratista sigue
    //    bloqueado aunque los periodos existan.
    const { error: eContrato } = await adminClient
      .from('contratos')
      .update({ fecha_fin: fechaFinNueva })
      .eq('id', otrosi.contrato_id)
    if (eContrato) return { error: `Error al extender el contrato: ${eContrato.message}` }

    // 2. Crear los periodos nuevos, en borrador. Se omite lo que ya exista
    //    —comprobado otra vez aquí, no solo en la previsualización, porque
    //    entre una y otra pudo crearse algo.
    let creados = 0
    if (periodos.length) {
      const { data: existentes } = await adminClient
        .from('periodos')
        .select('mes, anio')
        .eq('contrato_id', otrosi.contrato_id)
      const yaExiste = new Set(
        (existentes ?? []).map((p: { mes: string; anio: number }) => `${p.mes.toLowerCase()}-${p.anio}`),
      )
      const filas = periodos
        .filter(p => !yaExiste.has(`${p.mes.toLowerCase()}-${p.anio}`))
        .map(p => ({
          contrato_id: otrosi.contrato_id,
          numero_periodo: p.numero_periodo,
          mes: p.mes,
          anio: p.anio,
          fecha_inicio: p.fecha_inicio,
          fecha_fin: p.fecha_fin,
          valor_cobro: Math.round(p.valor_cobro),
          estado: 'borrador',
          es_historico: false,
        }))
      if (filas.length) {
        const { error: ePeriodos } = await adminClient.from('periodos').insert(filas)
        if (ePeriodos) return { error: `Error creando los periodos: ${ePeriodos.message}` }
        creados = filas.length
      }
    }

    await invalidarCacheContrato(adminClient, otrosi.contrato_id)
    revalidatePath(`/dashboard/contratos/${otrosi.contrato_id}`)
    revalidatePath('/dashboard')
    return { data: { creados } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

export async function eliminarOtrosi(otrosiId: string, contratoId: string): Promise<ActionResult> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient.from('otrosies').delete().eq('id', otrosiId)
    if (error) return { error: `Error al eliminar: ${error.message}` }

    await invalidarCacheContrato(adminClient, contratoId)
    revalidatePath(`/dashboard/contratos/${contratoId}`)
    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
