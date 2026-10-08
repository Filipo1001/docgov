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
  /** Cuándo se aplicó al contrato; `null` si solo está registrado (migración 061). */
  aplicado_en: string | null
  /** Quién lo aplicó. `null` con `aplicado_en` lleno: se aplicó antes del 8-oct-2026 y el registro se reconstruyó. */
  aplicado_por: string | null
  /** La fecha de terminación que tenía el contrato antes de aplicarlo: la que vuelve si se elimina. */
  fecha_fin_anterior: string | null
  /** La fecha de terminación que dejó al aplicarlo. */
  fecha_fin_aplicada: string | null
}

/**
 * Las funciones de la base (`aplicar_otrosi`, `eliminar_otrosi` y el disparador que protege a un otrosí aplicado)
 * escriben sus negativas para leerse, con el prefijo `OTROSI:`. Cualquier otro error es técnico y no se muestra tal cual.
 */
function mensajeDeLaBase(error: { message?: string } | null, porDefecto: string): string {
  const m = error?.message ?? ''
  return m.startsWith('OTROSI: ') ? m.slice('OTROSI: '.length) : porDefecto
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

    // Un otrosí ya aplicado no cambia su fecha de inicio ni su plazo (lo impide la base): el mensaje dice qué hacer.
    if (error) return { error: mensajeDeLaBase(error, `Error al guardar el otrosí: ${error.message}`) }

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
  /** Lo que conviene revisar antes de confirmar (p. ej. un periodo de un solo día en $0). */
  advertencias: string[]
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

    // Un mes de un solo día y en $0 casi siempre es un día de más en el plazo (el caso del 045/2026: 62 días desde
    // el 1 de octubre llegan al 1 de diciembre). No se quita solo —puede ser real—, pero se avisa antes de crearlo.
    const advertencias = periodosPropuestos
      .filter(p => p.fecha_inicio === p.fecha_fin && p.valor_cobro === 0)
      .map(p => `${p.mes} ${p.anio} quedaría de un solo día y en $0: revise el plazo del otrosí o la fecha de terminación.`)

    return {
      data: {
        fechaFinActual: contrato.fecha_fin as string,
        fechaFinPropuesta,
        valorAdicion: Number(otrosi.valor_adicion) || 0,
        periodosPropuestos,
        mesesOmitidos,
        advertencias,
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
      .select('id, contrato_id')
      .eq('id', otrosiId)
      .single()
    if (!otrosi) return { error: 'El otrosí no existe' }

    // Todo en la base y en una transacción (migración 061): se extiende el contrato, se crean los periodos ligados al
    // otrosí y queda registrado qué cambió (la fecha anterior, la nueva, quién y cuándo). Antes eran dos escrituras
    // sueltas, y si la segunda fallaba el contrato quedaba extendido sin periodos. La base también comprueba que ningún
    // periodo termine después de la nueva fecha de terminación.
    const { data, error } = await adminClient.rpc('aplicar_otrosi', {
      p_otrosi: otrosiId,
      p_fecha_fin: fechaFinNueva,
      p_periodos: periodos.map(p => ({ ...p, valor_cobro: Math.round(p.valor_cobro) })),
      p_usuario: gestorId,
    })
    if (error) return { error: mensajeDeLaBase(error, `Error al aplicar el otrosí: ${error.message}`) }

    await invalidarCacheContrato(adminClient, otrosi.contrato_id)
    revalidatePath(`/dashboard/contratos/${otrosi.contrato_id}`)
    revalidatePath('/dashboard')
    return { data: { creados: Number((data as { creados?: number } | null)?.creados ?? 0) } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

// ─── Eliminar (y deshacer lo que hizo) ──────────────────────────────────────
//
// Eliminar un otrosí aplicado lo DESHACE: borra los periodos que creó, devuelve la fecha de terminación anterior y lo
// elimina, todo en una transacción (`eliminar_otrosi`, migración 061). Hasta el 8 de octubre de 2026 solo se borraba
// la fila del otrosí y el contrato quedaba extendido (caso del 045/2026).
//
// La base se niega —y dice por qué— si algún periodo del otrosí ya avanzó o tiene información (lo presentado no se
// borra), si hay un otrosí aplicado después, o si la fecha de terminación cambió a mano después de aplicarlo.

export interface PeriodoQueSeBorra {
  mes: string
  anio: number
  estado: string
  /** Ya avanzó o tiene información: impide deshacer. */
  conInformacion: boolean
}

export interface PrevisualizacionEliminacion {
  numero: number
  aplicado: boolean
  /** Se aplicó antes del 8-oct-2026: su registro se reconstruyó y la fecha anterior es una estimación. */
  reconstruido: boolean
  periodos: PeriodoQueSeBorra[]
  fechaFinActual: string | null
  fechaFinAnterior: string | null
  /** Por qué no se puede eliminar todavía; `null` si se puede. */
  bloqueo: string | null
}

const TABLAS_CON_INFORMACION = [
  'actividades', 'aprobaciones', 'preaprobaciones', 'documentos', 'documentos_emitidos',
  'obligacion_revisiones', 'actas_terminacion', 'historial_periodos',
] as const

/** Qué pasaría al eliminar el otrosí, sin tocar nada: lo que muestra la confirmación. La base lo vuelve a comprobar. */
export async function previsualizarEliminacionOtrosi(
  otrosiId: string,
  contratoId: string,
): Promise<ActionResult<PrevisualizacionEliminacion>> {
  try {
    const gestorId = await requireAdminId()
    if (!gestorId) return { error: 'No autorizado' }

    const adminClient = createAdminSupabaseClient()
    const { data: o } = await adminClient
      .from('otrosies')
      .select('id, contrato_id, numero, aplicado_en, aplicado_por, fecha_fin_anterior, fecha_fin_aplicada')
      .eq('id', otrosiId)
      .single()
    if (!o) return { error: 'El otrosí no existe' }
    if (o.contrato_id !== contratoId) return { error: 'El otrosí no pertenece a este contrato' }

    const [{ data: contrato }, { data: periodos }, { data: otros }] = await Promise.all([
      adminClient.from('contratos').select('fecha_fin').eq('id', contratoId).single(),
      adminClient.from('periodos').select('id, mes, anio, estado, es_historico, fecha_inicio').eq('otrosi_id', otrosiId).order('fecha_inicio'),
      adminClient.from('otrosies').select('numero, aplicado_en').eq('contrato_id', contratoId).neq('id', otrosiId).not('aplicado_en', 'is', null),
    ])
    const filas = (periodos ?? []) as { id: string; mes: string; anio: number; estado: string; es_historico: boolean }[]
    const aplicado = o.aplicado_en !== null || filas.length > 0

    // Qué periodos tienen algo adentro (una consulta por tabla, no por periodo).
    const ids = filas.map(p => p.id)
    const conAlgo = new Set<string>()
    if (ids.length) {
      const respuestas = await Promise.all(
        TABLAS_CON_INFORMACION.map(t => adminClient.from(t).select('periodo_id').in('periodo_id', ids)),
      )
      for (const r of respuestas) for (const x of (r.data ?? []) as { periodo_id: string }[]) conAlgo.add(x.periodo_id)
    }
    const periodosQueSeBorran: PeriodoQueSeBorra[] = filas.map(p => ({
      mes: p.mes,
      anio: p.anio,
      estado: p.estado,
      conInformacion: p.estado !== 'borrador' || p.es_historico || conAlgo.has(p.id),
    }))

    let bloqueo: string | null = null
    const posterior = ((otros ?? []) as { numero: number; aplicado_en: string }[])
      .filter(x => o.aplicado_en && x.aplicado_en > o.aplicado_en)
      .sort((a, b) => b.aplicado_en.localeCompare(a.aplicado_en))[0]
    const conInfo = periodosQueSeBorran.filter(p => p.conInformacion)
    if (aplicado && posterior) {
      bloqueo = `Primero hay que eliminar el otrosí N.º ${posterior.numero}, que se aplicó después de este.`
    } else if (conInfo.length) {
      bloqueo = `Estos periodos ya avanzaron o tienen información registrada: ${conInfo.map(p => `${p.mes} ${p.anio}`).join(', ')}. Lo que ya se presentó no se borra.`
    } else if (aplicado && o.fecha_fin_aplicada && contrato?.fecha_fin !== o.fecha_fin_aplicada) {
      bloqueo = `La fecha de terminación del contrato cambió después de aplicar este otrosí (hoy es ${contrato?.fecha_fin}; el otrosí la dejó en ${o.fecha_fin_aplicada}). Revísela antes de eliminarlo.`
    }

    return {
      data: {
        numero: o.numero as number,
        aplicado,
        reconstruido: aplicado && !o.aplicado_por,
        periodos: periodosQueSeBorran,
        fechaFinActual: (contrato?.fecha_fin as string | undefined) ?? null,
        fechaFinAnterior: (o.fecha_fin_anterior as string | null) ?? null,
        bloqueo,
      },
    }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

export async function eliminarOtrosi(
  otrosiId: string,
  contratoId: string,
): Promise<ActionResult<{ revertido: boolean; periodos: number; fechaFin: string | null }>> {
  try {
    const adminId = await requireAdminId()
    if (!adminId) return { error: 'No autorizado' }

    const adminClient = createAdminSupabaseClient()
    // Como al editar: un id de otro contrato no puede colarse.
    const { data: actual } = await adminClient.from('otrosies').select('contrato_id').eq('id', otrosiId).single()
    if (!actual) return { error: 'El otrosí no existe' }
    if (actual.contrato_id !== contratoId) return { error: 'El otrosí no pertenece a este contrato' }

    const { data, error } = await adminClient.rpc('eliminar_otrosi', { p_otrosi: otrosiId })
    if (error) return { error: mensajeDeLaBase(error, `Error al eliminar: ${error.message}`) }

    await invalidarCacheContrato(adminClient, contratoId)
    revalidatePath(`/dashboard/contratos/${contratoId}`)
    revalidatePath('/dashboard')
    const r = (data ?? {}) as { revertido?: boolean; periodos?: number; fecha_fin?: string | null }
    return { data: { revertido: !!r.revertido, periodos: Number(r.periodos ?? 0), fechaFin: r.fecha_fin ?? null } }
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
