/**
 * Los RESÚMENES por correo del módulo Plan de Desarrollo: el mensual para cada secretaría y el semanal para el administrador.
 *
 * Funciones PURAS (como `plantillas.ts`): reciben cifras ya calculadas y devuelven asunto, HTML y texto.
 *
 * ── Para qué sirven, y por qué así ───────────────────────────────────────
 *
 *   · Los otros correos hablan de UN reporte o de UN cambio y salen cuando pasa. Estos hablan del CONJUNTO y salen en
 *     fecha fija, así que solo valen si dicen lo que hay que hacer: el mensual de la secretaría es «tienes N reportes por
 *     validar», con el más antiguo primero; el semanal del administrador es qué se movió y qué necesita atención.
 *   · Solo se envían si hay algo que decir: la secretaría sin reportes por validar no recibe nada ese mes.
 *   · Las cifras son las del tablero (misma definición), nunca otras: lo que el correo cuenta, la pantalla lo cuenta igual.
 *   · NO se publican nombres de una secretaría en el correo de otra. El del administrador sí trae nombres de personas
 *     sin acceso, porque es quien las habilita.
 */

import { armarCorreo, type Bloque, type CorreoListo } from './envoltura'
import { cuantos, primerNombre, recortar } from './formato'
import type { Comun, IndicadorDeCorreo } from './plantillas'

/** Cuántos reportes se listan antes de «y N más»: el resumen no puede ser un listado. */
export const MAX_PENDIENTES_EN_RESUMEN = 10

const dias = (n: number) => `${n.toLocaleString('es-CO')} ${n === 1 ? 'día' : 'días'}`

// ─── Mensual, a cada secretaría ──────────────────────────────────────────────

export interface PendienteDeValidar {
  indicador: IndicadorDeCorreo
  anio: number
  /** Quién reportó (nombre completo). */
  autor: string
  /** Cuántos días lleva esperando. */
  dias: number
}

export interface DatosResumenMensual extends Comun {
  /** «octubre de 2026». */
  mes: string
  dependencia: string
  /** Cuántos reportes esperan su validación hoy. */
  total: number
  /** Del más antiguo al más reciente (puede traer menos que `total`: se recorta). */
  pendientes: PendienteDeValidar[]
  /** El año que se mira para «cómo va» (el año en curso). */
  anio: number
  /** Cómo va la secretaría en ese año, con las definiciones del tablero. */
  estado: { aprobados: number; sinValidar: number; devueltos: number; faltanReportar: number; sinResponsable: number }
  /** Desde dónde se ven los pendientes. */
  enlace: string
}

export function correoResumenMensual(d: DatosResumenMensual): CorreoListo {
  const masAntiguo = d.pendientes[0]?.dias ?? 0
  const visibles = d.pendientes.slice(0, MAX_PENDIENTES_EN_RESUMEN)
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${primerNombre(d.destinatario)}, en ${d.dependencia} ${cuantos(d.total, 'reporte espera', 'reportes esperan')} tu validación${masAntiguo > 0 ? `; el más antiguo lleva ${dias(masAntiguo)}` : ''}. Mientras no se validen, no cuentan en el cumplimiento del plan.`,
    },
    {
      t: 'lista',
      rotulo: 'Del más antiguo al más reciente',
      items: visibles.map(p => ({
        titulo: recortar(p.indicador.nombre, 90),
        detalle: `${p.indicador.codigo} · ${p.anio} · reportó ${nombreCorto(p.autor)} · hace ${dias(p.dias)}`,
      })),
      mas: d.total - visibles.length > 0 ? d.total - visibles.length : undefined,
    },
    {
      t: 'datos',
      filas: [
        { rotulo: `Cómo va ${d.anio}`, valor: `${d.estado.aprobados.toLocaleString('es-CO')} aprobados`, nota: 'cuentan en el cumplimiento' },
        { rotulo: 'Sin validar', valor: d.estado.sinValidar.toLocaleString('es-CO') },
        { rotulo: 'Devueltos', valor: d.estado.devueltos.toLocaleString('es-CO'), nota: 'esperan la corrección de quien reportó' },
        { rotulo: 'Faltan por reportar', valor: d.estado.faltanReportar.toLocaleString('es-CO') },
        ...(d.estado.sinResponsable > 0 ? [{ rotulo: 'Sin responsable', valor: d.estado.sinResponsable.toLocaleString('es-CO'), nota: 'nadie los lleva todavía' }] : []),
      ],
    },
    {
      t: 'pasos',
      rotulo: 'Cómo validar',
      items: [
        'Abre la lista de indicadores «Sin validar» y entra a cada uno.',
        'Revisa la evidencia: si está bien, apruébalo; si falta algo, devuélvelo diciendo qué.',
      ],
    },
  ]
  return armarCorreo({
    asunto: `${d.total === 1 ? 'Tienes 1 reporte por validar' : `Tienes ${d.total.toLocaleString('es-CO')} reportes por validar`} · ${d.mes}`,
    resumen: `${d.dependencia} · ${masAntiguo > 0 ? `el más antiguo lleva ${dias(masAntiguo)}` : 'resumen del mes'}`,
    estado: 'resumen',
    titulo: `${d.total === 1 ? 'Tienes 1 reporte' : `Tienes ${d.total.toLocaleString('es-CO')} reportes`} esperando tu validación`,
    bloques,
    boton: { href: d.enlace, texto: 'Validar ahora' },
    pie: { referencia: `Resumen mensual · ${d.mes}`, motivo: `porque validas los reportes de ${d.dependencia}. Te lo enviamos una vez al mes, y solo si hay reportes esperando.` },
    vistaPrevia: d.vistaPrevia,
  })
}

/** «Sara Sánchez Vélez» → «Sara Sánchez»: en una línea de lista basta el primer nombre y el primer apellido. */
function nombreCorto(completo: string): string {
  const p = completo.trim().split(/\s+/).filter(Boolean)
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase('es') + s.slice(1).toLocaleLowerCase('es')
  if (p.length <= 2) return p.map(cap).join(' ')
  // Con cuatro palabras (dos nombres y dos apellidos) el primer apellido es la tercera; con tres, la segunda.
  return `${cap(p[0])} ${cap(p.length >= 4 ? p[2] : p[1])}`
}

// ─── Semanal, al administrador ───────────────────────────────────────────────

export interface DatosResumenSemanal extends Comun {
  /** «del 12 al 18 de octubre». */
  rango: string
  /** Lo que pasó en la semana. */
  semana: { reportados: number; aprobados: number; devueltos: number; anulados: number }
  /** Lo que hay hoy. */
  hoy: { porValidar: number; porValidarMasDe30Dias: number; sinResponsable: number }
  /** Personas con indicadores asignados y sin acceso al módulo (no pueden reportar). */
  sinAcceso: { total: number; nombres: string[] }
  /** Por secretaría: cuántos esperan validación (solo las que tienen alguno). */
  porSecretaria: { nombre: string; porValidar: number; masAntiguoDias: number }[]
}

export function correoResumenSemanal(d: DatosResumenSemanal): CorreoListo {
  const s = d.semana
  const hayMovimiento = s.reportados + s.aprobados + s.devueltos + s.anulados > 0
  // Una semana sin movimiento no lleva una tabla de ceros: se dice en una frase. Entre las dos tablas va una frase de enlace
  // (dos tablas seguidas se leen como una sola con una fila vacía).
  const bloques: Bloque[] = hayMovimiento
    ? [
        { t: 'parrafo', texto: `Esto pasó en el Plan de Desarrollo ${d.rango}.` },
        {
          t: 'datos',
          filas: [
            { rotulo: 'Reportes enviados', valor: s.reportados.toLocaleString('es-CO') },
            { rotulo: 'Aprobados', valor: s.aprobados.toLocaleString('es-CO') },
            { rotulo: 'Devueltos', valor: s.devueltos.toLocaleString('es-CO') },
            ...(s.anulados > 0 ? [{ rotulo: 'Anulados', valor: s.anulados.toLocaleString('es-CO') }] : []),
          ],
        },
        { t: 'parrafo', texto: 'Y esto es lo que necesita atención hoy.' },
      ]
    : [{ t: 'parrafo', texto: `No hubo reportes ni validaciones ${d.rango}. Esto es lo que necesita atención hoy.` }]
  bloques.push({
    t: 'datos',
    filas: [
      {
        rotulo: 'Esperan validación',
        valor: d.hoy.porValidar.toLocaleString('es-CO'),
        nota: d.hoy.porValidarMasDe30Dias > 0 ? `${d.hoy.porValidarMasDe30Dias.toLocaleString('es-CO')} llevan más de 30 días` : undefined,
      },
      { rotulo: 'Sin responsable', valor: d.hoy.sinResponsable.toLocaleString('es-CO'), nota: d.hoy.sinResponsable > 0 ? 'indicadores que nadie lleva todavía' : undefined },
      {
        rotulo: 'Sin acceso',
        valor: d.sinAcceso.total.toLocaleString('es-CO'),
        nota: d.sinAcceso.total > 0 ? 'personas con indicadores que no pueden entrar al módulo' : undefined,
      },
    ],
  })
  if (d.porSecretaria.length > 0) {
    bloques.push({
      t: 'lista',
      rotulo: 'Esperan validación, por secretaría',
      items: d.porSecretaria.map(x => ({ titulo: x.nombre, detalle: `${cuantos(x.porValidar, 'reporte', 'reportes')} · el más antiguo, ${dias(x.masAntiguoDias)}` })),
    })
  }
  if (d.sinAcceso.nombres.length > 0) {
    bloques.push({
      t: 'lista',
      rotulo: 'Sin acceso al módulo',
      items: d.sinAcceso.nombres.map(n => ({ titulo: n })),
      mas: d.sinAcceso.total - d.sinAcceso.nombres.length > 0 ? d.sinAcceso.total - d.sinAcceso.nombres.length : undefined,
    })
  }
  return armarCorreo({
    asunto: `Resumen semanal del Plan de Desarrollo · ${d.rango}`,
    resumen: `${cuantos(s.reportados, 'reporte', 'reportes')} · ${d.hoy.porValidar.toLocaleString('es-CO')} esperan validación · ${cuantos(d.sinAcceso.total, 'persona', 'personas')} sin acceso`,
    estado: 'resumen',
    titulo: 'Así va el Plan de Desarrollo',
    bloques,
    boton: { href: d.enlace, texto: 'Abrir el módulo' },
    pie: { referencia: `Resumen semanal · ${d.rango}`, motivo: 'porque administras el módulo del Plan de Desarrollo. Te lo enviamos cada lunes.' },
    vistaPrevia: d.vistaPrevia,
  })
}
