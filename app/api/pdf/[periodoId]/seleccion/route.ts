/**
 * GET /api/pdf/[periodoId]/seleccion?docs=informe,cuenta-cobro,planilla
 *
 * Descarga SOLO los documentos que se marcaron en «Descargar documentos» de /dashboard/informes:
 *   · uno solo → ese archivo, tal cual (un PDF, o la imagen de la planilla);
 *   · varios   → un ZIP «NOMBRE_MES.zip» con ellos, en el orden de siempre.
 *
 * Documentos: informe · cuenta-cobro (o la factura, si factura electrónicamente) · acta-supervision · acta-pago ·
 * planilla · soporte. Es el mismo armado que /paquete (caché primero, los PDF en paralelo), pero sin generar lo que no se
 * pidió. Los datos obligatorios se exigen solo de los documentos pedidos.
 *
 * Acceso: asesor / supervisor / admin (como /paquete). Condición: periodo aprobado o radicado.
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verificarAccesoPeriodo } from '@/lib/pdf/auth'
import { descargarObjeto } from '@/lib/storage-firmado'
import { estadoFacturaPeriodo, NOMBRE_ARCHIVO_FACTURA } from '@/lib/factura-electronica'
import { NOMBRE_ARCHIVO_SOPORTE_PAGO } from '@/lib/soporte-pago'
import { buildPDFData } from '@/lib/pdf/data'
import { mensajeDatosFaltantes, type TipoDocumento } from '@/lib/pdf/validar'
import { getOrGeneratePDFBuffer } from '@/lib/pdf/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DOCUMENTOS = ['informe', 'cuenta-cobro', 'acta-supervision', 'acta-pago', 'planilla', 'soporte'] as const
type Documento = (typeof DOCUMENTOS)[number]

/** "Felipe Restrepo Ceballos" → "FELIPE_RESTREPO_CEBALLOS" */
function normalizeNombre(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

const extension = (url: string) => {
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
  return ext && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'pdf'
}

const TIPO_CONTENIDO: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ periodoId: string }> }) {
  const { periodoId } = await params
  const pedidos = [...new Set((req.nextUrl.searchParams.get('docs') ?? '').split(','))]
    .filter((d): d is Documento => (DOCUMENTOS as readonly string[]).includes(d))
  if (pedidos.length === 0) {
    return NextResponse.json({ error: 'Elige al menos un documento' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const acceso = await verificarAccesoPeriodo(supabase, periodoId)
  if (!acceso.ok) return NextResponse.json({ error: acceso.message }, { status: acceso.status })
  if (acceso.rol === 'contratista') {
    return NextResponse.json({ error: 'No tienes permiso para esta descarga' }, { status: 403 })
  }

  const data = await buildPDFData(periodoId)
  if (!data) return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  if (!['aprobado', 'radicado'].includes(data.periodo.estado)) {
    return NextResponse.json(
      { error: 'Los documentos se descargan cuando el informe está aprobado o radicado' },
      { status: 403 },
    )
  }

  const factura = pedidos.includes('cuenta-cobro') ? await estadoFacturaPeriodo(periodoId) : null

  // Datos obligatorios, solo de lo que se pidió (la factura no los exige: es un PDF que sube el contratista).
  for (const d of pedidos) {
    if (d === 'planilla' || d === 'soporte') continue
    if (d === 'cuenta-cobro' && factura?.exigeFactura) continue
    const falta = mensajeDatosFaltantes(d as TipoDocumento, data)
    if (falta) return NextResponse.json({ error: falta }, { status: 422 })
  }

  const estado = data.periodo.estado
  const reactPdf = async (tipo: 'cuenta-cobro' | 'acta-supervision' | 'acta-pago') =>
    getOrGeneratePDFBuffer({
      supabase,
      tipo,
      periodoId,
      estado,
      generate: async (verif) => {
        const [{ renderToBuffer }, React, modulo] = await Promise.all([
          import('@react-pdf/renderer'),
          import('react'),
          tipo === 'cuenta-cobro' ? import('@/lib/pdf/cuenta-de-cobro')
            : tipo === 'acta-supervision' ? import('@/lib/pdf/acta-supervision')
            : import('@/lib/pdf/acta-pago'),
        ])
        const Componente = 'CuentaDeCobroPDF' in modulo ? modulo.CuentaDeCobroPDF
          : 'ActaSupervisionPDF' in modulo ? modulo.ActaSupervisionPDF
          : modulo.ActaPagoPDF
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el mismo molde que /paquete
        return renderToBuffer(React.createElement(Componente, { data: { ...data, verificacion: verif ?? undefined } }) as any) as unknown as Promise<Buffer>
      },
    })

  const { data: archivos } = await supabase
    .from('periodos')
    .select('planilla_ss_url, soporte_pago_url')
    .eq('id', periodoId)
    .single()

  // Cada documento pedido, en paralelo: nombre dentro del ZIP y contenido (null si no existe).
  const piezas = await Promise.all(pedidos.map(async (d): Promise<{ orden: number; nombre: string; ext: string; buffer: Buffer | null }> => {
    const orden = DOCUMENTOS.indexOf(d)
    switch (d) {
      case 'informe':
        return {
          orden, nombre: 'Informe_de_Actividades', ext: 'pdf',
          buffer: await getOrGeneratePDFBuffer({
            supabase, tipo: 'informe', periodoId, estado,
            generate: async (verif) => {
              const { generarInformeConAnexos } = await import('@/lib/pdf/anexos')
              return generarInformeConAnexos(periodoId, data, verif)
            },
          }),
        }
      case 'cuenta-cobro':
        if (factura?.exigeFactura) {
          return {
            orden, nombre: NOMBRE_ARCHIVO_FACTURA.replace(/\.pdf$/i, ''), ext: 'pdf',
            buffer: factura.facturaUrl ? await descargarObjeto('documentos', factura.facturaUrl) : null,
          }
        }
        return { orden, nombre: 'Cuenta_de_Cobro', ext: 'pdf', buffer: await reactPdf('cuenta-cobro') }
      case 'acta-supervision':
        return { orden, nombre: 'Acta_de_Supervision', ext: 'pdf', buffer: await reactPdf('acta-supervision') }
      case 'acta-pago':
        return { orden, nombre: 'Acta_de_Pago', ext: 'pdf', buffer: await reactPdf('acta-pago') }
      case 'planilla': {
        const url = archivos?.planilla_ss_url
        return { orden, nombre: 'Planilla_Seguridad_Social', ext: url ? extension(url) : 'pdf', buffer: url ? await descargarObjeto('documentos', url) : null }
      }
      case 'soporte': {
        const url = archivos?.soporte_pago_url
        return { orden, nombre: NOMBRE_ARCHIVO_SOPORTE_PAGO.replace(/\.pdf$/i, ''), ext: 'pdf', buffer: url ? await descargarObjeto('documentos', url) : null }
      }
    }
  }))

  const listas = piezas.filter(p => p.buffer).sort((a, b) => a.orden - b.orden)
  if (listas.length === 0) {
    return NextResponse.json({ error: 'Esos documentos no están disponibles para este informe' }, { status: 404 })
  }

  const base = `${normalizeNombre(data.contrato.contratista.nombre_completo)}_${data.periodo.mes.toUpperCase()}`

  // Uno solo: el archivo tal cual, sin ZIP.
  if (listas.length === 1) {
    const [p] = listas
    return new NextResponse(p.buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': TIPO_CONTENIDO[p.ext] ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${base}_${p.nombre}.${p.ext}"`,
      },
    })
  }

  const zip = new JSZip()
  const carpeta = zip.folder(base)!
  for (const p of listas) carpeta.file(`${p.nombre}.${p.ext}`, p.buffer!)
  // STORE: los PDF ya vienen comprimidos (igual que /paquete).
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${base}.zip"`,
    },
  })
}
