import { esNivelHabilitable, type NivelPdm } from './niveles'
import type { ComentarioVista, DetalleIndicador, EvidenciaVista, ReporteDetalle, ValidacionVista } from './seguimiento-acciones'
import type { EstadoReporte } from './seguimiento'

/**
 * De las filas de la base al detalle de un indicador: todas las versiones de sus reportes (de todos los
 * años) con sus evidencias y validaciones, y sus comentarios.
 *
 * Pura: no lee nada. La lectura vive en `app/actions/pdm-seguimiento.ts`.
 */

export interface FilaReporteDetalle {
  id: string
  anio: number
  valor: number | string
  valor_anterior: number | string | null
  texto: string | null
  autor_id: string | null
  autor_nombre: string
  corrige_a: string | null
  motivo_correccion: string | null
  created_at: string
}

export interface FilaEvidencia {
  id: string
  reporte_id: string
  nombre: string
  tipo: string
  bytes: number | string
}

export interface FilaValidacion {
  reporte_id: string
  estado: string
  comentario: string | null
  validador_nombre: string
  created_at: string
}

export interface FilaComentario {
  id: string
  reporte_id: string | null
  texto: string
  autor_nombre: string
  autor_nivel: string
  created_at: string
}

const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const nivelDe = (v: string): NivelPdm => (v === 'admin' || esNivelHabilitable(v) ? v : 'responsable')

/** Del más reciente al más antiguo; a igual instante, el de id mayor (desempate estable). */
const masReciente = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1

export function armarDetalle(entrada: {
  reportes: FilaReporteDetalle[]
  evidencias: FilaEvidencia[]
  validaciones: FilaValidacion[]
  comentarios: FilaComentario[]
  /** Quién pregunta. */
  yoId: string
  /** Quien pregunta puede validar los reportes de ESTE indicador (administrador, o la secretaría de su dependencia). */
  puedeValidarElIndicador: boolean
}): DetalleIndicador {
  const corregidos = new Set(entrada.reportes.map(r => r.corrige_a).filter((x): x is string => x !== null))
  // Lo último que se reportó en cada año: es lo único que se valida (la base lo exige igual).
  const ultimoDelAnio = new Map<number, string>()
  for (const r of [...entrada.reportes].sort(masReciente).reverse()) ultimoDelAnio.set(r.anio, r.id)

  const evidenciasDe = new Map<string, EvidenciaVista[]>()
  for (const e of entrada.evidencias) {
    const lista = evidenciasDe.get(e.reporte_id) ?? []
    lista.push({ id: e.id, nombre: e.nombre, tipo: e.tipo, bytes: numero(e.bytes) ?? 0 })
    evidenciasDe.set(e.reporte_id, lista)
  }

  const validacionesDe = new Map<string, ValidacionVista[]>()
  for (const v of [...entrada.validaciones].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    if (v.estado !== 'aprobado' && v.estado !== 'devuelto') continue
    const lista = validacionesDe.get(v.reporte_id) ?? []
    lista.push({ estado: v.estado, comentario: v.comentario, validadorNombre: v.validador_nombre, creado: v.created_at })
    validacionesDe.set(v.reporte_id, lista)
  }

  const reportes: ReporteDetalle[] = [...entrada.reportes].sort(masReciente).flatMap(r => {
    const valor = numero(r.valor)
    if (valor === null) return []
    const validaciones = validacionesDe.get(r.id) ?? []
    const estado: EstadoReporte = validaciones.length ? validaciones[validaciones.length - 1].estado : 'pendiente'
    const vigente = !corregidos.has(r.id)
    return [{
      id: r.id,
      anio: r.anio,
      valor,
      valorAnterior: numero(r.valor_anterior),
      texto: r.texto ?? '',
      autorId: r.autor_id,
      autorNombre: r.autor_nombre,
      creado: r.created_at,
      corrigeA: r.corrige_a,
      motivoCorreccion: r.motivo_correccion,
      vigente,
      estado,
      evidencias: evidenciasDe.get(r.id) ?? [],
      validaciones,
      // Nadie valida lo suyo, ni lo que ya fue superado por una corrección o por un reporte más reciente del año.
      puedeValidar: entrada.puedeValidarElIndicador && vigente && ultimoDelAnio.get(r.anio) === r.id && r.autor_id !== entrada.yoId,
    } satisfies ReporteDetalle]
  })

  const comentarios: ComentarioVista[] = [...entrada.comentarios].sort(masReciente).map(c => ({
    id: c.id,
    reporteId: c.reporte_id,
    texto: c.texto,
    autorNombre: c.autor_nombre,
    autorNivel: nivelDe(c.autor_nivel),
    creado: c.created_at,
  }))

  return { reportes, comentarios }
}
