'use server'

/**
 * Acta de Terminación Bilateral del contrato (formato F-SGG-037).
 *
 * Espejo de `certificaciones.ts`: aquella se acepta antes del PRIMER informe
 * del contrato, esta antes del ÚLTIMO. Misma mecánica —el contratista acepta,
 * el sistema genera el PDF con firma sellada y código de verificación, y
 * guarda la evidencia del consentimiento— para no obligar a nadie a aprender
 * dos flujos distintos.
 *
 * Diferencia de fondo con la certificación: aquella es una declaración jurada
 * unilateral y pregunta algo (¿vinculó más de un trabajador?). Esta es un acto
 * bilateral y **no pregunta nada**: todos los datos ya están en el sistema. Lo
 * único que aporta el contratista es su consentimiento a dar por terminado el
 * contrato y liberarse recíprocamente de obligaciones.
 *
 * Una por contrato: la terminación ocurre una sola vez.
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
import type { ActaTerminacionData } from '@/lib/pdf/acta-terminacion'
import type { PDFVerificacion } from '@/lib/pdf/types'
import { actaTerminacionPendiente } from '@/lib/actas-terminacion'
import { firmarUrl } from '@/lib/storage-firmado'

const BUCKET = 'actas-terminacion'
const TEXTO_VERSION = 'v1'

interface Contexto {
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
}

/** Carga periodo + contrato + partes + municipio con el admin client. */
async function cargarContexto(periodoId: string): Promise<Contexto | null> {
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
        municipio:municipios(nombre, departamento, nit, representante_legal)
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
  }
}

/**
 * ¿El contratista debe aceptar el acta antes de enviar este informe?
 * Devuelve también lo necesario para pintar el modal, sin pedirle nada nuevo.
 */
export async function verificarActaTerminacionRequerida(periodoId: string): Promise<{
  requerida: boolean
  faltaFirma: boolean
  prefill: {
    contrato: string
    objeto: string
    fechaTerminacion: string
    supervisor: string
    municipio: string
  } | null
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { requerida: false, faltaFirma: false, prefill: null, error: 'No autorizado' }

    const ctx = await cargarContexto(periodoId)
    if (!ctx) return { requerida: false, faltaFirma: false, prefill: null, error: 'Periodo no encontrado' }

    // Solo el titular pasa por este flujo; los demás roles no firman el acta.
    if (ctx.contratistaId !== user.id) {
      return { requerida: false, faltaFirma: false, prefill: null }
    }

    const requerida = await actaTerminacionPendiente(ctx.contratoId, periodoId)

    return {
      requerida,
      faltaFirma: !ctx.firmaUrl,
      prefill: {
        contrato: `${ctx.contratoNumero}-${ctx.contratoAnio}`,
        objeto: ctx.objeto,
        fechaTerminacion: ctx.fechaFin,
        supervisor: ctx.supervisorNombre,
        municipio: ctx.municipioNombre,
      },
    }
  } catch (e: unknown) {
    return { requerida: false, faltaFirma: false, prefill: null, error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/**
 * El contratista acepta la terminación bilateral. Genera el acta firmada y
 * verificable, y registra la evidencia del consentimiento.
 *
 * Idempotente: si el acta ya existe para el contrato, no se regenera — la
 * misma regla que rige todo el sistema, un documento emitido no se reescribe.
 */
export async function aceptarActaTerminacion(periodoId: string): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autorizado' }

    const ctx = await cargarContexto(periodoId)
    if (!ctx) return { error: 'Periodo no encontrado' }
    if (ctx.contratistaId !== user.id) return { error: 'Solo el titular del contrato puede aceptar su acta de terminación' }
    if (!ctx.firmaUrl) return { error: 'Debes registrar tu firma en tu perfil antes de aceptar el acta de terminación.' }

    // La condición se revalida aquí: el cliente ya la consultó, pero esta
    // acción es invocable directamente y no puede fiarse de eso.
    const pendiente = await actaTerminacionPendiente(ctx.contratoId, periodoId)
    if (!pendiente) return {}   // ya existe, o este no es el último periodo

    const admin = createAdminSupabaseClient()
    const fechaAceptacion = new Date().toISOString()
    // Se congela la fecha de fin vigente: una prórroga posterior no debe
    // reescribir un acta ya emitida.
    const fechaTerminacion = ctx.fechaFin

    // ── Verificación (código + QR), compartida con /verificar ──────────────
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
      fechaEmision: fechaAceptacion,
      municipio: ctx.municipioDepto ? `${ctx.municipioNombre} (${ctx.municipioDepto})` : ctx.municipioNombre,
    }
    const codigo = await registrarDocumento({
      tipo: 'acta-terminacion', periodoId, datos, emitidoPor: user.id,
    })

    const verificacion: PDFVerificacion = {
      codigo,
      qr: await qrDataUrl(codigo),
      url: urlVerificacion(codigo),
      fechaAprobacion: fechaAceptacion,
      municipio: ctx.municipioNombre,
    }

    // Las firmas viven en un bucket privado: hay que firmarlas para que
    // react-pdf pueda descargarlas al componer el documento.
    const [firmaContratista, firmaSupervisor] = await Promise.all([
      firmarUrl('documentos', ctx.firmaUrl, 600),
      ctx.supervisorFirmaUrl ? firmarUrl('documentos', ctx.supervisorFirmaUrl, 600) : Promise.resolve(null),
    ])

    // ── Generación del PDF (mismo motor react-pdf) ─────────────────────────
    const actaData: ActaTerminacionData = {
      municipio: {
        nombre: ctx.municipioNombre,
        departamento: ctx.municipioDepto ?? undefined,
        nit: ctx.municipioNit ?? undefined,
        representante_legal: ctx.alcalde ?? undefined,
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
      contratista: {
        nombre_completo: ctx.nombre,
        cedula: ctx.cedula,
        firma_url: firmaContratista ?? undefined,
      },
      supervisor: {
        nombre_completo: ctx.supervisorNombre,
        cargo: ctx.supervisorCargo ?? undefined,
        firma_url: firmaSupervisor ?? undefined,
      },
      fechaTerminacion,
      fechaAceptacion,
      verificacion,
    }

    const [{ renderToBuffer }, React, { ActaTerminacionPDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
      import('@/lib/pdf/acta-terminacion'),
    ])
    const buffer = await renderToBuffer(
      React.createElement(ActaTerminacionPDF, { data: actaData }) as any,
    ) as unknown as Buffer

    const hash = createHash('sha256').update(buffer).digest('hex')
    const pdfPath = `${ctx.contratoId}.pdf`

    await admin.storage.from(BUCKET).upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })
    await actualizarHashDocumento(codigo, hash)

    // ── Evidencia de la aceptación ─────────────────────────────────────────
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = h.get('user-agent') ?? null

    const { error: insErr } = await admin.from('actas_terminacion').upsert({
      contrato_id: ctx.contratoId,
      contratista_id: ctx.contratistaId,
      periodo_id: periodoId,
      fecha_terminacion: fechaTerminacion,
      codigo,
      pdf_path: pdfPath,
      hash_sha256: hash,
      texto_version: TEXTO_VERSION,
      datos_snapshot: {
        nombre: ctx.nombre,
        cedula: ctx.cedula,
        contrato: `${ctx.contratoNumero}-${ctx.contratoAnio}`,
        objeto: ctx.objeto,
        valor_total: ctx.valorTotal,
        supervisor: ctx.supervisorNombre,
        municipio: ctx.municipioNombre,
        fecha_terminacion: fechaTerminacion,
      },
      aceptado_por: user.id,
      fecha_aceptacion: fechaAceptacion,
      ip_aceptacion: ip,
      user_agent: userAgent,
    }, { onConflict: 'contrato_id' })

    if (insErr) return { error: `No se pudo registrar el acta de terminación: ${insErr.message}` }

    return {}
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}
