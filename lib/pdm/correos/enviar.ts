import 'server-only'
import { enviarCorreo } from '@/lib/resend'
import { entornoPermiteModulo } from '../entorno'
import {
  completarContextoDeReporte, insigniaDeAprobacion, leerBaseDeReporte, leerContextoDeLote, leerLoteDeGrupo, leerValidacion,
  type Persona,
} from './datos'
import { enlaceDeIndicador, enlaceDeMiTrabajo } from './enlaces'
import type { CorreoListo } from './envoltura'
import { esCorreoEntregable, puedeRecibirCorreoPdm } from './politica'
import { correoAsignacion, correoReporteAprobado, correoReporteDevuelto, correoReporteEnviado } from './plantillas'
import { referenciaDe } from './formato'

/**
 * Los avisos por correo del módulo Plan de Desarrollo: el único sitio que los decide y los manda.
 *
 * ── Reglas que no se saltan ──────────────────────────────────────────────
 *
 *   1. NUNCA rompen la acción. Se llaman desde `after()`, cuando la respuesta ya viajó: lo que haya pasado en la base
 *      ya pasó. Un error aquí se registra y muere aquí (nada se lanza hacia arriba).
 *   2. Solo escriben a quien la política permite (`politica.ts`) Y tiene una dirección real. Se comprueba antes de leer
 *      datos de nadie y otra vez al enviar.
 *   3. Cierran por fuera: fuera de vista previa/desarrollo no hacen nada, igual que el resto del módulo.
 *   4. No ensucian el registro: se escribe el tipo, la referencia y el resultado; jamás una dirección de correo ni un
 *      nombre.
 *   5. Un correo por persona y por hecho: un reparto de 40 indicadores es UN correo con lista, no 40.
 */

function registrar(linea: string, detalle: Record<string, string | number | boolean>) {
  console.info(`[pdm/correos] ${linea} ${Object.entries(detalle).map(([k, v]) => `${k}=${v}`).join(' ')}`)
}

const habilitado = () => entornoPermiteModulo(process.env.VERCEL_ENV, process.env.NODE_ENV)

/** `true` salvo en producción: el pie de cada correo avisa de que el módulo está en vista previa. */
const vistaPrevia = () => process.env.VERCEL_ENV !== 'production'

async function entregar(tipo: string, referencia: string, para: Persona, correo: CorreoListo): Promise<void> {
  // Doble candado: aunque un llamador futuro se olvide de filtrar, aquí no sale nada a quien no corresponde.
  if (!puedeRecibirCorreoPdm(para.id)) { registrar('omitido', { tipo, ref: referenciaDe(referencia), motivo: 'politica' }); return }
  if (!esCorreoEntregable(para.correo)) { registrar('omitido', { tipo, ref: referenciaDe(referencia), motivo: 'sin-direccion' }); return }
  const r = await enviarCorreo({ to: para.correo, subject: correo.asunto, html: correo.html, text: correo.texto })
  if (r.ok) registrar('enviado', { tipo, ref: referenciaDe(referencia), resend: r.id ?? '?' })
  else registrar('fallido', { tipo, ref: referenciaDe(referencia), error: r.error ?? 'desconocido' })
}

/** Cada aviso corre aislado: lo que falle se registra con su tipo y no se propaga. */
async function aislado(tipo: string, f: () => Promise<void>): Promise<void> {
  try {
    if (!habilitado()) return
    await f()
  } catch (e) {
    console.error(`[pdm/correos] ${tipo} no se pudo preparar:`, e instanceof Error ? e.message : e)
  }
}

// ─── Reportes ────────────────────────────────────────────────────────────────

/** Se envió un reporte (o una corrección): se le confirma a quien lo envió. */
export function avisarReporteEnviado(a: { reporteId: string; origen: string }): Promise<void> {
  return aislado('reporte-enviado', async () => {
    const base = await leerBaseDeReporte(a.reporteId)
    if (!base) return
    if (!puedeRecibirCorreoPdm(base.autorId)) { registrar('omitido', { tipo: 'reporte-enviado', ref: referenciaDe(a.reporteId), motivo: 'politica' }); return }
    const ctx = await completarContextoDeReporte(base)
    if (ctx.archivos.length === 0) return // un reporte sin evidencia no existe; si pasara, no hay nada honesto que decir
    const correo = correoReporteEnviado({
      destinatario: ctx.autor.nombre,
      enlace: enlaceDeIndicador(a.origen, ctx.indicador.fila, base.anio),
      vistaPrevia: vistaPrevia(),
      reporteId: base.id,
      enviadoEn: base.creadoEn,
      indicador: ctx.indicador,
      anio: base.anio,
      valor: base.valor,
      meta: ctx.meta,
      texto: base.texto,
      archivos: ctx.archivos,
      esCorreccion: base.corrigeA !== null,
      motivoCorreccion: base.motivoCorreccion,
    })
    await entregar('reporte-enviado', base.id, ctx.autor, correo)
  })
}

/** Se validó un reporte: se le dice a quien lo envió si lo aprobaron (con su insignia) o lo devolvieron (con qué corregir). */
export function avisarValidacion(a: { reporteId: string; cambio: 'aprobado' | 'devuelto'; origen: string }): Promise<void> {
  const tipo = a.cambio === 'aprobado' ? 'reporte-aprobado' : 'reporte-devuelto'
  return aislado(tipo, async () => {
    const base = await leerBaseDeReporte(a.reporteId)
    if (!base) return
    if (!puedeRecibirCorreoPdm(base.autorId)) { registrar('omitido', { tipo, ref: referenciaDe(a.reporteId), motivo: 'politica' }); return }
    const ctx = await completarContextoDeReporte(base)
    const validacion = await leerValidacion(base.id, a.cambio, ctx.archivos)
    if (!validacion) return
    const comun = {
      destinatario: ctx.autor.nombre,
      enlace: enlaceDeIndicador(a.origen, ctx.indicador.fila, base.anio),
      vistaPrevia: vistaPrevia(),
      reporteId: base.id,
      indicador: ctx.indicador,
      anio: base.anio,
      valor: base.valor,
      meta: ctx.meta,
      validador: validacion.validador,
      comentario: validacion.comentario,
    }
    const correo = a.cambio === 'aprobado'
      ? correoReporteAprobado({ ...comun, aprobadoEn: validacion.creadaEn, insignia: await insigniaDeAprobacion(ctx) })
      : correoReporteDevuelto({
          ...comun, devueltoEn: validacion.creadaEn, observados: validacion.observados,
          sinObservacion: Math.max(0, ctx.archivos.length - validacion.observados.length),
        })
    await entregar(tipo, base.id, ctx.autor, correo)
  })
}

// ─── Reparto ─────────────────────────────────────────────────────────────────

/** Se repartieron indicadores (lote de la base): se le escribe a cada persona afectada, un correo por persona. */
export function avisarCambioDeReparto(a: { lote: string; origen: string }): Promise<void> {
  return aislado('reparto', async () => {
    const ctx = await leerContextoDeLote(a.lote)
    if (!ctx) return
    if (ctx.omitidas > 0) registrar('omitido', { tipo: 'reparto', ref: referenciaDe(a.lote), personas: ctx.omitidas, motivo: 'politica' })
    for (const aviso of ctx.avisos) {
      const unico = aviso.cambios.length === 1 ? aviso.cambios[0] : null
      const correo = correoAsignacion({
        destinatario: aviso.persona.nombre,
        enlace: unico ? enlaceDeIndicador(a.origen, unico.indicador.fila) : enlaceDeMiTrabajo(a.origen),
        vistaPrevia: vistaPrevia(),
        lote: a.lote,
        ocurridoEn: ctx.ocurridoEn,
        actor: ctx.actor,
        motivo: ctx.motivo,
        cambios: aviso.cambios,
      })
      // Un fallo con una persona no impide avisar a las demás.
      await entregar('reparto', a.lote, aviso.persona, correo).catch(e =>
        console.error('[pdm/correos] reparto: un envío falló:', e instanceof Error ? e.message : e))
    }
  })
}

/**
 * Se guardó un grupo: si el cambio de miembros arrastró asignaciones, es un reparto como cualquier otro.
 * `marca` es la de `marcaDeHistorial()` tomada antes de guardar; sin ella no se avisa.
 */
export function avisarCambioDeGrupo(a: { grupoId: string; actorId: string; marca: number | null; origen: string }): Promise<void> {
  return aislado('reparto-grupo', async () => {
    if (a.marca === null) return
    const lote = await leerLoteDeGrupo(a.grupoId, a.actorId, a.marca)
    if (lote) await avisarCambioDeReparto({ lote, origen: a.origen })
  })
}
