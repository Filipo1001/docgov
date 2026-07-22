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
  prefill: { nombre: string; cedula: string; anioGravable: number; municipio: string } | null
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

    return {
      requerida,
      faltaFirma: !ctx.firmaUrl,
      prefill: {
        nombre: ctx.nombre,
        cedula: ctx.cedula,
        anioGravable: ctx.anioGravable,
        municipio: ctx.municipioNombre,
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

    // ── Generación del PDF (mismo motor react-pdf) ─────────────────────────
    const certData: CertificacionData = {
      municipio: { nombre: ctx.municipioNombre, departamento: ctx.municipioDepto ?? undefined },
      contratista: { nombre_completo: ctx.nombre, cedula: ctx.cedula, firma_url: ctx.firmaUrl },
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
