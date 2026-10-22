import { esNivelHabilitable, type NivelPdm } from './niveles'
import { anulacionesPorReporte, idsAnulados, type FilaAnulacion } from './anulaciones'
import type { ComentarioVista, DetalleIndicador, EvidenciaVista, ObservacionVista, ReporteDetalle, ValidacionVista } from './seguimiento-acciones'
import type { EstadoReporte } from './seguimiento'

/**
 * De las filas de la base al detalle de un indicador: todas las versiones de sus reportes (de todos los
 * años) con sus evidencias y validaciones, y sus comentarios.
 *
 * Lo ANULADO (migración 068) es historia: no cuenta como «lo último del año», no corrige ni es corregido por nada que
 * cuente, y solo llega aquí para quien la base deja verlo (el administrador, Control Interno y quien lo reportó, esto
 * último desde la 069); para el resto, la base ni entrega los reportes anulados.
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
  /** La evidencia de la versión anterior de la que se conservó este archivo; `null` si se subió con este reporte. */
  copia_de?: string | null
  /** La huella (SHA-256) del contenido y cuándo la calculó el servidor; `null` si no se pudo calcular (migración 070). */
  sha256?: string | null
  huella_calculada_en?: string | null
}

export interface FilaValidacion {
  reporte_id: string
  estado: string
  comentario: string | null
  validador_nombre: string
  created_at: string
  /** Los archivos que se devolvieron: `[{evidencia, motivo}]`. */
  observaciones?: unknown
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
  /** Las anulaciones y restauraciones de estos reportes. Solo se piden para quien puede verlas; sin ellas, nada está anulado. */
  anulaciones?: FilaAnulacion[]
  /** Quien pregunta es el administrador: puede anular y restaurar. */
  esAdmin?: boolean
}): Omit<DetalleIndicador, 'borradores'> {
  const esAdmin = entrada.esAdmin === true
  const anulados = idsAnulados(entrada.anulaciones ?? [])
  const historiaAnulaciones = anulacionesPorReporte(entrada.anulaciones ?? [])
  const activos = entrada.reportes.filter(r => !anulados.has(r.id))
  // Una versión corregida es historia, pero solo si la corrección CUENTA (la base anula una cadena entera, nunca a medias).
  const corregidos = new Set(activos.map(r => r.corrige_a).filter((x): x is string => x !== null))
  // Con corrección o sin ella, cuente o no: la versión más reciente de su cadena es la que no tiene ninguna.
  const conCorreccion = new Set(entrada.reportes.map(r => r.corrige_a).filter((x): x is string => x !== null))
  // Lo último que se reportó en cada año (sin contar lo anulado): es lo único que se valida y se anula (la base lo exige igual).
  const ultimoDelAnio = new Map<number, string>()
  for (const r of [...activos].sort(masReciente).reverse()) ultimoDelAnio.set(r.anio, r.id)
  const porId = new Map(entrada.reportes.map(r => [r.id, r]))

  // La nota más reciente de cada archivo devuelto, con quién y cuándo (las validaciones se leen de la más antigua a la más reciente).
  const observadas = new Map<string, ObservacionVista>()
  for (const v of [...entrada.validaciones].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    if (v.estado !== 'devuelto' || !Array.isArray(v.observaciones)) continue
    for (const o of v.observaciones as { evidencia?: unknown; motivo?: unknown }[]) {
      if (typeof o?.evidencia === 'string' && typeof o?.motivo === 'string' && o.motivo.trim() !== '') {
        observadas.set(o.evidencia, { motivo: o.motivo, por: v.validador_nombre, cuando: v.created_at })
      }
    }
  }

  const evidenciasDe = new Map<string, EvidenciaVista[]>()
  for (const e of entrada.evidencias) {
    const lista = evidenciasDe.get(e.reporte_id) ?? []
    lista.push({
      id: e.id, nombre: e.nombre, tipo: e.tipo, bytes: numero(e.bytes) ?? 0,
      conservada: (e.copia_de ?? null) !== null,
      sha256: e.sha256 ?? null,
      huellaCalculadaEn: e.huella_calculada_en ?? null,
      observacion: observadas.get(e.id) ?? null,
    })
    evidenciasDe.set(e.reporte_id, lista)
  }

  const validacionesDe = new Map<string, ValidacionVista[]>()
  for (const v of [...entrada.validaciones].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    if (v.estado !== 'aprobado' && v.estado !== 'devuelto') continue
    const lista = validacionesDe.get(v.reporte_id) ?? []
    // Devolver un reporte que estaba APROBADO es reabrirlo: la secretaría o el administrador lo deshacen, y se dice así.
    const reabre = v.estado === 'devuelto' && lista.length > 0 && lista[lista.length - 1].estado === 'aprobado'
    lista.push({ estado: v.estado, comentario: v.comentario, validadorNombre: v.validador_nombre, creado: v.created_at, reabre })
    validacionesDe.set(v.reporte_id, lista)
  }
  const estadoDe = (id: string): EstadoReporte => {
    const l = validacionesDe.get(id) ?? []
    return l.length ? l[l.length - 1].estado : 'pendiente'
  }

  /** ¿Se puede restaurar este reporte anulado? Es la versión más reciente de su cadena, nada vigente vino después y el avance anterior sigue aprobado. */
  const sePuedeRestaurar = (r: FilaReporteDetalle): boolean => {
    if (conCorreccion.has(r.id)) return false
    if (activos.some(a => a.anio === r.anio && masReciente(a, r) < 0)) return false
    // La primera versión de la cadena: un avance nuevo solo puede existir después de uno aprobado.
    let raiz = r
    const vistos = new Set<string>()
    while (raiz.corrige_a !== null && porId.has(raiz.corrige_a) && !vistos.has(raiz.id)) {
      vistos.add(raiz.id)
      raiz = porId.get(raiz.corrige_a)!
    }
    const anterior = activos.filter(a => a.anio === raiz.anio && masReciente(a, raiz) > 0).sort(masReciente)[0]
    return !anterior || estadoDe(anterior.id) === 'aprobado'
  }

  const reportes: ReporteDetalle[] = [...entrada.reportes].sort(masReciente).flatMap(r => {
    const valor = numero(r.valor)
    if (valor === null) return []
    const validaciones = validacionesDe.get(r.id) ?? []
    const estado: EstadoReporte = estadoDe(r.id)
    const anulado = anulados.has(r.id)
    const vigente = !anulado && !corregidos.has(r.id)
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
      // Nadie valida lo suyo, ni lo que ya fue superado por una corrección o por un reporte más reciente del año, ni lo anulado.
      // Y un reporte APROBADO solo lo reabre el administrador (la secretaría aprueba y devuelve lo pendiente; la base lo exige igual).
      puedeValidar: entrada.puedeValidarElIndicador && vigente && ultimoDelAnio.get(r.anio) === r.id && r.autor_id !== entrada.yoId
        && (estado !== 'aprobado' || esAdmin),
      anulado,
      anulaciones: historiaAnulaciones.get(r.id) ?? [],
      puedeAnular: esAdmin && !anulado && ultimoDelAnio.get(r.anio) === r.id,
      puedeRestaurar: esAdmin && anulado && sePuedeRestaurar(r),
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
