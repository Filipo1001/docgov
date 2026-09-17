'use server'

/**
 * Certificación bajo la gravedad de juramento — Retención en la fuente
 * (Ley 1819/2016 · Art. 383 E.T.).
 *
 * Flujo: el contratista, antes de enviar su PRIMER informe del año gravable,
 * jura si ha vinculado o no más de un trabajador. Al aceptar, el sistema
 * genera la certificación (mismo motor de PDF), le aplica la firma sellada +
 * código/QR de verificación, calcula su hash y guarda toda la trazabilidad.
 *
 * Una certificación por (contrato, año gravable) — el Art. 383 es anual.
 */

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { firmarUrls } from '@/lib/storage-firmado'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import type { ActionResult } from '@/lib/types'
import {
  registrarDocumento, actualizarHashDocumento, qrDataUrl, urlVerificacion,
  maskCedula, type DatosVerificacion,
} from '@/lib/verificacion'
import type { CertificacionData } from '@/lib/pdf/certificacion-retencion'
import type { PDFVerificacion } from '@/lib/pdf/types'
import { certificacionPendiente } from '@/lib/certificaciones'

const BUCKET = 'certificaciones'
const TEXTO_VERSION = 'v1'

interface Contexto {
  periodoId: string
  anioGravable: number
  contratoId: string
  contratoNumero: string
  contratoAnio: number
  contratistaId: string
  nombre: string
  cedula: string
  firmaUrl: string | null
  municipioNombre: string
  municipioDepto: string | null
}

/** Carga periodo + contrato + contratista + municipio con el admin client. */
async function cargarContexto(periodoId: string): Promise<Contexto | null> {
  const admin = createAdminSupabaseClient()
  const { data: p } = await admin
    .from('periodos')
    .select(`
      id, anio, contrato_id,
      contrato:contratos(
        id, numero, anio, contratista_id,
        contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, firma_url),
        municipio:municipios(nombre, departamento)
      )
    `)
    .eq('id', periodoId)
    .single()

  if (!p) return null
  const c = (p as any).contrato
  if (!c || !c.contratista) return null

  return {
    periodoId,
    anioGravable: (p as any).anio as number,
    contratoId: c.id,
    contratoNumero: c.numero,
    contratoAnio: c.anio,
    contratistaId: c.contratista.id,
    nombre: c.contratista.nombre_completo,
    cedula: c.contratista.cedula,
    firmaUrl: c.contratista.firma_url ?? null,
    municipioNombre: c.municipio?.nombre ?? 'Municipio',
    municipioDepto: c.municipio?.departamento ?? null,
  }
}

/**
 * ¿El contratista necesita aceptar la certificación antes de enviar este
 * informe? Devuelve también los datos para pintar el modal.
 */
export async function verificarCertificacionRequerida(periodoId: string): Promise<{
  requerida: boolean
  faltaFirma: boolean
  prefill: {
    nombre: string
    cedula: string
    anioGravable: number
    municipio: string
    /**
     * Lo que esta persona ya juró este año gravable, en CUALQUIER contrato.
     *
     * La declaración es sobre su situación en el año —si vinculó o no más de
     * un trabajador—, no sobre el contrato. Cuatro de los contratistas que
     * estrenan contrato este mes ya juraron en julio por otro; volver a
     * preguntarles lo mismo sería no haber escuchado la primera respuesta.
     *
     * Se prellena, pero NO se firma por ellos: cada documento que lleva su
     * firma necesita un acto suyo. La diferencia es que aquí es un clic de
     * confirmación en vez de un formulario.
     */
    respuestaPrevia: { vinculoMasTrabajador: boolean; fecha: string; contrato: string } | null
  } | null
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { requerida: false, faltaFirma: false, prefill: null, error: 'No autorizado' }

    const ctx = await cargarContexto(periodoId)
    if (!ctx) return { requerida: false, faltaFirma: false, prefill: null, error: 'Periodo no encontrado' }

    // Solo el dueño del contrato (los demás roles no pasan por este flujo)
    if (ctx.contratistaId !== user.id) {
      return { requerida: false, faltaFirma: false, prefill: null }
    }

    const requerida = await certificacionPendiente(ctx.contratoId, periodoId, ctx.anioGravable)

    // ¿Ya juró este mismo año por otro contrato? Se busca por PERSONA, no por
    // contrato: lo que se declara es su situación en el año gravable.
    const admin = createAdminSupabaseClient()
    const { data: previa } = await admin
      .from('certificaciones_retencion')
      .select('vinculo_mas_trabajador, fecha_aceptacion, contrato:contratos(numero)')
      .eq('contratista_id', ctx.contratistaId)
      .eq('anio_gravable', ctx.anioGravable)
      .neq('contrato_id', ctx.contratoId)
      .order('fecha_aceptacion', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      requerida,
      faltaFirma: !ctx.firmaUrl,
      prefill: {
        nombre: ctx.nombre,
        cedula: ctx.cedula,
        anioGravable: ctx.anioGravable,
        municipio: ctx.municipioNombre,
        respuestaPrevia: previa
          ? {
              vinculoMasTrabajador: (previa as any).vinculo_mas_trabajador as boolean,
              fecha: (previa as any).fecha_aceptacion as string,
              contrato: ((previa as any).contrato?.numero as string) ?? '',
            }
          : null,
      },
    }
  } catch (e: unknown) {
    return { requerida: false, faltaFirma: false, prefill: null, error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * El contratista acepta la certificación bajo juramento. Genera el documento
 * firmado y verificable, y registra toda la trazabilidad. Idempotente: si ya
 * existe para (contrato, año), no regenera.
 */
export async function aceptarCertificacion(
  periodoId: string,
  vinculoMasTrabajador: boolean,
): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const ctx = await cargarContexto(periodoId)
    if (!ctx) return { error: 'Periodo no encontrado' }
    if (ctx.contratistaId !== user.id) return { error: 'Solo el titular del contrato puede aceptar su certificación' }
    if (!ctx.firmaUrl) return { error: 'Debes registrar tu firma en tu perfil antes de aceptar la certificación.' }

    const admin = createAdminSupabaseClient()

    // Idempotencia: si ya existe para (contrato, año), no se regenera.
    const { data: existente } = await admin
      .from('certificaciones_retencion')
      .select('id')
      .eq('contrato_id', ctx.contratoId)
      .eq('anio_gravable', ctx.anioGravable)
      .maybeSingle()
    if (existente) return {}

    const lugarExpedicion = ctx.municipioNombre
    const fechaAceptacion = new Date().toISOString()

    // ── Verificación (código + QR), compartida con /verificar ──────────────
    const datos: DatosVerificacion = {
      tipo: 'certificacion-retencion',
      contratoNumero: ctx.contratoNumero,
      contratoAnio: ctx.contratoAnio,
      contratistaNombre: ctx.nombre,
      cedulaMasked: maskCedula(ctx.cedula),
      dependencia: '—',
      supervisorNombre: '—',
      mes: '',
      anio: ctx.anioGravable,
      valor: 0,
      estado: 'vigente',
      fechaEmision: fechaAceptacion,
      municipio: ctx.municipioDepto ? `${ctx.municipioNombre} (${ctx.municipioDepto})` : ctx.municipioNombre,
    }
    const codigo = await registrarDocumento({
      tipo: 'certificacion-retencion', periodoId, datos, emitidoPor: user.id,
    })

    const verificacion: PDFVerificacion = {
      codigo,
      qr: await qrDataUrl(codigo),
      url: urlVerificacion(codigo),
      fechaAprobacion: fechaAceptacion,
      municipio: ctx.municipioNombre,
    }

    // La firma vive en un bucket PRIVADO desde la migración 026, así que la URL
    // canónica que guarda la base de datos no se puede leer directamente: hay
    // que cambiarla por una firmada y de vida corta.
    //
    // Sin esto el `<Image>` del PDF pedía una URL privada, recibía un 400 y
    // react-pdf lo dejaba pasar sin pintar nada ni fallar: la carta salía
    // completa, con su código de verificación, y con el espacio de la firma en
    // blanco. Es el mismo paso que da lib/pdf/data.ts para el resto de los
    // documentos — a esta plantilla nunca se le añadió.
    const firmadas = await firmarUrls('documentos', [ctx.firmaUrl], 600)
    const firmaFirmada = ctx.firmaUrl ? (firmadas[ctx.firmaUrl] ?? ctx.firmaUrl) : undefined

    // ── Generación del PDF (mismo motor react-pdf) ─────────────────────────
    const certData: CertificacionData = {
      municipio: { nombre: ctx.municipioNombre, departamento: ctx.municipioDepto ?? undefined },
      contratista: { nombre_completo: ctx.nombre, cedula: ctx.cedula, firma_url: firmaFirmada },
      contrato: { numero: ctx.contratoNumero, anio: ctx.contratoAnio },
      lugarExpedicion,
      vinculoMasTrabajador,
      fechaAceptacion,
      verificacion,
    }

    const [{ renderToBuffer }, React, { CertificacionRetencionPDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('@/lib/pdf/certificacion-retencion'),
    ])
    const buffer = await renderToBuffer(
      React.createElement(CertificacionRetencionPDF, { data: certData }) as any,
    ) as unknown as Buffer

    const hash = createHash('sha256').update(buffer).digest('hex')
    const pdfPath = `${ctx.contratoId}/${ctx.anioGravable}.pdf`

    await admin.storage.from(BUCKET).upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })
    await actualizarHashDocumento(codigo, hash)

    // ── Evidencia de aceptación ────────────────────────────────────────────
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = h.get('user-agent') ?? null

    const { error: insErr } = await admin.from('certificaciones_retencion').upsert({
      contrato_id: ctx.contratoId,
      contratista_id: ctx.contratistaId,
      anio_gravable: ctx.anioGravable,
      vinculo_mas_trabajador: vinculoMasTrabajador,
      lugar_expedicion: lugarExpedicion,
      codigo,
      pdf_path: pdfPath,
      hash_sha256: hash,
      texto_version: TEXTO_VERSION,
      datos_snapshot: {
        nombre: ctx.nombre,
        cedula: ctx.cedula,
        contrato: `${ctx.contratoNumero}-${ctx.contratoAnio}`,
        municipio: ctx.municipioNombre,
        vinculo_mas_trabajador: vinculoMasTrabajador,
      },
      aceptado_por: user.id,
      fecha_aceptacion: fechaAceptacion,
      ip_aceptacion: ip,
      user_agent: userAgent,
    }, { onConflict: 'contrato_id,anio_gravable' })

    if (insErr) return { error: `No se pudo registrar la certificación: ${insErr.message}` }

    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * Vuelve a emitir el PDF de las certificaciones que salieron sin firma.
 *
 * POR QUÉ EXISTE. La firma vive en un bucket privado y esta plantilla nunca
 * pasó por `firmarUrls`, así que el `<Image>` pedía una URL ilegible, recibía
 * un 400 y react-pdf seguía adelante sin pintar nada y sin fallar. Las 14
 * certificaciones emitidas entre julio y hoy salieron con el espacio de la
 * firma en blanco. Pesan todas ~9 KB; una firma incrustada añadiría decenas.
 *
 * QUÉ SE CONSERVA, Y POR QUÉ IMPORTA. El código de verificación, la fecha de
 * aceptación, el lugar de expedición y —sobre todo— la respuesta jurada, que
 * se lee del `datos_snapshot` guardado el día que la persona la dio. No se
 * vuelve a preguntar nada ni se cambia una palabra de lo declarado: se repinta
 * el mismo documento con la firma que siempre debió llevar.
 *
 * SOBRE LA REGLA 3 del proyecto («un documento emitido no se reescribe»). Esto
 * no reescribe contenido: corrige un defecto de impresión sobre una
 * declaración idéntica. El código sigue siendo el mismo, así que cualquier QR
 * ya repartido sigue resolviendo; `/verificar` no compara el hash, lo muestra,
 * y `actualizarHashDocumento` está documentado como «la huella de la ÚLTIMA
 * emisión» — el sistema ya contaba con que un documento se reemitiera.
 *
 * Es idempotente: pasarla dos veces produce el mismo resultado.
 */
export async function regenerarCertificaciones(): Promise<{
  revisadas: number
  regeneradas: number
  problemas: string[]
  error?: string
}> {
  const vacio = { revisadas: 0, regeneradas: 0, problemas: [] as string[] }
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ...vacio, error: 'No autorizado' }

    const admin = createAdminSupabaseClient()
    const { data: yo } = await admin.from('usuarios').select('rol').eq('id', user.id).single()
    if (yo?.rol !== 'admin') return { ...vacio, error: 'Solo el administrador puede reemitir certificaciones.' }

    const { data: filas, error: errFilas } = await admin
      .from('certificaciones_retencion')
      .select(`
        id, codigo, pdf_path, anio_gravable, lugar_expedicion, fecha_aceptacion,
        vinculo_mas_trabajador, datos_snapshot,
        contrato:contratos(numero, anio, municipio_id),
        contratista:usuarios!certificaciones_retencion_contratista_id_fkey(nombre_completo, cedula, firma_url)
      `)
      .order('fecha_aceptacion')
    if (errFilas) return { ...vacio, error: errFilas.message }

    const lista = (filas ?? []) as any[]
    if (!lista.length) return vacio

    // Municipio: una sola consulta para todos.
    const muniIds = [...new Set(lista.map(f => f.contrato?.municipio_id).filter(Boolean))]
    const { data: munis } = muniIds.length
      ? await admin.from('municipios').select('id, nombre, departamento').in('id', muniIds)
      : { data: [] as any[] }
    const muniPorId = new Map((munis ?? []).map((m: any) => [m.id, m]))

    // Todas las firmas de una vez: una llamada al Storage en lugar de N.
    const firmadas = await firmarUrls(
      'documentos',
      lista.map(f => f.contratista?.firma_url),
      600,
    )

    const [{ renderToBuffer }, React, { CertificacionRetencionPDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('@/lib/pdf/certificacion-retencion'),
    ])

    let regeneradas = 0
    const problemas: string[] = []

    for (const f of lista) {
      const etiqueta = `${f.codigo} (contrato ${f.contrato?.numero ?? '?'})`
      const firmaCruda = f.contratista?.firma_url as string | null

      // Sin firma registrada no hay nada que añadir: se deja como está y se
      // reporta, porque es una persona a la que hay que pedirle la firma.
      if (!firmaCruda) { problemas.push(`${etiqueta}: la persona no tiene firma registrada`); continue }
      if (!f.pdf_path) { problemas.push(`${etiqueta}: sin ruta de PDF`); continue }

      const muni = muniPorId.get(f.contrato?.municipio_id)
      const snap = (f.datos_snapshot ?? {}) as Record<string, unknown>

      const certData: CertificacionData = {
        municipio: {
          nombre: (snap.municipio as string) ?? muni?.nombre ?? '',
          departamento: muni?.departamento ?? undefined,
        },
        contratista: {
          // Del snapshot: es lo que decía el documento el día que se firmó.
          nombre_completo: (snap.nombre as string) ?? f.contratista?.nombre_completo ?? '',
          cedula: (snap.cedula as string) ?? f.contratista?.cedula ?? '',
          firma_url: firmadas[firmaCruda] ?? firmaCruda,
        },
        contrato: { numero: f.contrato?.numero ?? '', anio: f.contrato?.anio ?? f.anio_gravable },
        lugarExpedicion: f.lugar_expedicion ?? '',
        vinculoMasTrabajador: !!f.vinculo_mas_trabajador,
        fechaAceptacion: f.fecha_aceptacion,
        verificacion: {
          codigo: f.codigo,
          qr: await qrDataUrl(f.codigo),
          url: urlVerificacion(f.codigo),
          fechaAprobacion: f.fecha_aceptacion,
          municipio: (snap.municipio as string) ?? muni?.nombre ?? '',
        },
      }

      const buffer = await renderToBuffer(
        React.createElement(CertificacionRetencionPDF, { data: certData }) as any,
      ) as unknown as Buffer

      const hash = createHash('sha256').update(buffer).digest('hex')
      const { error: errUp } = await admin.storage
        .from(BUCKET)
        .upload(f.pdf_path, buffer, { contentType: 'application/pdf', upsert: true })
      if (errUp) { problemas.push(`${etiqueta}: ${errUp.message}`); continue }

      await admin.from('certificaciones_retencion').update({ hash_sha256: hash }).eq('id', f.id)
      await actualizarHashDocumento(f.codigo, hash)
      regeneradas++
    }

    return { revisadas: lista.length, regeneradas, problemas }
  } catch (e: unknown) {
    return { ...vacio, error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
