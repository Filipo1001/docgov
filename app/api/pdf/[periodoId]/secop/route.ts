/**
 * GET /api/pdf/[periodoId]/secop
 *
 * Descarga un ZIP con los documentos requeridos para SECOP:
 *   Informe_de_Actividades.pdf
 *   Cuenta_de_Cobro.pdf
 *   Planilla_Seguridad_Social.{ext}   (si está adjunta)
 *   Certificacion_de_Retencion.pdf    (solo en la PRIMERA cuenta del año)
 *   Contrato.pdf                      (el expediente, solo en la PRIMERA cuenta)
 *   Acta_de_Terminacion.pdf           (solo en el periodo donde se aceptó)
 *
 * Acceso: contratista del contrato + asesor / supervisor / admin
 * Condición: periodo debe estar en estado 'aprobado' o 'radicado'
 * Nombre ZIP: NOMBRE_CONTRATISTA_MES_SECOP.zip
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { descargarObjeto } from '@/lib/storage-firmado'
import { estadoFacturaPeriodo, NOMBRE_ARCHIVO_FACTURA } from '@/lib/factura-electronica'
import { buildPDFData } from '@/lib/pdf/data'
import { getOrGeneratePDFBuffer } from '@/lib/pdf/cache'
import { mensajeDatosFaltantes } from '@/lib/pdf/validar'
import { descargarCertificacionDelPaquete, NOMBRE_ARCHIVO_CERTIFICACION } from '@/lib/certificaciones'
import { descargarContratoDelPaquete, NOMBRE_ARCHIVO_CONTRATO } from '@/lib/expediente-contrato'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function normalizeNombre(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ periodoId: string }> }
) {
  const { periodoId } = await params

  const supabase = await createServerSupabaseClient()

  const acceso = await verificarAccesoPeriodo(supabase, periodoId)
  if (!acceso.ok) {
    return NextResponse.json({ error: acceso.message }, { status: acceso.status })
  }

  const data = await buildPDFData(periodoId)
  if (!data) {
    return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  }

  if (!['aprobado', 'radicado'].includes(data.periodo.estado)) {
    return NextResponse.json(
      { error: 'Los documentos SECOP solo están disponibles cuando el periodo ha sido aprobado por la secretaria' },
      { status: 403 }
    )
  }

  // Datos incompletos → 422 con mensaje claro (el ZIP incluye la Cuenta de Cobro)
  // Quien factura electrónicamente lleva su factura en lugar de la Cuenta de
  // Cobro, así que los datos obligatorios de ese documento no le bloquean.
  const factura = await estadoFacturaPeriodo(periodoId)
  const faltanDatos = mensajeDatosFaltantes(
    factura.exigeFactura ? 'informe' : 'cuenta-cobro',
    data,
  )
  if (faltanDatos) {
    return NextResponse.json({ error: faltanDatos }, { status: 422 })
  }

  // Fetch planilla in parallel with PDF generation
  const planillaPromise = supabase
    .from('periodos')
    .select('planilla_ss_url')
    .eq('id', periodoId)
    .single()

  const estado = data.periodo.estado

  // La carta de no retención y el acta de terminación salen del depósito, no
  // de un render: se piden AQUÍ para que su ida y vuelta corra en paralelo con
  // la generación de los PDF, que es lo que tarda. Resolverlas al final, en
  // secuencia, sumaba su tiempo a uno que ya era largo.
  const certificacionPromise = descargarCertificacionDelPaquete(periodoId)
  const contratoPromise = descargarContratoDelPaquete(periodoId)
  const actaTerminacionPromise = (async () => {
    try {
      const admin = createAdminSupabaseClient()
      const { data: acta } = await admin
        .from('actas_terminacion')
        .select('pdf_path')
        .eq('periodo_id', periodoId)
        .maybeSingle()
      if (!acta?.pdf_path) return null
      const { data: blob } = await admin.storage.from('actas-terminacion').download(acta.pdf_path)
      return blob ? Buffer.from(await blob.arrayBuffer()) : null
    } catch {
      return null   // el paquete sale sin el acta
    }
  })()

  // Informe y Cuenta de Cobro: cache-first (igual que /actas). La primera
  // descarga genera y cachea; las siguientes se sirven desde Storage casi
  // instantáneamente. Los tipos 'informe' y 'cuenta-cobro' ya son invalidados
  // por invalidarCachePDF cuando cambia el estado del periodo.
  const [informeBuffer, cuentaBuffer, planillaResult] = await Promise.all([
    getOrGeneratePDFBuffer({
      supabase,
      tipo: 'informe',
      periodoId,
      estado,
      generate: async (verif) => {
        const { generarInformeConAnexos } = await import('@/lib/pdf/anexos')
        return generarInformeConAnexos(periodoId, data, verif)
      },
    }),
    factura.exigeFactura
      ? (factura.facturaUrl ? descargarObjeto('documentos', factura.facturaUrl) : Promise.resolve(null))
      : getOrGeneratePDFBuffer({
          supabase,
          tipo: 'cuenta-cobro',
          periodoId,
          estado,
          generate: async (verif) => {
            const [{ renderToBuffer }, React, { CuentaDeCobroPDF }] = await Promise.all([
              import('@react-pdf/renderer'),
              import('react'),
              import('@/lib/pdf/cuenta-de-cobro'),
            ])
            return renderToBuffer(React.createElement(CuentaDeCobroPDF, { data: { ...data, verificacion: verif ?? undefined } }) as any) as unknown as Promise<Buffer>
          },
        }),
    planillaPromise,
  ])

  // Fetch planilla file if available (private bucket → storage.download)
  let planillaBuffer: Buffer | null = null
  let planillaExt = 'pdf'
  const planillaUrl = planillaResult.data?.planilla_ss_url
  if (planillaUrl) {
    // Non-fatal — ZIP generated without planilla
    planillaBuffer = await descargarObjeto('documentos', planillaUrl)
    const ext = new URL(planillaUrl).pathname.split('.').pop()?.toLowerCase()
    if (ext && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      planillaExt = ext === 'jpeg' ? 'jpg' : ext
    }
  }

  const nombreNorm = normalizeNombre(data.contrato.contratista.nombre_completo)
  const mesNorm    = data.periodo.mes.toUpperCase()
  const folderName = `${nombreNorm}_${mesNorm}_SECOP`

  const zip    = new JSZip()
  const folder = zip.folder(folderName)!

  folder.file('Informe_de_Actividades.pdf', informeBuffer)
  if (cuentaBuffer) {
    folder.file(factura.exigeFactura ? NOMBRE_ARCHIVO_FACTURA : 'Cuenta_de_Cobro.pdf', cuentaBuffer)
  }
  if (planillaBuffer) {
    folder.file(`Planilla_Seguridad_Social.${planillaExt}`, planillaBuffer)
  }

  // La carta de no retención acompaña por norma a la PRIMERA cuenta de cobro.
  // Hasta ahora había que acordarse de bajarla aparte y adjuntarla a mano —lo
  // mismo que se hacía cuando se firmaba en papel—, así que el trámite que
  // este documento venía a resolver seguía igual de manual en el último paso.
  //
  // El acta de terminación va en el paquete del periodo donde se aceptó, para
  // que el último informe salga con el cierre del contrato dentro y no se
  // repita en todos los anteriores.
  //
  // Las dos son no bloqueantes: si el depósito falla, el paquete sale sin
  // ellas. Un ZIP incompleto se vuelve a bajar; un 500 deja a la contratista
  // sin nada el día que va a radicar.
  const [certificacionBuffer, actaBuffer, contratoBuffer] = await Promise.all([
    certificacionPromise,
    actaTerminacionPromise,
    contratoPromise,
  ])
  if (contratoBuffer) folder.file(NOMBRE_ARCHIVO_CONTRATO, contratoBuffer)
  if (certificacionBuffer) folder.file(NOMBRE_ARCHIVO_CERTIFICACION, certificacionBuffer)
  if (actaBuffer) folder.file('Acta_de_Terminacion.pdf', actaBuffer)

  // STORE (sin compresión): los PDFs ya vienen comprimidos, así que DEFLATE
  // gasta CPU sin reducir tamaño — y esa CPU cuenta contra maxDuration en el
  // peor caso (cache miss). Alineado con paquete/route.ts.
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'STORE',
  })

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${folderName}.zip"`,
    },
  })
}
