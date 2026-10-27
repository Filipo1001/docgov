/**
 * Las fechas de inicio y de fin del contrato en el acta de pago.
 *
 * El acta de pago imprime, bajo «No. CDP» y «No. CRP», cuándo empieza y cuándo termina el contrato. La fecha de fin es la del contrato
 * HOY: un otrosí de prórroga aplicado ya la movió (`aplicar_otrosi` actualiza `contratos.fecha_fin`), así que el acta dice la vigente.
 *
 * ── Lo ya emitido no cambia ──────────────────────────────────────────────
 *
 * Regla 3 de CLAUDE.md. Un acta de un periodo que ya estaba aprobado o radicado cuando se publicó este cambio salió sin esas dos filas
 * y así está en SECOP; más de la mitad de esos periodos no tiene su PDF en el caché, así que abrirlos los regeneraría con las filas
 * nuevas. Para que lo regenerado diga lo mismo que lo radicado, conservan su forma de entonces. Mismo criterio que
 * `reglaNuevaDelPlazo` (lib/plazo-contrato.ts): todo lo que se apruebe de aquí en adelante, y todo lo que todavía no está aprobado,
 * lleva las filas.
 */

/**
 * Desde cuándo el acta de pago lleva las fechas del contrato. Es el momento en que se publicó el cambio, con un margen sobre la subida
 * a `main` (lo que se apruebe mientras Vercel construye todavía lo emite el código viejo, y por eso cuenta como «ya emitido»: el margen
 * solo se equivoca hacia el lado seguro).
 *
 * PROVISIONAL: se fija al publicar. Mientras no se publique, ningún periodo aprobado la cumple.
 */
export const FECHAS_EN_ACTA_DESDE = '2099-01-01T00:00:00Z'

/**
 * ¿El acta de este periodo lleva las fechas del contrato?
 *
 *   · Un periodo que todavía no está aprobado ni radicado: SÍ (su acta se emite de aquí en adelante).
 *   · Uno aprobado o radicado DESPUÉS de publicar el cambio: SÍ.
 *   · Uno aprobado o radicado ANTES: NO. Los radicados que no tienen fecha de aprobación son anteriores a que existiera ese campo:
 *     también conservan su forma.
 */
export function actaConFechasDelContrato(
  periodo: { estado?: string | null; fecha_aprobacion?: string | null },
  desde: string = FECHAS_EN_ACTA_DESDE,
): boolean {
  if (periodo.estado !== 'aprobado' && periodo.estado !== 'radicado') return true
  if (!periodo.fecha_aprobacion) return false
  return new Date(periodo.fecha_aprobacion).getTime() >= new Date(desde).getTime()
}
