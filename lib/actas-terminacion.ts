import 'server-only'
import { createAdminSupabaseClient } from './supabase-admin'
import { firmarUrl } from './storage-firmado'
import { createHash } from 'crypto'
import {
  registrarDocumento, actualizarHashDocumento, qrDataUrl, urlVerificacion,
  maskCedula, type DatosVerificacion,
} from './verificacion'
import type { PDFVerificacion } from './pdf/types'
import type { ActaTerminacionData } from './pdf/acta-terminacion'

const BUCKET = 'actas-terminacion'

/**
 * ── Cómo se firma el Acta de Terminación ────────────────────────────────
 *
 * Es un acto bilateral y se firma en dos momentos, no en uno:
 *
 *   1. El CONTRATISTA acepta antes de enviar su último informe. Eso registra
 *      su consentimiento, con evidencia (IP, agente, hora). Todavía no hay
 *      documento: un acta a la que le faltan dos firmas no está suscrita.
 *
 *   2. El SUPERVISOR aprueba ese informe. Ese es, en el procedimiento del
 *      municipio, el acto con el que la administración suscribe el acta —
 *      firma por sí y por el alcalde, cuya rúbrica carga el administrador en
 *      /dashboard/admin/municipio. En ese momento se emite el documento, con
 *      las tres firmas, su código de verificación y su QR.
 *
 * Emitirlo solo cuando está completo evita reescribir un documento ya emitido,
 * que es la regla que rige todo el sistema.
 */

// ── Regla: ¿se exige el acta antes de este envío? ────────────────────────

/**
 * Espejo de `certificacionPendiente`: aquella se pide en el PRIMER informe del
 * contrato, esta en el ÚLTIMO. Se exige solo cuando:
 *
 *   1. Aún no existe acta para el contrato (es única: se termina una vez), y
 *   2. Este periodo es genuinamente el último.
 *
 * ── Qué cuenta como "el último" ──────────────────────────────────────────
 *
 * Dos condiciones, y la segunda es la que protege:
 *
 *   a) Ningún otro periodo del contrato tiene un `numero_periodo` mayor.
 *   b) Este periodo ALCANZA el fin contractual (`fecha_fin >= contrato.fecha_fin`).
 *
 * La (b) existe por los otrosíes. Un otrosí puede prorrogar el plazo, y los
 * periodos nuevos no aparecen en el mismo instante: entre la prórroga y su
 * generación, el último periodo existente deja de alcanzar el fin del contrato.
 * Sin la (b) le pediríamos al contratista firmar la terminación de un contrato
 * que acaba de ser extendido.
 *
 * El sesgo es deliberado: ante la duda, NO se pide. Que un acta se firme un mes
 * tarde es un trámite; que se firme la terminación de un contrato vigente es un
 * problema jurídico.
 */
export async function actaTerminacionPendiente(
  contratoId: string,
  periodoId: string,
): Promise<boolean> {
  const admin = createAdminSupabaseClient()

  const { data: acta } = await admin
    .from('actas_terminacion')
    .select('id')
    .eq('contrato_id', contratoId)
    .maybeSingle()
  if (acta) return false

  const [{ data: periodo }, { data: contrato }] = await Promise.all([
    admin.from('periodos').select('numero_periodo, fecha_fin').eq('id', periodoId).maybeSingle(),
    admin.from('contratos').select('fecha_fin').eq('id', contratoId).maybeSingle(),
  ])
  if (!periodo || !contrato?.fecha_fin) return false

  const { count: posteriores } = await admin
    .from('periodos')
    .select('id', { count: 'exact', head: true })
    .eq('contrato_id', contratoId)
    .gt('numero_periodo', periodo.numero_periodo as number)
  if ((posteriores ?? 0) > 0) return false

  return (periodo.fecha_fin as string) >= (contrato.fecha_fin as string)
}

// ── Contexto compartido ──────────────────────────────────────────────────

export interface ContextoActa {
  periodoId: string
  contratoId: string
  contratoNumero: string
  contratoAnio: number
  objeto: string
  valorTotal: number
  valorLetras: string | null
  fechaInicio: string
  fechaFin: string
  contratistaId: string
  nombre: string
  cedula: string
  firmaUrl: string | null
  supervisorNombre: string
  supervisorCargo: string | null
  supervisorFirmaUrl: string | null
  dependencia: string
  municipioNombre: string
  municipioDepto: string | null
  municipioNit: string | null
  alcalde: string | null
  alcaldeFirmaUrl: string | null
}

/** Carga periodo + contrato + partes + municipio con el admin client. */
export async function cargarContextoActa(periodoId: string): Promise<ContextoActa | null> {
  const admin = createAdminSupabaseClient()
  const { data: p } = await admin
    .from('periodos')
    .select(`
      id, contrato_id,
      contrato:contratos(
        id, numero, anio, objeto, valor_total, valor_letras_total, fecha_inicio, fecha_fin,
        contratista_id,
        contratista:usuarios!contratos_contratista_id_fkey(id, nombre_completo, cedula, firma_url),
        supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, cargo, firma_url),
        dependencia:dependencias(nombre),
        municipio:municipios(nombre, departamento, nit, representante_legal, firma_representante_url)
      )
    `)
    .eq('id', periodoId)
    .single()

  if (!p) return null
  const c = (p as unknown as { contrato: Record<string, any> }).contrato
  if (!c || !c.contratista || !c.supervisor) return null

  return {
    periodoId,
    contratoId: c.id,
    contratoNumero: c.numero,
    contratoAnio: c.anio,
    objeto: c.objeto,
    valorTotal: c.valor_total,
    valorLetras: c.valor_letras_total ?? null,
    fechaInicio: c.fecha_inicio,
    fechaFin: c.fecha_fin,
    contratistaId: c.contratista.id,
    nombre: c.contratista.nombre_completo,
    cedula: c.contratista.cedula,
    firmaUrl: c.contratista.firma_url ?? null,
    supervisorNombre: c.supervisor.nombre_completo,
    supervisorCargo: c.supervisor.cargo ?? null,
    supervisorFirmaUrl: c.supervisor.firma_url ?? null,
    dependencia: c.dependencia?.nombre ?? '—',
    municipioNombre: c.municipio?.nombre ?? 'Municipio',
    municipioDepto: c.municipio?.departamento ?? null,
    municipioNit: c.municipio?.nit ?? null,
    alcalde: c.municipio?.representante_legal ?? null,
    alcaldeFirmaUrl: c.municipio?.firma_representante_url ?? null,
  }
}

// ── Emisión ──────────────────────────────────────────────────────────────

/**
 * Emite el acta ya completa, con las tres firmas. Se llama cuando el
 * supervisor aprueba el último informe del contrato.
 *
 * Idempotente y silenciosa: si no hay acta aceptada para ese periodo, o si ya
 * fue emitida, no hace nada. Nunca lanza — se invoca desde la aprobación de
 * periodos y un fallo aquí no puede tumbar una aprobación que ya se guardó.
 *
 * @returns true si emitió el documento en esta llamada.
 */
export async function emitirActaTerminacion(
  periodoId: string,
  emitidoPor?: string | null,
): Promise<boolean> {
  try {
    const admin = createAdminSupabaseClient()

    const { data: acta } = await admin
      .from('actas_terminacion')
      .select('id, contrato_id, pdf_path, fecha_terminacion')
      .eq('periodo_id', periodoId)
      .maybeSingle()
    if (!acta || acta.pdf_path) return false   // no aceptada, o ya emitida

    const ctx = await cargarContextoActa(periodoId)
    if (!ctx) return false

    const fechaEmision = new Date().toISOString()
    const fechaTerminacion = (acta.fecha_terminacion as string) ?? ctx.fechaFin

    const datos: DatosVerificacion = {
      tipo: 'acta-terminacion',
      contratoNumero: ctx.contratoNumero,
      contratoAnio: ctx.contratoAnio,
      contratistaNombre: ctx.nombre,
      cedulaMasked: maskCedula(ctx.cedula),
      dependencia: ctx.dependencia,
      supervisorNombre: ctx.supervisorNombre,
      mes: '',
      anio: ctx.contratoAnio,
      valor: ctx.valorTotal,
      estado: 'vigente',
      fechaEmision,
      municipio: ctx.municipioDepto ? `${ctx.municipioNombre} (${ctx.municipioDepto})` : ctx.municipioNombre,
    }
    const codigo = await registrarDocumento({
      tipo: 'acta-terminacion', periodoId, datos, emitidoPor: emitidoPor ?? null,
    })

    const verificacion: PDFVerificacion = {
      codigo,
      qr: await qrDataUrl(codigo),
      url: urlVerificacion(codigo),
      fechaAprobacion: fechaEmision,
      municipio: ctx.municipioNombre,
    }

    // Las firmas viven en un bucket privado: hay que firmarlas para que
    // react-pdf pueda descargarlas al componer el documento.
    const [firmaCt, firmaSp, firmaAl] = await Promise.all([
      ctx.firmaUrl ? firmarUrl('documentos', ctx.firmaUrl, 600) : Promise.resolve(null),
      ctx.supervisorFirmaUrl ? firmarUrl('documentos', ctx.supervisorFirmaUrl, 600) : Promise.resolve(null),
      ctx.alcaldeFirmaUrl ? firmarUrl('documentos', ctx.alcaldeFirmaUrl, 600) : Promise.resolve(null),
    ])

    const actaData: ActaTerminacionData = {
      municipio: {
        nombre: ctx.municipioNombre,
        departamento: ctx.municipioDepto ?? undefined,
        nit: ctx.municipioNit ?? undefined,
        representante_legal: ctx.alcalde ?? undefined,
        firma_representante_url: firmaAl ?? undefined,
      },
      contrato: {
        numero: ctx.contratoNumero,
        anio: ctx.contratoAnio,
        objeto: ctx.objeto,
        valor_total: ctx.valorTotal,
        valor_letras_total: ctx.valorLetras ?? undefined,
        fecha_inicio: ctx.fechaInicio,
        fecha_fin: ctx.fechaFin,
      },
      contratista: { nombre_completo: ctx.nombre, cedula: ctx.cedula, firma_url: firmaCt ?? undefined },
      supervisor: {
        nombre_completo: ctx.supervisorNombre,
        cargo: ctx.supervisorCargo ?? undefined,
        firma_url: firmaSp ?? undefined,
      },
      fechaTerminacion,
      fechaAceptacion: fechaEmision,
      verificacion,
    }

    const [{ renderToBuffer }, React, { ActaTerminacionPDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('./pdf/acta-terminacion'),
    ])
    const buffer = await renderToBuffer(
      React.createElement(ActaTerminacionPDF, { data: actaData }) as any,
    ) as unknown as Buffer

    const hash = createHash('sha256').update(buffer).digest('hex')
    const pdfPath = `${ctx.contratoId}.pdf`

    await admin.storage.from(BUCKET).upload(pdfPath, buffer, {
      contentType: 'application/pdf', upsert: true,
    })
    await actualizarHashDocumento(codigo, hash)

    await admin.from('actas_terminacion').update({
      codigo,
      pdf_path: pdfPath,
      hash_sha256: hash,
      emitida_en: fechaEmision,
      updated_at: fechaEmision,
    }).eq('id', acta.id)

    return true
  } catch {
    // Un fallo aquí no puede tumbar una aprobación ya guardada. El acta se
    // puede reemitir: la función es idempotente y se reintenta sola en la
    // siguiente aprobación, o manualmente.
    return false
  }
}
