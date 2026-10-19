/**
 * Los avisos de lo que le pasa a un REPORTE o a un INDICADOR a quien responde por él: reabierto, anulado, restaurado,
 * comentario de Control Interno y copia al responsable cuando reporta una persona de apoyo.
 *
 * Funciones PURAS (como `plantillas.ts`). El tono es el de siempre: de tú, frases cortas, sin signos de admiración, y
 * cada correo responde qué pasó, de qué indicador y año, qué hacer ahora y cómo llegar a la pantalla exacta.
 *
 * ── Qué se dice y qué no ─────────────────────────────────────────────────
 *
 *   · Quien reportó SÍ recibe el motivo de reabrir, anular o restaurar su reporte: es suyo, y verlo le evita pedir
 *     explicaciones. (La página pública de verificación, en cambio, no lo muestra nunca.)
 *   · Anular no borra nada y se dice: «queda en el historial». Reabrir dice qué cambia para el cumplimiento (deja de
 *     contar hasta que se corrija y se apruebe otra vez).
 *   · La copia al responsable cuando reporta un apoyo es INFORMATIVA: dice que no tiene que hacer nada.
 */

import { armarCorreo, type Bloque, type CorreoListo } from './envoltura'
import { cuantos, nombreLegible, primerNombre, recortar } from './formato'
import {
  asuntoDe, avanceTexto, filasDelIndicador, pie, quienReparte,
  type Comun, type IndicadorDeCorreo,
} from './plantillas'

/** Lo que tienen en común los avisos sobre un reporte. */
interface SobreUnReporte extends Comun {
  reporteId: string
  ocurridoEn: string
  indicador: IndicadorDeCorreo
  anio: number
  /** El avance que esa persona reportó. */
  valor: number
  meta: number | null
  /** Quién lo hizo (nombre completo, como está en la base). */
  actor: string
}

const motivoPie = (i: IndicadorDeCorreo, anio: number) => `porque reportaste el indicador ${i.codigo} en ${anio}.`

// ─── Reabierto ───────────────────────────────────────────────────────────────

export interface DatosReporteReabierto extends SobreUnReporte {
  /** Lo que dijo quien reabrió. */
  comentario: string | null
  /** Los archivos que se marcaron con problema, cada uno con su motivo. */
  observados: { nombre: string; motivo: string }[]
}

export function correoReporteReabierto(d: DatosReporteReabierto): CorreoListo {
  const quien = quienReparte(d.actor)
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, ${quien} reabrió el reporte de ${d.anio} que la secretaría había aprobado. Mientras no se corrija y se apruebe de nuevo, deja de contar en el cumplimiento del plan.`,
    },
    { t: 'datos', filas: [...filasDelIndicador(d.indicador, d.anio), { rotulo: 'Avance reportado', valor: avanceTexto(d.valor, d.meta) }] },
  ]
  if (d.comentario) bloques.push({ t: 'cita', rotulo: 'Por qué se reabrió', texto: recortar(d.comentario, 1000) })
  if (d.observados.length > 0) {
    bloques.push({
      t: 'lista',
      rotulo: d.observados.length === 1 ? 'Archivo con observación' : `Archivos con observación (${d.observados.length})`,
      items: d.observados.map(o => ({ titulo: o.nombre, detalle: recortar(o.motivo, 300) })),
    })
  }
  bloques.push({
    t: 'pasos',
    rotulo: 'Qué sigue',
    items: [
      'Abre el indicador y pulsa «Responder a la devolución».',
      'Corrige el valor, la descripción o los archivos, y explica brevemente qué cambiaste.',
      `${d.indicador.dependencia} lo valida otra vez. Cuando lo apruebe, vuelve a contar.`,
    ],
  })
  return armarCorreo({
    asunto: asuntoDe('Reabrieron tu reporte', d.indicador, d.anio),
    resumen: 'Dejó de contar hasta que lo corrijas y se apruebe de nuevo.',
    estado: 'reabierto',
    titulo: `Reabrieron tu reporte aprobado de ${d.anio}`,
    bloques,
    boton: { href: d.enlace, texto: 'Corregir el reporte' },
    pie: { referencia: pie(d.reporteId, d.ocurridoEn), motivo: motivoPie(d.indicador, d.anio) },
    vistaPrevia: d.vistaPrevia,
  })
}

// ─── Anulado ─────────────────────────────────────────────────────────────────

export interface DatosReporteAnulado extends SobreUnReporte {
  /** El motivo que escribió quien anuló. */
  motivo: string | null
}

export function correoReporteAnulado(d: DatosReporteAnulado): CorreoListo {
  const quien = quienReparte(d.actor)
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, ${quien} anuló tu reporte de ${d.anio}. Ya no cuenta en el cumplimiento del plan y no se puede corregir. No se borró: queda en el historial del indicador.`,
    },
    { t: 'datos', filas: [...filasDelIndicador(d.indicador, d.anio), { rotulo: 'Avance que habías reportado', valor: avanceTexto(d.valor, d.meta) }] },
  ]
  if (d.motivo) bloques.push({ t: 'cita', rotulo: 'Por qué se anuló', texto: recortar(d.motivo, 600) })
  bloques.push({
    t: 'pasos',
    rotulo: 'Qué puedes hacer',
    items: [
      'Lee el motivo. Si el indicador sigue a tu cargo, puedes reportar de nuevo desde su ficha.',
      'Si crees que fue un error, habla con tu secretaría: el administrador puede restaurar el reporte.',
    ],
  })
  return armarCorreo({
    asunto: asuntoDe('Anularon tu reporte', d.indicador, d.anio),
    resumen: 'Ya no cuenta en el cumplimiento. Queda en el historial del indicador.',
    estado: 'anulado',
    titulo: `Anularon tu reporte de ${d.anio}`,
    bloques,
    boton: { href: d.enlace, texto: 'Ver el indicador' },
    pie: { referencia: pie(d.reporteId, d.ocurridoEn), motivo: motivoPie(d.indicador, d.anio) },
    vistaPrevia: d.vistaPrevia,
  })
}

// ─── Restaurado ──────────────────────────────────────────────────────────────

export interface DatosReporteRestaurado extends SobreUnReporte {
  motivo: string | null
}

export function correoReporteRestaurado(d: DatosReporteRestaurado): CorreoListo {
  const quien = quienReparte(d.actor)
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, ${quien} restauró tu reporte de ${d.anio}, que se había anulado. Vuelve a verse en el indicador tal como estaba, con el estado que tenía.`,
    },
    { t: 'datos', filas: [...filasDelIndicador(d.indicador, d.anio), { rotulo: 'Avance reportado', valor: avanceTexto(d.valor, d.meta) }] },
  ]
  if (d.motivo) bloques.push({ t: 'cita', rotulo: 'Por qué se restauró', texto: recortar(d.motivo, 600) })
  return armarCorreo({
    asunto: asuntoDe('Restauraron tu reporte', d.indicador, d.anio),
    resumen: 'Vuelve a verse en el indicador como estaba antes de anularse.',
    estado: 'restaurado',
    titulo: `Restauraron tu reporte de ${d.anio}`,
    bloques,
    boton: { href: d.enlace, texto: 'Ver el indicador' },
    pie: { referencia: pie(d.reporteId, d.ocurridoEn), motivo: motivoPie(d.indicador, d.anio) },
    vistaPrevia: d.vistaPrevia,
  })
}

// ─── Comentario de Control Interno ───────────────────────────────────────────

export interface DatosComentarioControlInterno extends Comun {
  comentarioId: string
  ocurridoEn: string
  indicador: IndicadorDeCorreo
  /** El año del reporte comentado, si el comentario fue sobre un reporte. */
  anio: number | null
  /** Quién comentó (nombre completo). */
  autor: string
  texto: string
  /** Por qué le llega: lleva el indicador a su cargo, o es de su secretaría. */
  como: 'responsable' | 'secretaria'
}

export function correoComentarioControlInterno(d: DatosComentarioControlInterno): CorreoListo {
  const autor = nombreLegible(d.autor)
  const nombre = primerNombre(d.destinatario)
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: d.como === 'responsable'
        ? `${nombre}, Control Interno comentó en un indicador que tienes a tu cargo.`
        : `${nombre}, Control Interno comentó en un indicador de ${d.indicador.dependencia}.`,
    },
    {
      t: 'datos',
      filas: [
        { rotulo: 'Indicador', valor: d.indicador.nombre, nota: d.indicador.codigo },
        { rotulo: 'Secretaría', valor: d.indicador.dependencia },
        ...(d.anio !== null ? [{ rotulo: 'Sobre el reporte de', valor: String(d.anio) }] : []),
        { rotulo: 'Comentó', valor: autor },
      ],
    },
    { t: 'cita', rotulo: `Comentario de ${autor}`, texto: recortar(d.texto, 800) },
    {
      t: 'pasos',
      rotulo: 'Cómo responder',
      items: [
        'Abre el indicador: el comentario está al final de su ficha.',
        d.como === 'responsable'
          ? 'Responde con otro comentario, o ajusta tu reporte si hace falta.'
          : 'Si requiere que alguien corrija o aclare, avísale a quien lo reporta; el comentario por sí solo no cambia el reporte.',
      ],
    },
  ]
  return armarCorreo({
    asunto: `Control Interno comentó: ${recortar(d.indicador.nombre, 58)}`,
    resumen: recortar(d.texto, 100),
    estado: 'comentario',
    titulo: 'Control Interno dejó un comentario',
    bloques,
    boton: { href: d.enlace, texto: 'Ver y responder' },
    pie: {
      referencia: pie(d.comentarioId, d.ocurridoEn),
      motivo: d.como === 'responsable' ? `porque llevas a tu cargo el indicador ${d.indicador.codigo}.` : `porque el indicador ${d.indicador.codigo} es de tu secretaría.`,
    },
    vistaPrevia: d.vistaPrevia,
  })
}

// ─── Reportó una persona de apoyo: copia al responsable ──────────────────────

export interface DatosReporteDeApoyo extends Comun {
  reporteId: string
  enviadoEn: string
  indicador: IndicadorDeCorreo
  anio: number
  valor: number
  meta: number | null
  /** La persona de apoyo que reportó (nombre completo). */
  quien: string
  texto: string
  archivos: number
  esCorreccion: boolean
}

export function correoReporteDeApoyo(d: DatosReporteDeApoyo): CorreoListo {
  const quien = nombreLegible(d.quien)
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, ${quien}, que apoya el indicador que tienes a tu cargo, ${d.esCorreccion ? 'corrigió su reporte' : 'envió un reporte'} de ${d.anio}. Te escribimos para que lo sepas: queda pendiente de validación y no tienes que hacer nada.`,
    },
    {
      t: 'datos',
      filas: [
        ...filasDelIndicador(d.indicador, d.anio),
        { rotulo: 'Avance reportado', valor: avanceTexto(d.valor, d.meta) },
        { rotulo: 'Evidencia', valor: cuantos(d.archivos, 'archivo', 'archivos') },
      ],
    },
    { t: 'cita', rotulo: `Lo que reportó ${primerNombre(d.quien)}`, texto: recortar(d.texto, 400) },
    {
      t: 'pasos',
      rotulo: 'Qué sigue',
      items: [
        `${d.indicador.dependencia} revisa el reporte y lo aprueba o lo devuelve.`,
        'Sigues siendo la persona responsable del indicador: puedes ver el reporte y comentarlo en su ficha.',
      ],
    },
  ]
  return armarCorreo({
    asunto: asuntoDe(`${primerNombre(d.quien)} reportó en tu indicador`, d.indicador, d.anio),
    resumen: `${quien} (apoyo) · Avance ${avanceTexto(d.valor, d.meta)} · espera validación. No tienes que hacer nada.`,
    estado: 'sin_validar',
    titulo: `${quien} reportó en tu indicador`,
    bloques,
    boton: { href: d.enlace, texto: 'Ver el reporte' },
    pie: { referencia: pie(d.reporteId, d.enviadoEn), motivo: `porque eres responsable del indicador ${d.indicador.codigo} y una persona de apoyo reportó en él.` },
    vistaPrevia: d.vistaPrevia,
  })
}
