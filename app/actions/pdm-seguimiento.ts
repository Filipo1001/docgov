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
 *   · La HUELLA (SHA-256) de cada archivo nuevo la calcula el servidor leyendo lo que ya está guardado, y la anota en
 *     un libro al que solo escribe la clave de servicio; al registrar, la base la copia a la evidencia solo si la ruta,
 *     el tamaño y la persona coinciden (migración 070). Nada de lo que diga el navegador cuenta para la huella.
 *   · Si registrar falla, los archivos recién subidos se borran (no quedan huérfanos), pero solo
 *     los que no pertenecen a otro reporte. Lo que se CONSERVA de la versión anterior nunca se borra:
 *     es de un reporte que ya existe.
 *   · Al corregir un reporte se pueden conservar archivos de la versión anterior (la base comprueba que
 *     sean de ella y que no estén devueltos) en vez de subirlos otra vez.
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
import { avisarDespues } from '@/lib/pdm/correos/despues'
import { avisarAnulacion, avisarComentario, avisarReporteDeApoyo, avisarReporteEnviado, avisarValidacion } from '@/lib/pdm/correos/enviar'
import { gestiona } from '@/lib/pdm/niveles'
import { anotarHuellas, huellaDeObjeto, type HuellaCalculada } from '@/lib/pdm/huella-servidor'
import { esUuid, traducirErrorPdm, type Resultado } from '@/lib/pdm/acciones'
import { hoyBogota } from '@/lib/pdm/contrato'
import { anioDeFecha, anioIniciado, esAnioPlan } from '@/lib/pdm/seguimiento'
import { armarDetalle, type FilaComentario, type FilaEvidencia, type FilaReporteDetalle, type FilaValidacion } from '@/lib/pdm/detalle-armar'
import { errorEnAnulacion, type AccionAnulacion, type FilaAnulacion } from '@/lib/pdm/anulaciones'
import { direccionReanudable } from '@/lib/pdm/subir-reanudable'
import { LIMITE_EN_PARALELO, conLimite } from '@/lib/pdm/con-limite'
import { armarBorradores, type FilaBorrador, type FilaBorradorArchivo } from '@/lib/pdm/borradores'
import {
  MAX_EVIDENCIAS, MAX_MOTIVO_CORRECCION, MAX_NOMBRE_ARCHIVO, MENSAJE_DEMASIADOS_ARCHIVOS,
  esNombreDeEvidenciaEnAlmacen, esVideo, errorEnArchivos, errorEnBorrador, limiteDeTipo, errorEnComentario, errorEnReporte, errorEnValidacion, tipoDeArchivo,
  type BorradorArchivo, type BorradorVista, type DetalleIndicador, type EntradaAnulacion, type EntradaComentar, type EntradaDescartarBorrador,
  type EntradaGuardarBorrador, type EntradaPrepararEvidencias, type EntradaReportar, type EntradaValidar, type EvidenciaPreparada, type EvidenciaSubida,
} from '@/lib/pdm/seguimiento-acciones'

const BUCKET = 'pdm-evidencias'
const SIN_PERMISO = 'No tienes permiso para hacer este cambio.'
const SOLO_RESPONSABLES = 'Solo quien tiene el indicador a su cargo puede reportarlo.'
const GENERICO = traducirErrorPdm()

const refrescar = () => revalidatePath('/dashboard/plan-desarrollo', 'layout')

const falla = (error: string): { ok: false; error: string } => ({ ok: false, error })

/**
 * Un rechazo que se le dice a la persona Y queda en el registro del servidor. Sin esto, las subidas que no pasaban
 * (un tipo, un tamaño, un permiso) devolvían su mensaje al navegador y no dejaban NINGÚN rastro: imposible saber después
 * qué había pasado. Los nombres de archivo se tapan: el registro cuenta el motivo, no el contenido.
 */
const rechazo = (donde: string, mensaje: string): { ok: false; error: string } => {
  console.warn(`[pdm/seguimiento] ${donde} rechazado: ${mensaje.replace(/«[^»]*»/g, '«…»')}`)
  return falla(mensaje)
}

/**
 * Busca en el almacenamiento los objetos de una carpeta que se llamen así, recorriendo la carpeta por páginas. Antes se
 * leían solo los primeros 100: en un indicador con muchas versiones, el archivo recién subido podía quedar en la segunda
 * página y el reporte se rechazaba con «un archivo no llegó a subirse» aunque sí había llegado.
 */
async function buscarEnAlmacen(
  admin: ReturnType<typeof createAdminSupabaseClient>, carpeta: string, nombres: string[],
): Promise<{ data: { name: string; metadata?: unknown }[]; error: { message: string } | null }> {
  const faltan = new Set(nombres)
  const halladas: { name: string; metadata?: unknown }[] = []
  for (let pagina = 0; pagina < 30 && faltan.size > 0; pagina++) {
    const { data, error } = await admin.storage.from(BUCKET).list(carpeta, { limit: 100, offset: pagina * 100 })
    if (error || !data) return { data: halladas, error: error ?? { message: 'sin datos' } }
    for (const o of data) if (faltan.delete(o.name)) halladas.push(o)
    if (data.length < 100) break
  }
  return { data: halladas, error: null }
}

/**
 * Las rutas de los archivos que hay hoy en el borrador de este indicador y año (vacío si no hay borrador), o `null` si no se pudieron
 * leer. Sirve para una sola cosa: que fallar un envío NUNCA quite del almacenamiento lo que está guardado en un borrador.
 */
async function rutasDelBorrador(admin: ReturnType<typeof createAdminSupabaseClient>, indicador: string, anio: number): Promise<Set<string> | null> {
  const b = await admin.from('pdm_borradores').select('id').eq('indicador_id', indicador).eq('anio', anio).maybeSingle()
  if (b.error) { console.error('[pdm/seguimiento] rutasDelBorrador:', b.error.message); return null }
  if (!b.data) return new Set()
  const a = await admin.from('pdm_borrador_archivos').select('ruta').eq('borrador_id', b.data.id)
  if (a.error) { console.error('[pdm/seguimiento] rutasDelBorrador (archivos):', a.error.message); return null }
  return new Set((a.data ?? []).map(x => x.ruta as string))
}

/**
 * Quita archivos del almacenamiento, salvo los que ya son evidencia de algún reporte: esos NUNCA se tocan. Ante la duda (no se pudo
 * comprobar), no se borra nada: un archivo que sobra cuesta unos MB; uno de más que se borra, una evidencia.
 */
async function quitarDelAlmacen(admin: ReturnType<typeof createAdminSupabaseClient>, rutas: string[]): Promise<void> {
  if (rutas.length === 0) return
  const usadas = await admin.from('pdm_evidencias').select('ruta').in('ruta', rutas)
  if (usadas.error) { console.error('[pdm/seguimiento] quitarDelAlmacen:', usadas.error.message); return }
  const enUso = new Set((usadas.data ?? []).map(r => r.ruta as string))
  const aBorrar = rutas.filter(r => !enUso.has(r))
  if (aBorrar.length > 0) await admin.storage.from(BUCKET).remove(aBorrar).catch(() => {})
}

/**
 * Lo que de verdad llegó al almacenamiento: existencia, tamaño y tipo reales (no los que dice el navegador). Lo usan el envío del
 * reporte y el guardado del borrador. `borrar`: el archivo es inválido y lo recién subido no debe quedarse; `esFallo`: no fue culpa de
 * quien subió (se dice con el mensaje genérico).
 */
async function comprobarSubidos(
  admin: ReturnType<typeof createAdminSupabaseClient>, carpeta: string, rutas: string[], nombres: string[],
): Promise<{ ok: true; evidencias: EvidenciaSubida[] } | { ok: false; error: string; borrar: boolean; esFallo: boolean }> {
  // Si no hay nada que mirar (solo se conserva lo anterior), no se lee el almacenamiento.
  const listado = rutas.length === 0
    ? { data: [] as { name: string; metadata?: unknown }[], error: null }
    : await buscarEnAlmacen(admin, carpeta, rutas.map(r => r.slice(carpeta.length + 1)))
  if (listado.error || !listado.data) {
    console.error('[pdm/seguimiento] comprobarSubidos (listado):', listado.error?.message)
    return { ok: false, error: GENERICO, borrar: false, esFallo: true }
  }
  const enAlmacen = new Map(listado.data.map(o => [o.name, o]))
  const evidencias: EvidenciaSubida[] = []
  for (let k = 0; k < rutas.length; k++) {
    const obj = enAlmacen.get(rutas[k].slice(carpeta.length + 1))
    const bytes = Number((obj?.metadata as { size?: unknown } | null | undefined)?.size)
    const tipo = (obj?.metadata as { mimetype?: unknown } | null | undefined)?.mimetype
    if (!obj || !Number.isFinite(bytes) || bytes < 1 || typeof tipo !== 'string') {
      return { ok: false, error: 'Un archivo no llegó a subirse. Vuelve a adjuntarlo.', borrar: false, esFallo: false }
    }
    const limite = limiteDeTipo(tipo)
    if (limite === null || bytes > limite) {
      return { ok: false, error: 'Un archivo no es válido como evidencia. Vuelve a adjuntarlo.', borrar: true, esFallo: false }
    }
    evidencias.push({ ruta: rutas[k], nombre: nombres[k], tipo, bytes })
  }
  return { ok: true, evidencias }
}

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
    if (!s) return rechazo('prepararEvidencias', SIN_PERMISO)
    if (!puedeReportar(s.acceso)) return rechazo('prepararEvidencias', SOLO_RESPONSABLES)
    if (!esUuid(e?.indicador) || !Array.isArray(e.archivos)) return rechazo('prepararEvidencias', 'Algo de lo elegido no es válido.')
    const archivos = e.archivos.map(a => ({
      nombre: typeof a?.nombre === 'string' ? a.nombre : '',
      tipo: typeof a?.tipo === 'string' ? a.tipo : '',
      bytes: typeof a?.bytes === 'number' ? a.bytes : NaN,
    }))
    const mal = errorEnArchivos(archivos)
    if (mal) return rechazo('prepararEvidencias', mal)

    const ctx = await contextoDeReporte(s.supabase, e.indicador, e.anio, s.acceso.userId)
    if (!ctx.ok) return rechazo('prepararEvidencias', ctx.error)

    const admin = createAdminSupabaseClient()
    // Un reporte puede llevar muchos archivos: las firmas se piden varias a la vez (no una tras otra), y el resultado conserva el
    // orden de `archivos`, que es el que espera quien llama.
    const preparadas = await conLimite(archivos, LIMITE_EN_PARALELO, async (a): Promise<EvidenciaPreparada | null> => {
      const tipo = tipoDeArchivo(a.nombre, a.tipo)!
      const ruta = `${ctx.planId}/${e.indicador}/${ctx.anio}/${randomUUID()}.${tipo.ext}`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(ruta, { upsert: false })
      if (error || !data) {
        console.error('[pdm/seguimiento] prepararEvidencias:', error?.message)
        return null
      }
      const base: EvidenciaPreparada = { ruta, urlSubida: data.signedUrl, tipo: tipo.mime }
      if (!esVideo(tipo.mime)) return base
      // Un video se sube por partes: el navegador recibe la firma de ESTA ruta (no sirve para otra) y habla con el almacenamiento.
      const urlProyecto = process.env.NEXT_PUBLIC_SUPABASE_URL
      const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!urlProyecto || !apikey) {
        console.error('[pdm/seguimiento] prepararEvidencias: faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
        return null
      }
      return { ...base, reanudable: { endpoint: direccionReanudable(urlProyecto), firma: data.token, apikey, bucket: BUCKET } }
    })
    const completas = preparadas.filter((p): p is EvidenciaPreparada => p !== null)
    if (completas.length !== preparadas.length) return rechazo('prepararEvidencias', 'No se pudo preparar la subida. Intenta de nuevo.')
    return { ok: true, datos: completas }
  } catch (err) {
    console.error('[pdm/seguimiento] prepararEvidencias:', err)
    return falla(GENERICO)
  }
}

export async function reportar(e: EntradaReportar): Promise<Resultado<{ reporte: string; correccion: boolean }>> {
  try {
    const s = await sesionPdm()
    if (!s) return rechazo('reportar', SIN_PERMISO)
    if (!puedeReportar(s.acceso)) return rechazo('reportar', SOLO_RESPONSABLES)
    if (!esUuid(e?.indicador)) return rechazo('reportar', 'Algo de lo elegido no es válido.')

    // Que sea o no corrección lo decide la base (si el último reporte del año está sin cerrar); aquí se revisa lo que se sabe.
    const mal = errorEnReporte(e, false)
    if (mal) return rechazo('reportar', mal)
    const motivo = typeof e.motivo === 'string' ? e.motivo.trim() : ''
    if (motivo.length > MAX_MOTIVO_CORRECCION) return rechazo('reportar', `El motivo no puede pasar de ${MAX_MOTIVO_CORRECCION} caracteres.`)
    if (!Array.isArray(e.evidencias)) return rechazo('reportar', 'Adjunta al menos una evidencia.')
    // Lo conservado de la versión anterior cuenta para el mínimo de uno y para el máximo (que no se dice: ver `MAX_EVIDENCIAS`).
    const conservar = e.conservar === undefined ? [] : e.conservar
    if (!Array.isArray(conservar) || !conservar.every(esUuid)) return rechazo('reportar', 'Algo de lo elegido no es válido. Recarga la página e intenta de nuevo.')
    if (new Set(conservar).size !== conservar.length) return rechazo('reportar', 'Un archivo está repetido entre los que conservas.')
    if (e.evidencias.length + conservar.length === 0) return rechazo('reportar', 'Adjunta al menos una evidencia.')
    if (e.evidencias.length + conservar.length > MAX_EVIDENCIAS) return rechazo('reportar', MENSAJE_DEMASIADOS_ARCHIVOS)

    const ctx = await contextoDeReporte(s.supabase, e.indicador, e.anio, s.acceso.userId)
    if (!ctx.ok) return rechazo('reportar', ctx.error)
    const carpeta = `${ctx.planId}/${e.indicador}/${ctx.anio}`

    // Cada ruta es de ESTE indicador y ESTE año, con el nombre que armó el servidor.
    const rutas: string[] = []
    for (const ev of e.evidencias) {
      const ruta = typeof ev?.ruta === 'string' ? ev.ruta : ''
      const nombre = typeof ev?.nombre === 'string' ? ev.nombre.trim() : ''
      if (!ruta.startsWith(`${carpeta}/`) || !esNombreDeEvidenciaEnAlmacen(ruta.slice(carpeta.length + 1))) {
        return rechazo('reportar', 'Una evidencia no corresponde a este indicador y este año. Vuelve a adjuntarla.')
      }
      if (nombre === '' || nombre.length > MAX_NOMBRE_ARCHIVO) return rechazo('reportar', 'Un archivo tiene un nombre que no sirve.')
      rutas.push(ruta)
    }
    if (new Set(rutas).size !== rutas.length) return rechazo('reportar', 'Un mismo archivo está repetido.')

    // Los archivos que ya están en el borrador de este indicador y año: si este envío falla, NO se quitan del almacenamiento
    // (siguen siendo del borrador, que se conserva); solo se quita lo que se subió ahora.
    const admin = createAdminSupabaseClient()
    const delBorrador = await rutasDelBorrador(admin, e.indicador, ctx.anio)
    if (delBorrador === null) return falla(GENERICO)
    const recienSubidas = rutas.filter(r => !delBorrador.has(r))

    // Lo que de verdad llegó al almacenamiento: existencia, tamaño y tipo reales (no los que dice el navegador).
    const comprobado = await comprobarSubidos(admin, carpeta, rutas, e.evidencias.map(ev => ev.nombre.trim()))
    if (!comprobado.ok) {
      if (comprobado.borrar) await quitarDelAlmacen(admin, recienSubidas)
      return comprobado.esFallo ? falla(comprobado.error) : rechazo('reportar', comprobado.error)
    }
    const evidencias = comprobado.evidencias

    // Que ninguno pertenezca ya a otro reporte: así, si registrar falla, borrar lo subido no toca lo de nadie.
    if (rutas.length > 0) {
      const yaUsadas = await admin.from('pdm_evidencias').select('ruta').in('ruta', rutas)
      if (yaUsadas.error) return falla(GENERICO)
      if (yaUsadas.data?.length) return rechazo('reportar', 'Uno de esos archivos ya está en otro reporte. Vuelve a adjuntarlo.')
    }

    // La huella de cada archivo nuevo, leyéndolo del almacenamiento (varios a la vez, con un máximo: un reporte puede llevar
    // muchos). Si no se puede calcular, o el archivo no pesa lo que el almacenamiento dice, no se registra nada: un reporte sin
    // la huella que debería tener no se puede arreglar después.
    const inicioHuellas = Date.now()
    const calculadas = await conLimite(evidencias, LIMITE_EN_PARALELO, ev => huellaDeObjeto(admin, BUCKET, ev.ruta))
    const huellas: HuellaCalculada[] = []
    for (let k = 0; k < evidencias.length; k++) {
      const c = calculadas[k]
      if (!c.ok || c.bytes !== evidencias[k].bytes) {
        console.error('[pdm/seguimiento] reportar (huella):', c.ok ? `pesa ${c.bytes} y el almacenamiento dice ${evidencias[k].bytes}` : c.error)
        await quitarDelAlmacen(admin, recienSubidas)
        return rechazo('reportar', 'No pudimos comprobar un archivo. Vuelve a adjuntarlo e intenta de nuevo.')
      }
      huellas.push({ ruta: evidencias[k].ruta, sha256: c.sha256, bytes: c.bytes })
    }
    // Cuánto tarda leer los archivos para la huella, con datos reales: es lo que crece con un reporte de muchos archivos (ver `maxDuration` en
    // app/dashboard/plan-desarrollo/layout.tsx).
    const mb = huellas.reduce((t, h) => t + h.bytes, 0) / 1048576
    console.info(`[pdm/seguimiento] huellas: ${huellas.length} archivos · ${mb.toFixed(1)} MB · ${((Date.now() - inicioHuellas) / 1000).toFixed(1)} s`)
    if (!(await anotarHuellas(admin, s.acceso.userId, huellas))) {
      await quitarDelAlmacen(admin, recienSubidas)
      return rechazo('reportar', 'No pudimos registrar los archivos. Vuelve a adjuntarlos e intenta de nuevo.')
    }

    const { data, error } = await s.supabase.rpc('pdm_reportar', {
      p_indicador: e.indicador, p_anio: ctx.anio, p_valor: e.valor, p_texto: e.texto.trim(), p_evidencias: evidencias, p_motivo: motivo || null,
      p_conservar: conservar,
    })
    if (error) {
      // Solo se borra lo recién subido: lo conservado es de un reporte que ya existe y lo del borrador sigue siendo del borrador.
      await quitarDelAlmacen(admin, recienSubidas)
      console.warn('[pdm/seguimiento] pdm_reportar falló con el código', error.code)
      return rechazo('reportar', traducirErrorPdm(error.code, error.message))
    }
    const d = (data ?? {}) as { reporte?: unknown; correccion?: unknown }
    if (!esUuid(d.reporte)) return falla(GENERICO)
    const reporteId = d.reporte
    // El reporte ya borró el borrador (en la misma transacción de la base). Los archivos del borrador que van en el reporte son ahora
    // evidencias suyas; los que quedaron fuera (se quitaron del formulario sin guardar el borrador) sobran en el almacenamiento.
    await quitarDelAlmacen(admin, [...delBorrador].filter(r => !rutas.includes(r)))
    refrescar()
    // El aviso («Recibimos tu reporte») sale después de responder y no puede estorbar: ver `lib/pdm/correos`.
    await avisarDespues(origen => avisarReporteEnviado({ reporteId, origen }))
    // Si quien reportó es de APOYO en este indicador, la persona responsable recibe una copia informativa.
    await avisarDespues(origen => avisarReporteDeApoyo({ reporteId, origen }))
    return { ok: true, datos: { reporte: reporteId, correccion: d.correccion === true } }
  } catch (err) {
    console.error('[pdm/seguimiento] reportar:', err)
    return falla(GENERICO)
  }
}

// ─── El borrador del reporte (migración 076) ──────────────────────────────────

/**
 * Lo que la base devuelve al guardar: la versión nueva, quién guardó, los archivos que quedaron y los que se retiraron. Se lee con
 * desconfianza: nada de aquí llega a la pantalla sin tener la forma que debe.
 */
function leerBorradorGuardado(
  d: unknown, base: { anio: number; valor: number | null; texto: string; motivo: string; conservar: string[] },
): { borrador: BorradorVista; retirados: string[] } | null {
  const o = (d ?? {}) as Record<string, unknown>
  if (typeof o.version !== 'number' || !Array.isArray(o.archivos) || !Array.isArray(o.retirados)) return null
  const archivos: BorradorArchivo[] = []
  for (const a of o.archivos as Record<string, unknown>[]) {
    if (typeof a?.ruta !== 'string' || typeof a?.nombre !== 'string' || typeof a?.tipo !== 'string' || typeof a?.bytes !== 'number') return null
    archivos.push({ ruta: a.ruta, nombre: a.nombre, tipo: a.tipo, bytes: a.bytes })
  }
  return {
    borrador: {
      ...base,
      version: o.version,
      archivos,
      editadoPorId: typeof o.editado_por_id === 'string' ? o.editado_por_id : '',
      editadoPor: typeof o.editado_por === 'string' ? o.editado_por : '',
      editadoEn: typeof o.editado_en === 'string' ? o.editado_en : new Date().toISOString(),
    },
    retirados: (o.retirados as unknown[]).filter((r): r is string => typeof r === 'string'),
  }
}

/**
 * Guarda (o actualiza) el borrador del reporte de un indicador en un año. Los archivos ya están en el almacenamiento (se subieron
 * antes, como al enviar); aquí se comprueban igual que al enviar y quedan registrados en el borrador. Los que el borrador tenía y ya
 * no vienen en la lista se quitan del almacenamiento. NO calcula huellas ni crea nada que cuente: un borrador no es un reporte.
 */
export async function guardarBorrador(e: EntradaGuardarBorrador): Promise<Resultado<BorradorVista>> {
  try {
    const s = await sesionPdm()
    if (!s) return rechazo('guardarBorrador', SIN_PERMISO)
    if (!puedeReportar(s.acceso)) return rechazo('guardarBorrador', SOLO_RESPONSABLES)
    if (!esUuid(e?.indicador)) return rechazo('guardarBorrador', 'Algo de lo elegido no es válido.')
    if (!Number.isInteger(e.version) || e.version < 0) return rechazo('guardarBorrador', 'Algo de lo elegido no es válido. Recarga la página e intenta de nuevo.')
    const valor = e.valor === null || e.valor === undefined ? null : e.valor
    if (valor !== null && typeof valor !== 'number') return rechazo('guardarBorrador', 'El valor debe ser un número igual o mayor que cero.')
    const texto = typeof e.texto === 'string' ? e.texto : ''
    const motivo = typeof e.motivo === 'string' ? e.motivo.trim() : ''
    const conservar = e.conservar === undefined ? [] : e.conservar
    if (!Array.isArray(conservar) || !conservar.every(esUuid)) return rechazo('guardarBorrador', 'Algo de lo elegido no es válido. Recarga la página e intenta de nuevo.')
    if (new Set(conservar).size !== conservar.length) return rechazo('guardarBorrador', 'Un archivo está repetido entre los que conservas.')
    if (!Array.isArray(e.archivos)) return rechazo('guardarBorrador', 'Algo de lo elegido no es válido. Recarga la página e intenta de nuevo.')
    const mal = errorEnBorrador({ valor, texto, motivo, archivos: e.archivos.length, conservadas: conservar.length })
    if (mal) return rechazo('guardarBorrador', mal)

    const ctx = await contextoDeReporte(s.supabase, e.indicador, e.anio, s.acceso.userId)
    if (!ctx.ok) return rechazo('guardarBorrador', ctx.error)
    const carpeta = `${ctx.planId}/${e.indicador}/${ctx.anio}`

    // Cada ruta es de ESTE indicador y ESTE año, con el nombre que armó el servidor.
    const rutas: string[] = []
    for (const ev of e.archivos) {
      const ruta = typeof ev?.ruta === 'string' ? ev.ruta : ''
      const nombre = typeof ev?.nombre === 'string' ? ev.nombre.trim() : ''
      if (!ruta.startsWith(`${carpeta}/`) || !esNombreDeEvidenciaEnAlmacen(ruta.slice(carpeta.length + 1))) {
        return rechazo('guardarBorrador', 'Un archivo no corresponde a este indicador y este año. Vuelve a adjuntarlo.')
      }
      if (nombre === '' || nombre.length > MAX_NOMBRE_ARCHIVO) return rechazo('guardarBorrador', 'Un archivo tiene un nombre que no sirve.')
      rutas.push(ruta)
    }
    if (new Set(rutas).size !== rutas.length) return rechazo('guardarBorrador', 'Un mismo archivo está repetido.')

    const admin = createAdminSupabaseClient()
    // Lo que ya estaba en el borrador no se toca si algo falla; solo se quita lo que se subió ahora.
    const delBorrador = await rutasDelBorrador(admin, e.indicador, ctx.anio)
    if (delBorrador === null) return falla(GENERICO)
    const recienSubidas = rutas.filter(r => !delBorrador.has(r))

    const comprobado = await comprobarSubidos(admin, carpeta, rutas, e.archivos.map(a => a.nombre.trim()))
    if (!comprobado.ok) {
      if (comprobado.borrar) await quitarDelAlmacen(admin, recienSubidas)
      return comprobado.esFallo ? falla(comprobado.error) : rechazo('guardarBorrador', comprobado.error)
    }

    // Que ninguno pertenezca ya a un reporte (la base también lo comprueba, pero solo ve lo que quien guarda puede ver).
    if (recienSubidas.length > 0) {
      const yaUsadas = await admin.from('pdm_evidencias').select('ruta').in('ruta', recienSubidas)
      if (yaUsadas.error) return falla(GENERICO)
      if (yaUsadas.data?.length) return rechazo('guardarBorrador', 'Uno de esos archivos ya está en un reporte. Vuelve a adjuntarlo.')
    }

    const { data, error } = await s.supabase.rpc('pdm_borrador_guardar', {
      p_indicador: e.indicador, p_anio: ctx.anio, p_version: e.version, p_valor: valor, p_texto: texto, p_motivo: motivo || null,
      p_conservar: conservar, p_archivos: comprobado.evidencias,
    })
    if (error) {
      await quitarDelAlmacen(admin, recienSubidas)
      console.warn('[pdm/seguimiento] pdm_borrador_guardar falló con el código', error.code)
      return rechazo('guardarBorrador', traducirErrorPdm(error.code, error.message))
    }
    const leido = leerBorradorGuardado(data, { anio: ctx.anio, valor, texto, motivo, conservar })
    if (!leido) return falla(GENERICO)
    // Lo que el borrador tenía y ya no tiene sobra en el almacenamiento.
    await quitarDelAlmacen(admin, leido.retirados)
    return { ok: true, datos: leido.borrador }
  } catch (err) {
    console.error('[pdm/seguimiento] guardarBorrador:', err)
    return falla(GENERICO)
  }
}

/** Borra el borrador y quita sus archivos del almacenamiento. Si otra persona lo cambió mientras tanto, se niega y pide recargar. */
export async function descartarBorrador(e: EntradaDescartarBorrador): Promise<Resultado> {
  try {
    const s = await sesionPdm()
    if (!s) return rechazo('descartarBorrador', SIN_PERMISO)
    if (!puedeReportar(s.acceso)) return rechazo('descartarBorrador', SOLO_RESPONSABLES)
    if (!esUuid(e?.indicador)) return rechazo('descartarBorrador', 'Algo de lo elegido no es válido.')
    if (!Number.isInteger(e.version) || e.version < 0) return rechazo('descartarBorrador', 'Algo de lo elegido no es válido. Recarga la página e intenta de nuevo.')
    const ctx = await contextoDeReporte(s.supabase, e.indicador, e.anio, s.acceso.userId)
    if (!ctx.ok) return rechazo('descartarBorrador', ctx.error)

    const { data, error } = await s.supabase.rpc('pdm_borrador_descartar', { p_indicador: e.indicador, p_anio: ctx.anio, p_version: e.version })
    if (error) {
      console.warn('[pdm/seguimiento] pdm_borrador_descartar falló con el código', error.code)
      return rechazo('descartarBorrador', traducirErrorPdm(error.code, error.message))
    }
    const retirados = Array.isArray((data as { retirados?: unknown } | null)?.retirados)
      ? ((data as { retirados: unknown[] }).retirados).filter((r): r is string => typeof r === 'string')
      : []
    await quitarDelAlmacen(createAdminSupabaseClient(), retirados)
    return { ok: true, datos: undefined }
  } catch (err) {
    console.error('[pdm/seguimiento] descartarBorrador:', err)
    return falla(GENERICO)
  }
}

// ─── Validar y comentar ───────────────────────────────────────────────────────

export async function validarReporte(e: EntradaValidar): Promise<Resultado<{ cambio: 'aprobado' | 'devuelto' | 'ninguno' }>> {
  try {
    const s = await sesionPdm(a => gestiona(a.nivel))
    if (!s) return falla(SIN_PERMISO)
    if (!esUuid(e?.reporte)) return falla('Algo de lo elegido no es válido.')
    const mal = errorEnValidacion(e.estado, e.comentario, e.observaciones)
    if (mal) return falla(mal)

    const { data, error } = await s.supabase.rpc('pdm_validar', {
      p_reporte: e.reporte, p_estado: e.estado, p_comentario: e.comentario?.trim() || null,
      p_observaciones: (e.observaciones ?? []).map(o => ({ evidencia: o.evidencia, motivo: o.motivo.trim() })),
    })
    if (error) return falla(traducirErrorPdm(error.code, error.message))
    const cambio = (data as { cambio?: unknown } | null)?.cambio
    refrescar()
    const resultado = cambio === 'aprobado' || cambio === 'devuelto' ? cambio : 'ninguno'
    // Solo si algo cambió de verdad: validar dos veces lo mismo no avisa dos veces.
    if (resultado !== 'ninguno') {
      const reporteId = e.reporte
      await avisarDespues(origen => avisarValidacion({ reporteId, cambio: resultado, origen }))
    }
    return { ok: true, datos: { cambio: resultado } }
  } catch (err) {
    console.error('[pdm/seguimiento] validarReporte:', err)
    return falla(GENERICO)
  }
}

// ─── Anular y restaurar (migración 068) ───────────────────────────────────────

/**
 * Anular un reporte equivocado o restaurarlo: SOLO el administrador. Avisa por correo a quien lo reportó (con el motivo)
 * y no borra nada: la base agrega una fila a `pdm_anulaciones` por cada versión del reporte, con el motivo.
 * La base decide todo lo demás —que sea lo más reciente del año, que la cadena de versiones no quede a medias, que el
 * reporte anterior siga aprobado al restaurar— y aquí solo se traduce lo que diga.
 */
async function anulacion(accion: AccionAnulacion, e: EntradaAnulacion): Promise<Resultado<{ versiones: number }>> {
  const donde = accion === 'anular' ? 'anularReporte' : 'restaurarReporte'
  try {
    const s = await sesionPdm(a => a.nivel === 'admin')
    if (!s) return rechazo(donde, SIN_PERMISO)
    if (!esUuid(e?.reporte)) return rechazo(donde, 'Algo de lo elegido no es válido.')
    const mal = errorEnAnulacion(e.motivo, accion)
    if (mal) return rechazo(donde, mal)

    const { data, error } = await s.supabase.rpc(accion === 'anular' ? 'pdm_anular_reporte' : 'pdm_restaurar_reporte', {
      p_reporte: e.reporte, p_motivo: e.motivo.trim(),
    })
    if (error) {
      console.warn(`[pdm/seguimiento] ${donde} falló con el código`, error.code)
      return rechazo(donde, traducirErrorPdm(error.code, error.message))
    }
    const versiones = Number((data as { versiones?: unknown } | null)?.versiones)
    refrescar()
    // A quien reportó se le dice que el administrador anuló su reporte (o lo restauró), con el motivo.
    const lote = (data as { lote?: unknown } | null)?.lote
    if (esUuid(lote)) await avisarDespues(origen => avisarAnulacion({ lote, origen }))
    return { ok: true, datos: { versiones: Number.isFinite(versiones) && versiones > 0 ? versiones : 1 } }
  } catch (err) {
    console.error(`[pdm/seguimiento] ${donde}:`, err)
    return falla(GENERICO)
  }
}

export async function anularReporte(e: EntradaAnulacion): Promise<Resultado<{ versiones: number }>> {
  return anulacion('anular', e)
}

export async function restaurarReporte(e: EntradaAnulacion): Promise<Resultado<{ versiones: number }>> {
  return anulacion('restaurar', e)
}

export async function comentar(e: EntradaComentar): Promise<Resultado> {
  try {
    const s = await sesionPdm()
    if (!s) return falla(SIN_PERMISO)
    if (!esUuid(e?.indicador) || (e.reporte !== undefined && !esUuid(e.reporte))) return falla('Algo de lo elegido no es válido.')
    const mal = errorEnComentario(e.texto)
    if (mal) return falla(mal)

    const { data, error } = await s.supabase.rpc('pdm_comentar', {
      p_indicador: e.indicador, p_texto: e.texto.trim(), p_reporte: e.reporte ?? null,
    })
    if (error) return falla(traducirErrorPdm(error.code, error.message))
    // Solo el comentario de Control Interno genera aviso; para cualquier otro nivel la función no envía nada.
    if (esUuid(data)) {
      const comentarioId = data
      await avisarDespues(origen => avisarComentario({ comentarioId, origen }))
    }
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

    const nivel = s.acceso.nivel

    const ids = rep.data.map(r => r.id as string)
    let evidencias: FilaEvidencia[] = []
    let validaciones: FilaValidacion[] = []
    let anulaciones: FilaAnulacion[] = []
    if (ids.length) {
      const [evi, val, anu] = await Promise.all([
        s.supabase.from('pdm_evidencias').select('id, reporte_id, nombre, tipo, bytes, copia_de, sha256, huella_calculada_en').in('reporte_id', ids),
        s.supabase.from('pdm_validaciones').select('reporte_id, estado, comentario, validador_nombre, created_at, observaciones').in('reporte_id', ids),
        // Lo anulado lo ven el administrador, Control Interno y quien lo reportó: se piden las anulaciones de todos y la base
        // entrega solo las que cada quien puede ver (para el resto no llega ninguna, ni tampoco el reporte anulado).
        s.supabase.from('pdm_anulaciones').select('reporte_id, accion, motivo, actor_nombre, created_at').in('reporte_id', ids),
      ])
      if (evi.error || val.error || anu.error || !evi.data || !val.data || !anu.data) return falla(GENERICO)
      evidencias = evi.data as FilaEvidencia[]
      validaciones = val.data as FilaValidacion[]
      anulaciones = anu.data as FilaAnulacion[]
    }

    // El borrador (si lo hay) de este indicador: la base entrega solo los de quienes tienen el indicador a su cargo.
    const bor = await s.supabase.from('pdm_borradores').select('id, anio, valor, texto, motivo, conservar, version, editado_por, editado_nombre, editado_en').eq('indicador_id', indicador)
    if (bor.error) return falla(GENERICO)
    let archivosDeBorrador: FilaBorradorArchivo[] = []
    if (bor.data && bor.data.length) {
      const arch = await s.supabase.from('pdm_borrador_archivos').select('borrador_id, ruta, nombre, tipo, bytes, subido_en').in('borrador_id', bor.data.map(b => b.id as string))
      if (arch.error) return falla(GENERICO)
      archivosDeBorrador = (arch.data ?? []) as FilaBorradorArchivo[]
    }

    const puedeValidarElIndicador = nivel === 'admin'
      || (nivel === 'coordinador' && s.acceso.dependenciaId !== null && s.acceso.dependenciaId === ind.data.dependencia_id)

    return {
      ok: true,
      datos: {
        ...armarDetalle({
        reportes: rep.data as unknown as FilaReporteDetalle[],
        evidencias,
        validaciones,
        comentarios: com.data as FilaComentario[],
        yoId: s.acceso.userId,
        puedeValidarElIndicador,
        anulaciones,
        esAdmin: nivel === 'admin',
        }),
        borradores: armarBorradores((bor.data ?? []) as unknown as FilaBorrador[], archivosDeBorrador),
      },
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
