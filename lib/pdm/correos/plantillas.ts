/**
 * Los correos del módulo Plan de Desarrollo: qué dice cada uno.
 *
 * Funciones PURAS: reciben los hechos ya leídos (`datos.ts`) y devuelven asunto, HTML y texto. No leen la base ni
 * envían nada, así que se prueban con casos escritos a mano.
 *
 * ── Cómo se escribe ──────────────────────────────────────────────────────
 *
 *   · Se habla de tú, en frases cortas y sin signos de admiración: son avisos de una entidad pública. La felicitación
 *     de una aprobación es cálida, no festiva.
 *   · Cada correo responde, en este orden: qué pasó, de qué indicador y año, qué hacer ahora (o qué sigue) y cómo
 *     llegar a la pantalla exacta. Quien lo lee en el teléfono entre dos reuniones no debería necesitar más.
 *   · Las palabras de estado son las del semáforo del módulo («Sin validar», «Devuelto», «Aprobado»): el correo y la
 *     pantalla se dicen igual.
 *   · Un correo habla de UN indicador-año (o de un lote de asignaciones), nunca mezcla años: lo reportado en 2025 y
 *     en 2026 son reportes distintos y se avisan por separado.
 *
 * El asunto lleva el nombre del indicador y el año: en una bandeja con veinte avisos se distingue sin abrirlos.
 */

import { fmt } from '../plan'
import { armarCorreo, type Bloque, type CorreoListo } from './envoltura'
import { cuantos, fechaDeColombia, nombreLegible, pesoLegible, primerNombre, recortar, referenciaDe, rotuloDeTipo } from './formato'
import type { Insignia } from './insignias'

// ─── Lo que comparten ────────────────────────────────────────────────────────

export interface IndicadorDeCorreo {
  /** El número de fila del plan: lo que identifica al indicador en la dirección de la pantalla. */
  fila: number
  codigo: string
  nombre: string
  unidad: string
  dependencia: string
}

export interface ArchivoDeCorreo {
  nombre: string
  tipo: string
  bytes: number
}

interface Comun {
  /** Nombre completo del destinatario, como está en la base. */
  destinatario: string
  /** La dirección de la pantalla a la que lleva el botón. */
  enlace: string
  /** `true` fuera de producción: el pie avisa de que el módulo está en vista previa. */
  vistaPrevia: boolean
}

const MAX_ASUNTO_INDICADOR = 58

const asuntoDe = (prefijo: string, i: IndicadorDeCorreo, anio: number) =>
  `${prefijo}: ${recortar(i.nombre, MAX_ASUNTO_INDICADOR)} (${anio})`

/** «45 de 60»; «62 (meta: 60)» si se superó (decir «62 de 60» parece un error); «45» si el plan no trae meta para ese año. */
const avanceTexto = (valor: number, meta: number | null) =>
  meta === null || meta <= 0 ? fmt(valor) : valor > meta ? `${fmt(valor)} (meta: ${fmt(meta)})` : `${fmt(valor)} de ${fmt(meta)}`

/** La nota de debajo del avance: la unidad y, si hay meta, cuánto de ella se cubrió. */
function notaDeAvance(valor: number, meta: number | null, unidad: string): string {
  const pct = meta !== null && meta > 0 ? `${Math.round((valor / meta) * 100)} % de la meta` : 'sin meta definida para el año'
  return `${unidad} · ${pct}`
}

const filasDelIndicador = (i: IndicadorDeCorreo, anio: number) => [
  { rotulo: 'Indicador', valor: i.nombre, nota: i.codigo },
  { rotulo: 'Dependencia', valor: i.dependencia },
  { rotulo: 'Año', valor: String(anio) },
]

const listaDeArchivos = (archivos: readonly ArchivoDeCorreo[], rotulo: string): Bloque => ({
  t: 'lista',
  rotulo,
  items: archivos.map(a => ({ titulo: a.nombre, detalle: `${rotuloDeTipo(a.tipo, a.nombre)} · ${pesoLegible(a.bytes)}` })),
})

const pie = (referencia: string, fecha: string) => `Ref. ${referenciaDe(referencia)} · ${fechaDeColombia(fecha)}`

// ─── 1 · Reporte enviado ─────────────────────────────────────────────────────

export interface DatosReporteEnviado extends Comun {
  reporteId: string
  enviadoEn: string
  indicador: IndicadorDeCorreo
  anio: number
  valor: number
  meta: number | null
  /** Lo que escribió quien reporta. */
  texto: string
  archivos: ArchivoDeCorreo[]
  /** Es la respuesta a una devolución o a un reporte aún sin validar. */
  esCorreccion: boolean
  motivoCorreccion: string | null
}

export function correoReporteEnviado(d: DatosReporteEnviado): CorreoListo {
  const cosa = d.esCorreccion ? 'corrección' : 'reporte'
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, tu ${cosa} de ${d.anio} quedó registrado y ahora espera validación. Mientras no se apruebe se ve como «Sin validar» y no cuenta en el cumplimiento del plan.`,
    },
    {
      t: 'datos',
      filas: [
        ...filasDelIndicador(d.indicador, d.anio),
        { rotulo: 'Avance reportado', valor: avanceTexto(d.valor, d.meta), nota: notaDeAvance(d.valor, d.meta, d.indicador.unidad) },
        ...(d.esCorreccion && d.motivoCorreccion ? [{ rotulo: 'Motivo', valor: recortar(d.motivoCorreccion, 300) }] : []),
      ],
    },
    { t: 'cita', rotulo: 'Lo que reportaste', texto: recortar(d.texto, 400) },
    listaDeArchivos(d.archivos, d.archivos.length === 1 ? 'Evidencia adjunta' : `Evidencias adjuntas (${d.archivos.length})`),
    {
      t: 'pasos',
      rotulo: 'Qué sigue',
      items: [
        `${d.indicador.dependencia} revisa el reporte y lo aprueba o lo devuelve con observaciones.`,
        'Te escribiremos en cualquiera de los dos casos.',
        'Si necesitas cambiar algo antes, entra al indicador y usa «Corregir el reporte».',
      ],
    },
  ]
  return armarCorreo({
    asunto: asuntoDe(d.esCorreccion ? 'Corrección enviada' : 'Reporte enviado', d.indicador, d.anio),
    resumen: `Espera validación de ${d.indicador.dependencia} · Avance ${avanceTexto(d.valor, d.meta)} · ${d.archivos.length} ${d.archivos.length === 1 ? 'archivo' : 'archivos'}`,
    estado: 'sin_validar',
    titulo: d.esCorreccion ? 'Recibimos tu corrección' : 'Recibimos tu reporte',
    bloques,
    boton: { href: d.enlace, texto: 'Ver el indicador' },
    pie: { referencia: pie(d.reporteId, d.enviadoEn), motivo: `porque reportaste el indicador ${d.indicador.codigo} en ${d.anio}.` },
    vistaPrevia: d.vistaPrevia,
  })
}

// ─── 2 · Reporte devuelto ────────────────────────────────────────────────────

export interface DatosReporteDevuelto extends Comun {
  reporteId: string
  devueltoEn: string
  indicador: IndicadorDeCorreo
  anio: number
  valor: number
  meta: number | null
  /** Quien validó (nombre completo, como está en la base). */
  validador: string
  comentario: string | null
  /** Los archivos con observación, cada uno con su motivo. */
  observados: { nombre: string; motivo: string }[]
  /** Cuántos archivos del reporte NO tienen observación (se pueden conservar al corregir). */
  sinObservacion: number
}

export function correoReporteDevuelto(d: DatosReporteDevuelto): CorreoListo {
  const quien = nombreLegible(d.validador)
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, ${quien} revisó tu reporte de ${d.anio} y pidió ajustes antes de aprobarlo. Tu reporte sigue guardado: lo corriges y lo vuelves a enviar.`,
    },
    { t: 'datos', filas: [...filasDelIndicador(d.indicador, d.anio), { rotulo: 'Avance reportado', valor: avanceTexto(d.valor, d.meta) }] },
  ]
  if (d.comentario) bloques.push({ t: 'cita', rotulo: `Comentario de ${quien}`, texto: recortar(d.comentario, 1000) })
  if (d.observados.length > 0) {
    bloques.push({
      t: 'lista',
      rotulo: d.observados.length === 1 ? 'Archivo con observación' : `Archivos con observación (${d.observados.length})`,
      items: d.observados.map(o => ({ titulo: o.nombre, detalle: recortar(o.motivo, 300) })),
    })
  }
  bloques.push({
    t: 'pasos',
    rotulo: 'Cómo corregirlo',
    items: [
      'Abre el indicador y pulsa «Responder a la devolución».',
      d.sinObservacion > 0
        ? `Cambia solo lo observado: ${d.sinObservacion === 1 ? 'el otro archivo viene marcado' : `los otros ${d.sinObservacion} archivos vienen marcados`} como «Se conserva».`
        : 'Sube los archivos corregidos y explica brevemente qué cambiaste.',
      'Pulsa «Enviar corrección»: el reporte vuelve a quedar en validación.',
    ],
  })
  return armarCorreo({
    asunto: asuntoDe('Devolvieron tu reporte', d.indicador, d.anio),
    resumen: `${quien} pidió ajustes${d.observados.length > 0 ? ` en ${cuantos(d.observados.length, 'archivo', 'archivos')}` : ''}. Corrígelo y envíalo de nuevo.`,
    estado: 'devuelto',
    titulo: `Devolvieron tu reporte de ${d.anio}`,
    bloques,
    boton: { href: d.enlace, texto: 'Responder a la devolución' },
    pie: { referencia: pie(d.reporteId, d.devueltoEn), motivo: `porque reportaste el indicador ${d.indicador.codigo} en ${d.anio}.` },
    vistaPrevia: d.vistaPrevia,
  })
}

// ─── 3 · Reporte aprobado ────────────────────────────────────────────────────

export interface DatosReporteAprobado extends Comun {
  reporteId: string
  aprobadoEn: string
  indicador: IndicadorDeCorreo
  anio: number
  valor: number
  meta: number | null
  validador: string
  /** El comentario con que se aprobó, si lo hubo. */
  comentario: string | null
  insignia: Insignia
}

export function correoReporteAprobado(d: DatosReporteAprobado): CorreoListo {
  const quien = nombreLegible(d.validador)
  const cumplida = d.insignia.clave === 'meta_cumplida'
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, ${quien} aprobó tu reporte de ${d.anio}. Tu avance ya cuenta en el cumplimiento del plan. Gracias por el trabajo y por dejarlo bien documentado.`,
    },
    { t: 'sello', insignia: d.insignia, anio: d.anio },
    {
      t: 'datos',
      filas: [
        ...filasDelIndicador(d.indicador, d.anio),
        { rotulo: 'Avance aprobado', valor: avanceTexto(d.valor, d.meta), nota: notaDeAvance(d.valor, d.meta, d.indicador.unidad) },
        { rotulo: 'Aprobó', valor: quien },
      ],
    },
  ]
  if (d.comentario) bloques.push({ t: 'cita', rotulo: `Comentario de ${quien}`, texto: recortar(d.comentario, 600) })
  // Con «Meta cumplida» el sello ya lo dijo; no se repite.
  if (!cumplida) {
    bloques.push({ t: 'parrafo', texto: 'Cuando haya un avance nuevo en este indicador, repórtalo desde su ficha: cada reporte queda con su fecha y su evidencia.' })
  }
  return armarCorreo({
    asunto: `Felicitaciones, aprobaron tu reporte: ${recortar(d.indicador.nombre, 46)} (${d.anio})`,
    resumen: `${d.insignia.nombre} · ${d.insignia.frase}`,
    estado: 'aprobado',
    titulo: `Felicitaciones, aprobaron tu reporte de ${d.anio}`,
    bloques,
    boton: { href: d.enlace, texto: 'Ver el indicador' },
    pie: { referencia: pie(d.reporteId, d.aprobadoEn), motivo: `porque reportaste el indicador ${d.indicador.codigo} en ${d.anio}.` },
    vistaPrevia: d.vistaPrevia,
  })
}

// ─── 4 · Cambios en tus indicadores ──────────────────────────────────────────

/** Lo que le pasó a UNA persona con UN indicador en un cambio de reparto. */
export type TipoCambio =
  | 'asignado_principal'   // no lo tenía y ahora es la responsable
  | 'asignado_apoyo'       // no lo tenía y ahora lo apoya
  | 'paso_a_principal'     // era apoyo y ahora es la responsable
  | 'paso_a_apoyo'         // era la responsable y ahora apoya
  | 'quitado'              // ya no lo tiene

export interface CambioEnIndicador {
  tipo: TipoCambio
  indicador: Pick<IndicadorDeCorreo, 'fila' | 'codigo' | 'nombre' | 'dependencia'>
  /** Quién es hoy la persona responsable (nombre completo), si la hay. Se dice cuando a quien escribimos dejó de serlo. */
  responsableActual: string | null
}

export interface DatosAsignacion extends Comun {
  /** El lote del cambio: de ahí sale la referencia. */
  lote: string
  ocurridoEn: string
  /** Quién hizo el cambio (nombre completo). */
  actor: string
  motivo: string | null
  cambios: CambioEnIndicador[]
}

/** Cuántos indicadores se listan antes de «y N más»: un reparto grande no puede ser un correo de tres pantallas. */
export const MAX_INDICADORES_EN_CORREO = 8

const FRASE_DE_CAMBIO: Record<TipoCambio, string> = {
  asignado_principal: 'Ahora eres responsable',
  asignado_apoyo: 'Ahora lo apoyas',
  paso_a_principal: 'Pasaste de apoyo a responsable',
  paso_a_apoyo: 'Pasaste de responsable a apoyo',
  quitado: 'Ya no lo tienes a tu cargo',
}

/** El orden en que se cuentan: primero lo que obliga a hacer algo (ser responsable), al final lo que se deja. */
const ORDEN: TipoCambio[] = ['asignado_principal', 'paso_a_principal', 'asignado_apoyo', 'paso_a_apoyo', 'quitado']

const detalleDeCambio = (c: CambioEnIndicador): string => {
  const base = `${c.indicador.codigo} · ${FRASE_DE_CAMBIO[c.tipo]}`
  return (c.tipo === 'paso_a_apoyo' || c.tipo === 'quitado') && c.responsableActual
    ? `${base}. Hoy lo lleva ${nombreLegible(c.responsableActual)}.`
    : base
}

function titularDe(cambios: CambioEnIndicador[]): { titulo: string; asunto: string } {
  const n = cambios.length
  const tipos = new Set(cambios.map(c => c.tipo))
  const unico = tipos.size === 1 ? cambios[0].tipo : null
  if (n === 1) {
    const c = cambios[0]
    const nombre = recortar(c.indicador.nombre, 50)
    switch (c.tipo) {
      case 'asignado_principal': return { titulo: 'Te asignaron un indicador', asunto: `Te asignaron como responsable: ${nombre}` }
      case 'asignado_apoyo':     return { titulo: 'Te asignaron un indicador como apoyo', asunto: `Te asignaron como apoyo: ${nombre}` }
      case 'paso_a_principal':   return { titulo: 'Ahora eres responsable de un indicador', asunto: `Ahora eres responsable: ${nombre}` }
      case 'paso_a_apoyo':       return { titulo: 'Pasaste a apoyar un indicador', asunto: `Pasaste a apoyo: ${nombre}` }
      case 'quitado':            return { titulo: 'Ya no tienes un indicador a tu cargo', asunto: `Ya no tienes a tu cargo: ${nombre}` }
    }
  }
  const total = cuantos(n, 'indicador', 'indicadores')
  switch (unico) {
    case 'asignado_principal': return { titulo: `Te asignaron ${total}`, asunto: `Te asignaron ${total} como responsable` }
    case 'asignado_apoyo':     return { titulo: `Te asignaron ${total} como apoyo`, asunto: `Te asignaron ${total} como apoyo` }
    case 'paso_a_principal':   return { titulo: `Ahora eres responsable de ${total}`, asunto: `Ahora eres responsable de ${total}` }
    case 'paso_a_apoyo':       return { titulo: `Pasaste a apoyar ${total}`, asunto: `Pasaste a apoyo en ${total}` }
    case 'quitado':            return { titulo: `Ya no tienes ${total} a tu cargo`, asunto: `Ya no tienes a tu cargo ${total}` }
    default:                   return { titulo: `Cambió tu responsabilidad en ${total}`, asunto: `Cambió tu responsabilidad en ${total}` }
  }
}

/**
 * Cómo se nombra a quien repartió, en medio de una frase («Felipe, el administrador hizo…»). La cuenta del administrador
 * se llama «ADMINISTRADOR» en la base: «Administrador hizo un cambio» no se lee como una persona. Una persona se nombra
 * completa.
 */
const quienReparte = (actor: string): string => (/^administrador(a)?$/i.test(actor.trim()) ? 'el administrador' : nombreLegible(actor))

export function correoAsignacion(d: DatosAsignacion): CorreoListo {
  const cambios = [...d.cambios].sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo) || a.indicador.fila - b.indicador.fila)
  const { titulo, asunto } = titularDe(cambios)
  const actor = quienReparte(d.actor)
  const unico = cambios.length === 1 ? cambios[0] : null

  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, ${actor} hizo ${unico ? 'un cambio' : 'cambios'} en el reparto de indicadores del plan y te afecta${unico ? '' : 'n'}.`,
    },
  ]

  if (unico) {
    bloques.push({
      t: 'datos',
      filas: [
        { rotulo: 'Indicador', valor: unico.indicador.nombre, nota: unico.indicador.codigo },
        { rotulo: 'Dependencia', valor: unico.indicador.dependencia },
        { rotulo: 'Tu papel ahora', valor: FRASE_DE_CAMBIO[unico.tipo] },
        ...(unico.responsableActual && (unico.tipo === 'paso_a_apoyo' || unico.tipo === 'quitado')
          ? [{ rotulo: 'Hoy lo lleva', valor: nombreLegible(unico.responsableActual) }]
          : []),
      ],
    })
  } else {
    const visibles = cambios.slice(0, MAX_INDICADORES_EN_CORREO)
    bloques.push({
      t: 'lista',
      rotulo: `Tus indicadores afectados (${cambios.length})`,
      items: visibles.map(c => ({ titulo: recortar(c.indicador.nombre, 90), detalle: detalleDeCambio(c) })),
      mas: cambios.length - visibles.length || undefined,
    })
  }

  if (d.motivo) bloques.push({ t: 'cita', rotulo: `Motivo que dejó ${actor}`, texto: recortar(d.motivo, 400) })

  const significado: string[] = []
  if (cambios.some(c => c.tipo === 'asignado_principal' || c.tipo === 'paso_a_principal')) {
    significado.push('Como responsable reportas el avance de cada año con su evidencia y respondes a las devoluciones de la secretaría.')
  }
  if (cambios.some(c => c.tipo === 'asignado_apoyo' || c.tipo === 'paso_a_apoyo')) {
    significado.push('Como apoyo ves el indicador y puedes reportar, pero la responsabilidad principal es de otra persona.')
  }
  if (cambios.some(c => c.tipo === 'quitado' || c.tipo === 'paso_a_apoyo')) {
    significado.push('Lo que reportaste antes queda en el historial del indicador: nadie lo borra.')
  }
  bloques.push({ t: 'pasos', rotulo: 'Qué significa', items: significado })

  return armarCorreo({
    asunto,
    resumen: unico ? `${unico.indicador.codigo} · ${FRASE_DE_CAMBIO[unico.tipo]}` : `${cuantos(cambios.length, 'indicador', 'indicadores')} · cambió tu responsabilidad`,
    estado: 'asignacion',
    titulo,
    bloques,
    boton: { href: d.enlace, texto: unico ? 'Ver el indicador' : 'Ver mis indicadores' },
    pie: { referencia: pie(d.lote, d.ocurridoEn), motivo: 'porque cambió tu asignación en el Plan de Desarrollo.' },
    vistaPrevia: d.vistaPrevia,
  })
}
