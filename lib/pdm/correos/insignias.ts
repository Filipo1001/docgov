/**
 * La insignia con que se felicita al aprobarse un reporte.
 *
 * ── Qué es y qué no es ───────────────────────────────────────────────────
 *
 * Un reconocimiento, no un juego: no hay puntos, niveles ni ranking. Cada insignia dice UNA cosa verdadera sobre ese
 * reporte, calculada con datos que la base ya tiene (nada se guarda aparte, nada se inventa):
 *
 *   · Meta cumplida     el avance aprobado alcanzó la meta del año (la misma regla que el semáforo del módulo:
 *                       avance ÷ meta ≥ 1; sigue siendo provisional como ella).
 *   · Primer aprobado   es el primer reporte aprobado de esa persona en la plataforma.
 *   · A la primera      aprobado sin una sola devolución en ese indicador y año.
 *   · Constancia        se devolvió, la persona lo corrigió y quedó aprobado.
 *   · Avance validado   la base: un reporte aprobado más.
 *
 * Un reporte puede merecer varias; se entrega UNA, la más rara primero. Elegir una evita la lista de trofeos y deja
 * cada insignia con su momento.
 *
 * Pura y sin `server-only`: la prueban los tests con casos dichos en palabras de la Alcaldía.
 */

export type ClaveInsignia = 'meta_cumplida' | 'primer_aprobado' | 'a_la_primera' | 'constancia' | 'avance_validado'

export interface Insignia {
  clave: ClaveInsignia
  nombre: string
  /** Una frase, verdadera para este reporte, que va debajo del sello. */
  frase: string
  /** Pinta el sello en la tinta de la marca en vez del verde de «aprobado»: lo reservado a lo más difícil. */
  destacada: boolean
}

export interface HechosDeAprobacion {
  anio: number
  /** El avance que se aprobó. */
  valor: number | null
  /** La meta de ese año; `null` si el plan no trae una. */
  meta: number | null
  /** ¿Es el primer reporte aprobado de esta persona en toda la plataforma? */
  primerAprobadoDeLaPersona: boolean
  /** Cuántas veces se devolvió el reporte antes de aprobarse (en ese indicador y año). */
  devolucionesPrevias: number
}

/** ¿El avance alcanzó la meta? Misma cuenta que `estadoDe` en `plan.ts`: sin meta no hay cumplimiento que celebrar. */
export const alcanzoLaMeta = (valor: number | null, meta: number | null): boolean =>
  valor !== null && meta !== null && meta > 0 && valor / meta >= 1

export function elegirInsignia(h: HechosDeAprobacion): Insignia {
  if (alcanzoLaMeta(h.valor, h.meta)) {
    return { clave: 'meta_cumplida', nombre: 'Meta cumplida', frase: `El indicador alcanzó la meta de ${h.anio}.`, destacada: true }
  }
  if (h.primerAprobadoDeLaPersona) {
    return { clave: 'primer_aprobado', nombre: 'Primer aprobado', frase: 'Es tu primer reporte aprobado en la plataforma.', destacada: false }
  }
  if (h.devolucionesPrevias === 0) {
    return { clave: 'a_la_primera', nombre: 'A la primera', frase: 'Aprobado sin una sola devolución.', destacada: false }
  }
  return { clave: 'constancia', nombre: 'Constancia', frase: 'Lo corregiste y quedó aprobado.', destacada: false }
}

/** La insignia de base: cuando no se pudo saber nada más (la lectura de los hechos falló), se felicita sin afirmar de más. */
export const INSIGNIA_BASE: Insignia = {
  clave: 'avance_validado', nombre: 'Avance validado', frase: 'Tu avance ya cuenta en el cumplimiento del plan.', destacada: false,
}
