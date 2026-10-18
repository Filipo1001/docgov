/**
 * El correo de ACCESO al módulo Plan de Desarrollo: cuando alguien queda habilitado, cuando cambia su nivel y cuando se
 * le retira.
 *
 * Funciones PURAS (como `plantillas.ts`): reciben los hechos ya leídos y devuelven asunto, HTML y texto.
 *
 * ── Qué se cuida ─────────────────────────────────────────────────────────
 *
 *   · Es lo primero que muchas personas saben del módulo: tiene que bastar para entender QUÉ es, QUÉ puede hacer con su
 *     nivel y QUÉ viene ahora, sin haber leído nada más. Se dice con las palabras de la pantalla.
 *   · Se habla de lo que SÍ tiene hoy: si ya le asignaron indicadores, se le nombran; si no, se le dice que se le
 *     avisará aparte (el aviso de asignación y el de grupo son otros correos, no se mezclan aquí).
 *   · El motivo con que se habilitó es del administrador y no se repite a la persona.
 *   · Quitar el acceso se dice con calma y sin acusar: lo reportado queda en el historial.
 */

import { ETIQUETA_NIVEL, type NivelHabilitable } from '../niveles'
import { armarCorreo, type Bloque, type CorreoListo } from './envoltura'
import { cuantos, nombreLegible, primerNombre, recortar } from './formato'
import { pie, quienReparte, type Comun } from './plantillas'

export type CambioDeAcceso = 'habilitado' | 'cambiado' | 'quitado'

export interface DatosAcceso extends Comun {
  /** El lote del cambio: de ahí sale la referencia. */
  lote: string
  ocurridoEn: string
  /** Quién dio, cambió o quitó el acceso (nombre completo). */
  actor: string
  cambio: CambioDeAcceso
  /** El nivel que tiene ahora (`null` si se le quitó). */
  nivel: NivelHabilitable | null
  /** El que tenía antes, si lo tenía. */
  nivelAntes: NivelHabilitable | null
  /** Su secretaría, si se sabe. */
  dependencia: string | null
  /** Indicadores que YA tiene a su cargo (hasta 5, los más recientes). */
  indicadores: { codigo: string; nombre: string; papel: 'principal' | 'apoyo' }[]
  /** Cuántos indicadores tiene a su cargo en total. */
  totalIndicadores: number
  /** Solo para una secretaría: cuántos indicadores tiene su dependencia. */
  indicadoresDeLaSecretaria: number | null
}

/** Cuántos indicadores se nombran en el correo de bienvenida antes de «y N más». */
export const MAX_INDICADORES_EN_BIENVENIDA = 5

const ROTULO_DE_NIVEL: Record<NivelHabilitable, string> = {
  responsable: 'Responsable de indicadores',
  coordinador: 'Secretaría',
  consulta: 'Control Interno (consulta)',
}

/** Lo que puede hacer, dicho en una frase corta y en segunda persona. */
const QUE_PUEDES: Record<NivelHabilitable, string> = {
  responsable: 'Reportas el avance de los indicadores que te asignen, con su evidencia, y ves qué responde la secretaría.',
  coordinador: 'Validas lo que reportan en tu secretaría, repartes sus indicadores, creas grupos y habilitas a tu gente.',
  consulta: 'Consultas todo el plan y dejas comentarios en los indicadores. No reportas ni cambias nada.',
}

/** Los pasos de arranque de cada nivel: lo primero que hace quien entra por primera vez. */
const PRIMEROS_PASOS: Record<NivelHabilitable, string[]> = {
  responsable: [
    'Entra al módulo: en «Mi trabajo» ves lo que tienes a tu cargo y lo que te falta reportar.',
    'Abre un indicador y reporta el avance del año con al menos un archivo de evidencia.',
    'La secretaría lo valida. Solo lo aprobado cuenta en el cumplimiento del plan.',
  ],
  coordinador: [
    'Entra al módulo: en el resumen ves cómo va tu secretaría y qué reportes esperan tu validación.',
    'En «Responsables» repartes los indicadores y habilitas a las personas de tu equipo.',
    'Valida cada reporte: lo apruebas, o lo devuelves diciendo qué falta.',
  ],
  consulta: [
    'Entra al módulo: en el resumen ves cómo va el plan completo, por secretaría y por año.',
    'Abre un indicador para ver sus reportes, sus evidencias y quién los validó.',
    'Si ves algo que aclarar, déjalo como comentario: le llega a quien lo lleva y a su secretaría.',
  ],
}

const nombreDeNivel = (n: NivelHabilitable | null) => (n ? ROTULO_DE_NIVEL[n] : '—')

/** Los indicadores que ya tiene, como bloque (o nada si no tiene ninguno). */
function bloqueDeIndicadores(d: DatosAcceso): Bloque | null {
  if (d.totalIndicadores <= 0 || d.indicadores.length === 0) return null
  const visibles = d.indicadores.slice(0, MAX_INDICADORES_EN_BIENVENIDA)
  return {
    t: 'lista',
    rotulo: `Ya tienes ${cuantos(d.totalIndicadores, 'indicador', 'indicadores')} a tu cargo`,
    items: visibles.map(i => ({ titulo: recortar(i.nombre, 90), detalle: `${i.codigo} · ${i.papel === 'principal' ? 'Responsable' : 'Apoyo'}` })),
    mas: d.totalIndicadores - visibles.length || undefined,
  }
}

export function correoAcceso(d: DatosAcceso): CorreoListo {
  // «el administrador» en una frase; una persona, por su nombre completo.
  const quien = quienReparte(d.actor)
  const nombre = primerNombre(d.destinatario)
  const referencia = pie(d.lote, d.ocurridoEn)

  // ── Se retiró el acceso ───────────────────────────────────────────────
  if (d.cambio === 'quitado') {
    return armarCorreo({
      asunto: 'Ya no tienes acceso al módulo del Plan de Desarrollo',
      resumen: 'Lo que reportaste antes se conserva en el historial de cada indicador.',
      estado: 'acceso',
      titulo: 'Ya no tienes acceso al módulo',
      bloques: [
        { t: 'parrafo', texto: `${nombre}, ${quien} retiró tu acceso al módulo del Plan de Desarrollo «Por Amor a Fredonia». Ya no verás sus pantallas.` },
        { t: 'datos', filas: [{ rotulo: 'Tu nivel hasta hoy', valor: nombreDeNivel(d.nivelAntes) }, ...(d.dependencia ? [{ rotulo: 'Secretaría', valor: d.dependencia }] : [])] },
        { t: 'parrafo', texto: 'Lo que reportaste, validaste o comentaste queda guardado en el historial de cada indicador: nadie lo borra. Si crees que es un error, habla con tu secretaría.' },
      ],
      boton: { href: d.enlace, texto: 'Ir a Contratista Digital' },
      pie: { referencia, motivo: 'porque se retiró tu acceso al módulo del Plan de Desarrollo.' },
      vistaPrevia: d.vistaPrevia,
    })
  }

  const nivel = d.nivel
  if (!nivel) throw new Error('correoAcceso: falta el nivel de quien se habilita')

  // ── Cambió el nivel ───────────────────────────────────────────────────
  if (d.cambio === 'cambiado') {
    return armarCorreo({
      asunto: `Cambió tu acceso al Plan de Desarrollo: ahora eres ${nombreDeNivel(nivel).toLowerCase()}`,
      resumen: `${nombreDeNivel(d.nivelAntes)} → ${nombreDeNivel(nivel)}. ${QUE_PUEDES[nivel]}`,
      estado: 'acceso',
      titulo: 'Cambió tu nivel de acceso',
      bloques: [
        { t: 'parrafo', texto: `${nombre}, ${quien} cambió tu nivel en el módulo del Plan de Desarrollo.` },
        {
          t: 'datos',
          filas: [
            { rotulo: 'Antes', valor: nombreDeNivel(d.nivelAntes) },
            { rotulo: 'Ahora', valor: nombreDeNivel(nivel) },
            ...(d.dependencia ? [{ rotulo: 'Secretaría', valor: d.dependencia }] : []),
          ],
        },
        { t: 'parrafo', texto: `Con este nivel: ${QUE_PUEDES[nivel]}` },
        ...(bloqueDeIndicadores(d) ? [bloqueDeIndicadores(d)!] : []),
      ],
      boton: { href: d.enlace, texto: 'Entrar al módulo' },
      pie: { referencia, motivo: 'porque cambió tu nivel de acceso al módulo del Plan de Desarrollo.' },
      vistaPrevia: d.vistaPrevia,
    })
  }

  // ── Bienvenida ────────────────────────────────────────────────────────
  const bloques: Bloque[] = [
    {
      t: 'parrafo',
      texto: `${nombre}, ${quien} te habilitó en el módulo del Plan de Desarrollo «Por Amor a Fredonia». Es donde el municipio sigue el avance de sus indicadores: cada uno se reporta por año, con evidencia, y lo valida la secretaría.`,
    },
    {
      t: 'datos',
      filas: [
        { rotulo: 'Tu nivel', valor: nombreDeNivel(nivel) },
        ...(d.dependencia ? [{ rotulo: 'Secretaría', valor: d.dependencia }] : []),
        { rotulo: 'Habilitó', valor: /^administrador(a)?$/i.test(d.actor.trim()) ? 'El administrador del módulo' : nombreLegible(d.actor) },
      ],
    },
    { t: 'parrafo', texto: QUE_PUEDES[nivel] },
  ]

  const indicadores = bloqueDeIndicadores(d)
  if (nivel === 'responsable') {
    if (indicadores) {
      bloques.push(indicadores)
    } else {
      bloques.push({
        t: 'parrafo',
        texto: 'Todavía no tienes indicadores a tu cargo. Cuando te asignen uno, o te agreguen a un grupo, te escribimos por este mismo medio: no tienes que hacer nada ahora.',
      })
    }
  } else if (nivel === 'coordinador' && d.indicadoresDeLaSecretaria !== null && d.indicadoresDeLaSecretaria > 0) {
    bloques.push({
      t: 'datos',
      filas: [{ rotulo: 'Indicadores de tu secretaría', valor: d.indicadoresDeLaSecretaria.toLocaleString('es-CO'), nota: 'los ves todos y repartes entre tu equipo' }],
    })
  }
  bloques.push({ t: 'pasos', rotulo: 'Cómo empezar', items: PRIMEROS_PASOS[nivel] })

  return armarCorreo({
    asunto: nivel === 'responsable' ? 'Te habilitaron en el módulo del Plan de Desarrollo' : `Ya tienes acceso al Plan de Desarrollo como ${nombreDeNivel(nivel).toLowerCase()}`,
    resumen: indicadores && nivel === 'responsable'
      ? `Ya tienes ${cuantos(d.totalIndicadores, 'indicador', 'indicadores')} a tu cargo. Entra y revisa qué te toca.`
      : `${ETIQUETA_NIVEL[nivel]}: ${QUE_PUEDES[nivel]}`,
    estado: 'acceso',
    titulo: nivel === 'responsable' ? 'Ya puedes usar el módulo del Plan de Desarrollo' : `Ya tienes acceso como ${nombreDeNivel(nivel).toLowerCase()}`,
    bloques,
    boton: { href: d.enlace, texto: 'Entrar al módulo' },
    pie: { referencia, motivo: 'porque te habilitaron en el módulo del Plan de Desarrollo.' },
    vistaPrevia: d.vistaPrevia,
  })
}
