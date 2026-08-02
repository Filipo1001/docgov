/**
 * GET /api/pdf/mes?mes=Julio&anio=2026&docs=acta-supervision,acta-pago
 *
 * Descarga masiva del mes: un ZIP con los documentos SELECCIONADOS de todas
 * las cuentas aprobadas/radicadas del mes, organizado por contratista:
 *
 *   DOCUMENTOS_JULIO_2026/
 *   ├── JUAN_PEREZ_C045/
 *   │   ├── Acta_de_Supervision.pdf
 *   │   └── Acta_de_Pago.pdf
 *   └── MARIA_GOMEZ_C046/…
 *
 * `docs` permite elegir qué incluir (el supervisor suele necesitar solo las
 * actas; la secretaría el paquete completo).
 *
 * Acceso: admin y supervisor (todos los contratos); asesor (su dependencia).
 * Periodos históricos se excluyen: no tienen actividades digitalizadas y los
 * PDFs generados saldrían vacíos.
 *
 * Rendimiento: cache-first via getOrGeneratePDFBuffer — los periodos
 * aprobados/radicados casi siempre tienen su PDF ya cacheado en Storage, así
 * que el costo dominante es I/O, no CPU. buildPDFData solo se ejecuta si un
 * documento del periodo NO está en caché (promesa compartida entre los
 * generadores del mismo periodo). Concurrencia limitada a 3 periodos a la vez.
 * Fallos parciales no abortan el ZIP: quedan listados en ERRORES.txt.
 */

import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { descargarObjeto } from '@/lib/storage-firmado'
import { buildPDFData } from '@/lib/pdf/data'
import { getOrGeneratePDFBuffer } from '@/lib/pdf/cache'
import { MESES } from '@/lib/constants'
import { estadoFacturaPeriodo, NOMBRE_ARCHIVO_FACTURA } from '@/lib/factura-electronica'
import type { PDFData } from '@/lib/pdf/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DOCS_PDF = {
  'informe':          { archivo: 'Informe_de_Actividades.pdf', componente: () => import('@/lib/pdf/informe-actividades').then(m => m.InformeActividadesPDF) },
  'cuenta-cobro':     { archivo: 'Cuenta_de_Cobro.pdf',        componente: () => import('@/lib/pdf/cuenta-de-cobro').then(m => m.CuentaDeCobroPDF) },
  'acta-supervision': { archivo: 'Acta_de_Supervision.pdf',    componente: () => import('@/lib/pdf/acta-supervision').then(m => m.ActaSupervisionPDF) },
  'acta-pago':        { archivo: 'Acta_de_Pago.pdf',           componente: () => import('@/lib/pdf/acta-pago').then(m => m.ActaPagoPDF) },
} as const

type DocPdf = keyof typeof DOCS_PDF
type DocSolicitado = DocPdf | 'planilla'

function normalizeNombre(nombre: string): string {
  return nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') ?? ''
  const anio = parseInt(searchParams.get('anio') ?? '', 10)
  const docsParam = (searchParams.get('docs') ?? '').split(',').map(d => d.trim()).filter(Boolean)

  // ── Validación de parámetros ─────────────────────────────────
  if (!MESES.includes(mes as (typeof MESES)[number]) || !Number.isFinite(anio)) {
    return NextResponse.json({ error: 'Mes o año inválido' }, { status: 400 })
  }
  const docsValidos: DocSolicitado[] = [...Object.keys(DOCS_PDF) as DocPdf[], 'planilla']
  const docs = docsParam.filter((d): d is DocSolicitado => (docsValidos as string[]).includes(d))
  if (!docs.length) {
    return NextResponse.json({ error: 'Selecciona al menos un tipo de documento' }, { status: 400 })
  }

  // ── Auth: admin/supervisor (todo) · asesor (su dependencia) ──
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: yo } = await supabase
    .from('usuarios')
    .select('rol, dependencia_id')
    .eq('id', user.id)
    .single()
  if (!yo || !['admin', 'supervisor', 'asesor'].includes(yo.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // ── Periodos del mes (aprobados/radicados, no históricos) ────
  const admin = createAdminSupabaseClient()
  const { data: periodosRaw } = await admin
    .from('periodos')
    .select('id, estado, mes, anio, planilla_ss_url, contrato:contratos(numero, dependencia_id, contratista:usuarios!contratos_contratista_id_fkey(nombre_completo))')
    .eq('mes', mes)
    .eq('anio', anio)
    .in('estado', ['aprobado', 'radicado'])
    .eq('es_historico', false)
  type Row = {
    id: string; estado: string; mes: string; anio: number; planilla_ss_url: string | null
    contrato: { numero: string; dependencia_id: string | null; contratista: { nombre_completo: string } | null } | null
  }
  let periodos = ((periodosRaw ?? []) as unknown as Row[])
  if (yo.rol === 'asesor' && yo.dependencia_id) {
    periodos = periodos.filter(p => p.contrato?.dependencia_id === yo.dependencia_id)
  }
  if (!periodos.length) {
    return NextResponse.json({ error: `No hay cuentas aprobadas o radicadas en ${mes} ${anio}` }, { status: 404 })
  }

  // Orden estable por contratista para carpetas predecibles
  periodos.sort((a, b) =>
    (a.contrato?.contratista?.nombre_completo ?? '').localeCompare(b.contrato?.contratista?.nombre_completo ?? ''),
  )

  // ── Armar ZIP con concurrencia limitada ──────────────────────
  const zip = new JSZip()
  const carpetaRaiz = `DOCUMENTOS_${mes.toUpperCase()}_${anio}`
  const raiz = zip.folder(carpetaRaiz)!
  const errores: string[] = []
  const docsPdfSolicitados = docs.filter((d): d is DocPdf => d !== 'planilla')
  const incluirPlanilla = docs.includes('planilla')

  async function procesarPeriodo(p: Row) {
    const nombre = normalizeNombre(p.contrato?.contratista?.nombre_completo ?? 'SIN_NOMBRE')
    const carpeta = raiz.folder(`${nombre}_C${p.contrato?.numero ?? 'XX'}`)!
    const etiqueta = `${p.contrato?.contratista?.nombre_completo ?? '?'} (contrato ${p.contrato?.numero ?? '?'})`

    // buildPDFData es costoso (~8 queries): compartido entre los generadores
    // del periodo y ejecutado SOLO si algún documento no está en caché.
    let dataPromise: Promise<PDFData | null> | null = null
    const getData = () => (dataPromise ??= buildPDFData(p.id))

    // Un mismo lote mezcla contratistas con Cuenta de Cobro y contratistas que
    // facturan electrónicamente; la condición se resuelve por periodo.
    const factura = docsPdfSolicitados.includes('cuenta-cobro')
      ? await estadoFacturaPeriodo(p.id)
      : { exigeFactura: false, facturaUrl: null }

    await Promise.all([
      ...docsPdfSolicitados.map(async (tipo) => {
        try {
          if (tipo === 'cuenta-cobro' && factura.exigeFactura) {
            if (!factura.facturaUrl) {
              errores.push(`${etiqueta}: factura electrónica sin adjuntar`)
              return
            }
            const fb = await descargarObjeto('documentos', factura.facturaUrl)
            if (!fb) {
              errores.push(`${etiqueta}: no se pudo descargar la factura electrónica`)
              return
            }
            carpeta.file(NOMBRE_ARCHIVO_FACTURA, fb)
            return
          }
          const buffer = await getOrGeneratePDFBuffer({
            supabase: admin,
            tipo,
            periodoId: p.id,
            estado: p.estado,
            generate: async (verif) => {
              const data = await getData()
              if (!data) throw new Error('datos del periodo no disponibles')
              // El informe pasa por el generador con anexos; los demás
              // documentos no llevan anexos y se renderizan directo.
              if (tipo === 'informe') {
                const { generarInformeConAnexos } = await import('@/lib/pdf/anexos')
                return generarInformeConAnexos(p.id, data, verif)
              }
              const [{ renderToBuffer }, React, Componente] = await Promise.all([
                import('@react-pdf/renderer'),
                import('react'),
                DOCS_PDF[tipo].componente(),
              ])
              return renderToBuffer(React.createElement(Componente, { data: { ...data, verificacion: verif ?? undefined } }) as never) as unknown as Promise<Buffer>
            },
          })
          carpeta.file(DOCS_PDF[tipo].archivo, buffer)
        } catch (e) {
          errores.push(`${etiqueta}: ${DOCS_PDF[tipo].archivo} — ${e instanceof Error ? e.message : 'error'}`)
        }
      }),
      (async () => {
        if (!incluirPlanilla) return
        if (!p.planilla_ss_url) {
          errores.push(`${etiqueta}: sin planilla adjunta`)
          return
        }
        const buffer = await descargarObjeto('documentos', p.planilla_ss_url)
        if (!buffer) {
          errores.push(`${etiqueta}: no se pudo descargar la planilla`)
          return
        }
        const ext = new URL(p.planilla_ss_url).pathname.split('.').pop()?.toLowerCase()
        const extOk = ext && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'pdf'
        carpeta.file(`Planilla_Seguridad_Social.${extOk}`, buffer)
      })(),
    ])
  }

  // Lotes de 3 periodos: suficiente paralelismo para I/O de caché sin
  // disparar picos de CPU/memoria en los cache-miss (render de PDFs).
  const LOTE = 3
  for (let i = 0; i < periodos.length; i += LOTE) {
    await Promise.all(periodos.slice(i, i + LOTE).map(procesarPeriodo))
  }

  if (errores.length) {
    raiz.file(
      'ERRORES.txt',
      `Documentos que no se pudieron incluir (${errores.length}):\n\n${errores.join('\n')}\n`,
    )
  }

  // STORE: los PDFs ya vienen comprimidos — DEFLATE gastaría CPU sin ganancia
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${carpetaRaiz}.zip"`,
      'X-Documentos-Errores': String(errores.length),
    },
  })
}
