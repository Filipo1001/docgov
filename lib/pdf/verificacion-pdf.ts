/**
 * lib/pdf/verificacion-pdf.ts — Prepara el código de verificación de un PDF.
 *
 * Se llama en el pipeline central (cache.ts) en cada cache-miss, de modo que
 * TODO documento generado — individual o dentro de un ZIP — lleva su código y
 * QR de forma coherente y comparte el mismo caché. Autocontenido: construye el
 * snapshot no sensible con una consulta pequeña, registra el documento y
 * genera el QR.
 */

import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import {
  registrarDocumento, qrDataUrl, maskCedula, urlVerificacion,
  type TipoDocumento, type DatosVerificacion,
} from '@/lib/verificacion'

export interface VerificacionPDF {
  codigo: string
  qr: string   // data URL PNG
  url: string
  /** Fecha en que el supervisor aprobó el informe (ISO). Null si aún no se aprueba. */
  fechaAprobacion: string | null
  /** Nombre del municipio emisor (ej. "FREDONIA") — para el microtexto de la firma. */
  municipio: string
}

/**
 * Fecha de aprobación del periodo: `fecha_aprobacion` es la fuente directa
 * (seteada por aprobarPeriodos). Si es null — periodos aprobados antes de que
 * esa columna se empezara a llenar — se reconstruye desde el historial.
 */
async function resolverFechaAprobacion(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  periodoId: string,
  fechaAprobacionCol: string | null,
): Promise<string | null> {
  if (fechaAprobacionCol) return fechaAprobacionCol
  const { data: hist } = await admin
    .from('historial_periodos')
    .select('created_at')
    .eq('periodo_id', periodoId)
    .eq('estado_nuevo', 'aprobado')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return hist?.created_at ?? null
}

export async function prepararVerificacionPDF(
  tipo: TipoDocumento,
  periodoId: string,
): Promise<VerificacionPDF | null> {
  try {
    const admin = createAdminSupabaseClient()
    const { data: p } = await admin
      .from('periodos')
      .select(`
        mes, anio, valor_cobro, estado, fecha_aprobacion,
        contrato:contratos(
          numero, anio,
          contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula),
          supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo),
          dependencia:dependencias(nombre),
          municipio:municipios(nombre, departamento)
        )
      `)
      .eq('id', periodoId)
      .single()

    if (!p) return null
    const c = p.contrato as unknown as {
      numero: string; anio: number
      contratista: { nombre_completo: string; cedula: string } | null
      supervisor: { nombre_completo: string } | null
      dependencia: { nombre: string } | null
      municipio: { nombre: string; departamento: string | null } | null
    } | null
    if (!c) return null

    const municipioNombre = c.municipio?.nombre ?? 'Municipio'

    const fechaAprobacion = await resolverFechaAprobacion(admin, periodoId, p.fecha_aprobacion as string | null)

    const datos: DatosVerificacion = {
      tipo,
      contratoNumero: c.numero,
      contratoAnio: c.anio,
      contratistaNombre: c.contratista?.nombre_completo ?? '—',
      cedulaMasked: maskCedula(c.contratista?.cedula),
      dependencia: c.dependencia?.nombre ?? '—',
      supervisorNombre: c.supervisor?.nombre_completo ?? '—',
      mes: p.mes as string,
      anio: p.anio as number,
      valor: (p.valor_cobro as number) ?? 0,
      estado: p.estado as string,
      fechaEmision: fechaAprobacion ?? new Date().toISOString(),
      municipio: c.municipio?.departamento
        ? `${municipioNombre} (${c.municipio.departamento})`
        : municipioNombre,
    }

    const codigo = await registrarDocumento({ tipo, periodoId, datos })
    const qr = await qrDataUrl(codigo)
    return { codigo, qr, url: urlVerificacion(codigo), fechaAprobacion, municipio: municipioNombre }
  } catch {
    // La verificación nunca debe romper la generación del PDF
    return null
  }
}
