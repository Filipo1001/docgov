'use server'

/**
 * El seguimiento por años del módulo Plan de Desarrollo (Fase B): reportes con evidencia (quien tiene el
 * indicador), validación (la secretaría) y comentarios.
 *
 * Todas siguen el mismo camino que `app/actions/pdm.ts` y ninguna se salta una puerta:
 *
 *   1. `accesoPdm()`: fuera de la vista previa (producción) no hacen nada.
 *   2. El nivel de quien pide, leído del servidor y no del navegador.
 *   3. Se valida lo que llega ANTES de preguntarle nada a la base.
 *   4. La base decide: funciones SECURITY INVOKER (migraciones 056 y 057) con la sesión de quien pide, así
 *      que mandan las políticas. Aunque alguien invocara esto a mano, la base lo negaría.
 *
 * ── Las evidencias ───────────────────────────────────────────────────────
 *
 * Siguen el patrón de subida del resto de CD: el servidor firma una dirección, el navegador sube
 * el archivo DIRECTO al almacenamiento (subir varios MB a través de una acción agota el tiempo de la
 * función en Vercel) y después se registra. El espacio `pdm-evidencias` es privado y sin políticas:
 * solo este archivo lo toca, con la clave de servicio, DESPUÉS de comprobar con la sesión de quien
 * pide que el indicador es suyo y que el año ya empezó.
 *
 *   · La ruta la decide el servidor: `{plan}/{indicador}/{año}/{uuid}.{ext}`. El navegador no
 *     elige dónde se guarda nada.
 *   · Al registrar el reporte NO se cree lo que el navegador dice del archivo: se lee del
 *     almacenamiento su tamaño y su tipo reales.
 *   · Si registrar falla, los archivos recién subidos se borran (no quedan huérfanos), pero solo
 *     los que no pertenecen a otro reporte.
 *   · Ver una evidencia: se comprueba con la sesión que quien pide ve ese reporte (RLS) y recién
 *     entonces se firma una dirección de cinco minutos.
 *
 * Nunca devuelven el error crudo de la base: `traducirErrorPdm` deja pasar solo los mensajes
 * escritos para leerse.
 */

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { accesoPdm, type AccesoPdm } from '@/lib/pdm/acceso'
import { gestiona } from '@/lib/pdm/niveles'
import { esUuid, traducirErrorPdm, type Resultado } from '@/lib/pdm/acciones'
import { hoyBogota } from '@/lib/pdm/contrato'
import { anioDeFecha, anioIniciado, esAnioPlan } from '@/lib/pdm/seguimiento'
import { armarDetalle, type FilaComentario, type FilaEvidencia, type FilaReporteDetalle, type FilaValidacion } from '@/lib/pdm/detalle-armar'
import {
  MAX_BYTES_EVIDENCIA, MAX_EVIDENCIAS, MAX_MOTIVO_CORRECCION, MAX_NOMBRE_ARCHIVO,
  TIPOS_EVIDENCIA, errorEnArchivos, errorEnComentario, errorEnReporte, errorEnValidacion, tipoDeArchivo,
  type DetalleIndicador, type EntradaComentar, type EntradaPrepararEvidencias, type EntradaReportar,
  type EntradaValidar, type EvidenciaPreparada, type EvidenciaSubida,
} from '@/lib/pdm/seguimiento-acciones'

const BUCKET = 'pdm-evidencias'
const SIN_PERMISO = 'No tienes permiso para hacer este cambio.'
const SOLO_RESPONSABLES = 'Solo quien tiene el indicador a su cargo puede reportarlo.'
const GENERICO = traducirErrorPdm()

const refrescar = () => revalidatePath('/dashboard/plan-desarrollo', 'layout')

const falla = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Sesión de quien pide, con el acceso ya comprobado. */
async function sesionPdm(permite: (a: AccesoPdm) => boolean = () => true) {
  const acceso = await accesoPdm()
  if (!acceso || !permite(acceso)) return null
  return { acceso, supabase: await createServerSupabaseClient() }
}

// ─── Reportar ─────────────────────────────────────────────────────────────────

/**
 * A qué plan va un reporte de este indicador en este año, o por qué no se puede.
 * Se pregunta con la sesión de quien reporta: si no ve el indicador, no lo tiene a su cargo o el año no
 * ha empezado, no hay nada que preparar. (La base lo vuelve a decidir al registrar.)
 */
async function contextoDeReporte(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  indicador: string,
  anio: unknown,
  usuarioId: string,
): Promise<{ ok: true; planId: string; anio: number } | { ok: false; error: string }> {
  if (!esAnioPlan(anio)) return { ok: false, error: 'Elige un año del plan.' }
  if (!anioIniciado(anio, anioDeFecha(hoyBogota()))) {
    return { ok: false, error: `El ${anio} empieza el 1 de enero: todavía no se puede reportar.` }
  }
  const [ind, asi] = await Promise.all([
    supabase.from('pdm_indicadores').select('plan_id').eq('id', indicador).eq('activo', true).maybeSingle(),
    supabase.from('pdm_asignaciones').select('usuario_id').eq('indicador_id', indicador).eq('usuario_id', usuarioId).limit(1),
  ])
  if (ind.error || asi.error) return { ok: false, error: GENERICO }
  if (!ind.data) return { ok: false, error: 'El indicador no existe o no tienes acceso a él.' }
  if (!asi.data?.length) return { ok: false, error: SOLO_RESPONSABLES }
  return { ok: true, planId: ind.data.plan_id as string, anio }
}

/** Reportar lo hace quien tiene el indicador a su cargo: ni el administrador ni Control Interno lo hacen por otro. */
const puedeReportar = (a: AccesoPdm) => a.nivel === 'responsable' || a.nivel === 'coordinador'

export async function prepararEvidencias(e: EntradaPrepararEvidencias): Promise<Resultado<EvidenciaPreparada[]>> {
  try {
    const s = await sesionPdm()
    if (!s) return falla(SIN_PERMISO)
    if (!puedeReportar(s.acceso)) return falla(SOLO_RESPONSABLES)
    if (!esUuid(e?.indicador) || !Array.isArray(e.archivos)) return falla('Algo de lo elegido no es válido.')
    const archivos = e.archivos.map(a => ({
      nombre: typeof a?.nombre === 'string' ? a.nombre : '',
      tipo: typeof a?.tipo === 'string' ? a.tipo : '',
      bytes: typeof a?.bytes === 'number' ? a.bytes : NaN,
    }))
    const mal = errorEnArchivos(archivos)
    if (mal) return falla(mal)

    const ctx = await contextoDeReporte(s.supabase, e.indicador, e.anio, s.acceso.userId)
    if (!ctx.ok) return falla(ctx.error)

    const admin = createAdminSupabaseClient()
    const preparadas: EvidenciaPreparada[] = []
    for (const a of archivos) {
      const tipo = tipoDeArchivo(a.nombre, a.tipo)!
      const ruta = `${ctx.planId}/${e.indicador}/${ctx.anio}/${randomUUID()}.${tipo.ext}`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(ruta, { upsert: false })
      if (error || !data) {
        console.error('[pdm/seguimiento] prepararEvidencias:', error?.message)
        return falla('No se pudo preparar la subida. Intenta de nuevo.')
      }
      preparadas.push({ ruta, urlSubida: data.signedUrl, tipo: tipo.mime })
    }
    return { ok: true, datos: preparadas }
  } catch (err) {
    console.error('[pdm/seguimiento] prepararEvidencias:', err)
    return falla(GENERICO)
  }
}

const NOMBRE_RUTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]{3,4}$/

export async function reportar(e: EntradaReportar): Promise<Resultado<{ reporte: string; correccion: boolean }>> {
  try {
    const s = await sesionPdm()
    if (!s) return falla(SIN_PERMISO)
    if (!puedeReportar(s.acceso)) return falla(SOLO_RESPONSABLES)
    if (!esUuid(e?.indicador)) return falla('Algo de lo elegido no es válido.')

    // Que sea o no corrección lo decide la base (si el último reporte del año está sin cerrar); aquí se revisa lo que se sabe.
    const mal = errorEnReporte(e, false)
    if (mal) return falla(mal)
    const motivo = typeof e.motivo === 'string' ? e.motivo.trim() : ''
    if (motivo.length > MAX_MOTIVO_CORRECCION) return falla(`El motivo no puede pasar de ${MAX_MOTIVO_CORRECCION} caracteres.`)
    if (!Array.isArray(e.evidencias) || e.evidencias.length === 0) return falla('Adjunta al menos una evidencia.')
    if (e.evidencias.length > MAX_EVIDENCIAS) return falla(`Una evidencia admite hasta ${MAX_EVIDENCIAS} archivos.`)

    const ctx = await contextoDeReporte(s.supabase, e.indicador, e.anio, s.acceso.userId)
    if (!ctx.ok) return falla(ctx.error)
    const carpeta = `${ctx.planId}/${e.indicador}/${ctx.anio}`

    // Cada ruta es de ESTE indicador y ESTE año, con el nombre que armó el servidor.
    const rutas: string[] = []
    for (const ev of e.evidencias) {
      const ruta = typeof ev?.ruta === 'string' ? ev.ruta : ''
      const nombre = typeof ev?.nombre === 'string' ? ev.nombre.trim() : ''
      if (!ruta.startsWith(`${carpeta}/`) || !NOMBRE_RUTA.test(ruta.slice(carpeta.length + 1))) {
        return falla('Una evidencia no corresponde a este indicador y este año. Vuelve a adjuntarla.')
      }
      if (nombre === '' || nombre.length > MAX_NOMBRE_ARCHIVO) return falla('Un archivo tiene un nombre que no sirve.')
      rutas.push(ruta)
    }
    if (new Set(rutas).size !== rutas.length) return falla('Un mismo archivo está repetido.')

    // Lo que de verdad llegó al almacenamiento: existencia, tamaño y tipo reales (no los que dice el navegador).
    const admin = createAdminSupabaseClient()
    const listado = await admin.storage.from(BUCKET).list(carpeta, { limit: 100 })
    if (listado.error || !listado.data) {
      console.error('[pdm/seguimiento] reportar (listado):', listado.error?.message)
      return falla(GENERICO)
    }
    const enAlmacen = new Map(listado.data.map(o => [o.name, o]))
    const evidencias: EvidenciaSubida[] = []
    for (let k = 0; k < rutas.length; k++) {
      const obj = enAlmacen.get(rutas[k].slice(carpeta.length + 1))
      const bytes = Number((obj?.metadata as { size?: unknown } | null | undefined)?.size)
      const tipo = (obj?.metadata as { mimetype?: unknown } | null | undefined)?.mimetype
      if (!obj || !Number.isFinite(bytes) || bytes < 1 || typeof tipo !== 'string') {
        return falla('Un archivo no llegó a subirse. Vuelve a adjuntarlo.')
      }
      if (bytes > MAX_BYTES_EVIDENCIA || !TIPOS_EVIDENCIA.some(t => t.mime === tipo)) {
        await admin.storage.from(BUCKET).remove(rutas).catch(() => {})
        return falla('Un archivo no es válido como evidencia. Vuelve a adjuntarlo.')
      }
      evidencias.push({ ruta: rutas[k], nombre: e.evidencias[k].nombre.trim(), tipo, bytes })
    }

    // Que ninguno pertenezca ya a otro reporte: así, si registrar falla, borrar lo subido no toca lo de nadie.
    const yaUsadas = await admin.from('pdm_evidencias').select('ruta').in('ruta', rutas)
    if (yaUsadas.error) return falla(GENERICO)
    if (yaUsadas.data?.length) return falla('Uno de esos archivos ya está en otro reporte. Vuelve a adjuntarlo.')

    const { data, error } = await s.supabase.rpc('pdm_reportar', {
      p_indicador: e.indicador, p_anio: ctx.anio, p_valor: e.valor, p_texto: e.texto.trim(), p_evidencias: evidencias, p_motivo: motivo || null,
    })
    if (error) {
      await admin.storage.from(BUCKET).remove(rutas).catch(() => {})
      return falla(traducirErrorPdm(error.code, error.message))
    }
    const d = (data ?? {}) as { reporte?: unknown; correccion?: unknown }
    if (!esUuid(d.reporte)) return falla(GENERICO)
    refrescar()
    return { ok: true, datos: { reporte: d.reporte, correccion: d.correccion === true } }
  } catch (err) {
    console.error('[pdm/seguimiento] reportar:', err)
    return falla(GENERICO)
  }
}

// ─── Validar y comentar ───────────────────────────────────────────────────────

export async function validarReporte(e: EntradaValidar): Promise<Resultado<{ cambio: 'aprobado' | 'devuelto' | 'ninguno' }>> {
  try {
    const s = await sesionPdm(a => gestiona(a.nivel))
    if (!s) return falla(SIN_PERMISO)
    if (!esUuid(e?.reporte)) return falla('Algo de lo elegido no es válido.')
    const mal = errorEnValidacion(e.estado, e.comentario)
    if (mal) return falla(mal)

    const { data, error } = await s.supabase.rpc('pdm_validar', {
      p_reporte: e.reporte, p_estado: e.estado, p_comentario: e.comentario?.trim() || null,
    })
    if (error) return falla(traducirErrorPdm(error.code, error.message))
    const cambio = (data as { cambio?: unknown } | null)?.cambio
    refrescar()
    return { ok: true, datos: { cambio: cambio === 'aprobado' || cambio === 'devuelto' ? cambio : 'ninguno' } }
  } catch (err) {
    console.error('[pdm/seguimiento] validarReporte:', err)
    return falla(GENERICO)
  }
}

export async function comentar(e: EntradaComentar): Promise<Resultado> {
  try {
    const s = await sesionPdm()
    if (!s) return falla(SIN_PERMISO)
    if (!esUuid(e?.indicador) || (e.reporte !== undefined && !esUuid(e.reporte))) return falla('Algo de lo elegido no es válido.')
    const mal = errorEnComentario(e.texto)
    if (mal) return falla(mal)

    const { error } = await s.supabase.rpc('pdm_comentar', {
      p_indicador: e.indicador, p_texto: e.texto.trim(), p_reporte: e.reporte ?? null,
    })
    if (error) return falla(traducirErrorPdm(error.code, error.message))
    return { ok: true, datos: undefined }
  } catch (err) {
    console.error('[pdm/seguimiento] comentar:', err)
    return falla(GENERICO)
  }
}

// ─── Leer el detalle ──────────────────────────────────────────────────────────

/**
 * Todo lo que hay detrás de un indicador: sus reportes de todos los años (cada versión), las evidencias, las
 * validaciones y los comentarios. Lo que ve cada quien lo decide la base.
 */
export async function detalleIndicador(indicador: string): Promise<Resultado<DetalleIndicador>> {
  try {
    const s = await sesionPdm()
    if (!s) return falla(SIN_PERMISO)
    if (!esUuid(indicador)) return falla('Algo de lo elegido no es válido.')

    const ind = await s.supabase.from('pdm_indicadores').select('id, dependencia_id').eq('id', indicador).maybeSingle()
    if (ind.error) return falla(GENERICO)
    if (!ind.data) return falla('El indicador no existe o no tienes acceso a él.')

    const [rep, com] = await Promise.all([
      s.supabase
        .from('pdm_reportes')
        .select('id, anio, valor, valor_anterior, texto, autor_id, autor_nombre, corrige_a, motivo_correccion, created_at')
        .eq('indicador_id', indicador),
      s.supabase
        .from('pdm_comentarios')
        .select('id, reporte_id, texto, autor_nombre, autor_nivel, created_at')
        .eq('indicador_id', indicador)
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    if (rep.error || com.error || !rep.data || !com.data) return falla(GENERICO)

    const ids = rep.data.map(r => r.id as string)
    let evidencias: FilaEvidencia[] = []
    let validaciones: FilaValidacion[] = []
    if (ids.length) {
      const [evi, val] = await Promise.all([
        s.supabase.from('pdm_evidencias').select('id, reporte_id, nombre, tipo, bytes').in('reporte_id', ids),
        s.supabase.from('pdm_validaciones').select('reporte_id, estado, comentario, validador_nombre, created_at').in('reporte_id', ids),
      ])
      if (evi.error || val.error || !evi.data || !val.data) return falla(GENERICO)
      evidencias = evi.data as FilaEvidencia[]
      validaciones = val.data as FilaValidacion[]
    }

    const nivel = s.acceso.nivel
    const puedeValidarElIndicador = nivel === 'admin'
      || (nivel === 'coordinador' && s.acceso.dependenciaId !== null && s.acceso.dependenciaId === ind.data.dependencia_id)

    return {
      ok: true,
      datos: armarDetalle({
        reportes: rep.data as unknown as FilaReporteDetalle[],
        evidencias,
        validaciones,
        comentarios: com.data as FilaComentario[],
        yoId: s.acceso.userId,
        puedeValidarElIndicador,
      }),
    }
  } catch (err) {
    console.error('[pdm/seguimiento] detalleIndicador:', err)
    return falla(GENERICO)
  }
}

/** Una dirección de cinco minutos para ver una evidencia, solo si quien pide ve el reporte al que pertenece. */
export async function urlEvidencia(evidencia: string): Promise<Resultado<{ url: string }>> {
  try {
    const s = await sesionPdm()
    if (!s) return falla(SIN_PERMISO)
    if (!esUuid(evidencia)) return falla('Algo de lo elegido no es válido.')

    // Con la sesión de quien pide: si la base no le muestra la fila, no hay nada que firmar.
    const { data, error } = await s.supabase.from('pdm_evidencias').select('ruta').eq('id', evidencia).maybeSingle()
    if (error) return falla(GENERICO)
    if (!data) return falla('No tienes acceso a esa evidencia.')

    const firmada = await createAdminSupabaseClient().storage.from(BUCKET).createSignedUrl(data.ruta as string, 300)
    if (firmada.error || !firmada.data?.signedUrl) return falla('No se pudo abrir el archivo. Intenta de nuevo.')
    return { ok: true, datos: { url: firmada.data.signedUrl } }
  } catch (err) {
    console.error('[pdm/seguimiento] urlEvidencia:', err)
    return falla(GENERICO)
  }
}
