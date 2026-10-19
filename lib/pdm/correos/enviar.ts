import 'server-only'
import { enviarCorreo } from '@/lib/resend'
import { entornoPermiteModulo, produccionAbierta } from '../entorno'
import {
  completarContextoDeReporte, insigniaDeAprobacion, leerBaseDeReporte, leerContextoDeLote, leerLoteDeGrupo, leerValidacion,
  type EntradaAGrupo, type Persona,
} from './datos'
import {
  contarArchivos, leerAgregadosAlGrupo, leerContextoDeAcceso, leerContextoDeAnulacion, leerContextoDeComentario, leerResponsablesParaCopia, leerSiReabrio,
} from './datos-avisos'
import { leerPlanPdm } from '../datos'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { leerAdministradores, leerSecretarias, leerSemana, leerSinAcceso } from './datos-resumenes'
import { enlaceDeIndicador, enlaceDeMiTrabajo, enlaceDePorValidar } from './enlaces'
import type { CorreoListo } from './envoltura'
import { esCorreoEntregable, puedeRecibirCorreoPdm } from './politica'
import { correoAsignacion, correoReporteAprobado, correoReporteDevuelto, correoReporteEnviado } from './plantillas'
import { correoAcceso, type CambioDeAcceso } from './plantillas-acceso'
import {
  correoComentarioControlInterno, correoReporteAnulado, correoReporteDeApoyo, correoReporteReabierto, correoReporteRestaurado,
} from './plantillas-avisos'
import { referenciaDe } from './formato'
import { correoResumenMensual, correoResumenSemanal, MAX_PENDIENTES_EN_RESUMEN } from './plantillas-resumenes'
import {
  anioDelEnlace, esperandoPorSecretaria, estadoDeSecretaria, filaDeCorreo, mesDe, panoramaDeHoy, pendientesDeValidar, rangoDeSemana,
} from './resumenes-armar'

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

const habilitado = () => entornoPermiteModulo(process.env.VERCEL_ENV, process.env.NODE_ENV, process.env.PDM_PRODUCCION)

/** En producción abierta le escribe a quien corresponda; en vista previa (que comparte la base real), solo a la lista de prueba. */
const abierto = () => produccionAbierta(process.env.VERCEL_ENV, process.env.PDM_PRODUCCION)

/** `true` salvo en producción: el pie de cada correo avisa de que el módulo está en vista previa. */
const vistaPrevia = () => process.env.VERCEL_ENV !== 'production'

async function entregar(tipo: string, referencia: string, para: Persona, correo: CorreoListo): Promise<void> {
  // Doble candado: aunque un llamador futuro se olvide de filtrar, aquí no sale nada a quien no corresponde.
  if (!puedeRecibirCorreoPdm(para.id, abierto())) { registrar('omitido', { tipo, ref: referenciaDe(referencia), motivo: 'politica' }); return }
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
    if (!puedeRecibirCorreoPdm(base.autorId, abierto())) { registrar('omitido', { tipo: 'reporte-enviado', ref: referenciaDe(a.reporteId), motivo: 'politica' }); return }
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
    if (!puedeRecibirCorreoPdm(base.autorId, abierto())) { registrar('omitido', { tipo, ref: referenciaDe(a.reporteId), motivo: 'politica' }); return }
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
    // Devolver un reporte que estaba APROBADO es reabrirlo (lo hace el administrador): se dice así, con lo que cambia.
    const reabrio = a.cambio === 'devuelto' && await leerSiReabrio(base.id)
    const correo = a.cambio === 'aprobado'
      ? correoReporteAprobado({ ...comun, aprobadoEn: validacion.creadaEn, insignia: await insigniaDeAprobacion(ctx) })
      : reabrio
        ? correoReporteReabierto({
            destinatario: comun.destinatario, enlace: comun.enlace, vistaPrevia: comun.vistaPrevia, reporteId: base.id, ocurridoEn: validacion.creadaEn,
            indicador: ctx.indicador, anio: base.anio, valor: base.valor, meta: ctx.meta, actor: validacion.validador,
            comentario: validacion.comentario, observados: validacion.observados,
          })
        : correoReporteDevuelto({
            ...comun, devueltoEn: validacion.creadaEn, observados: validacion.observados,
            sinObservacion: Math.max(0, ctx.archivos.length - validacion.observados.length),
          })
    await entregar(reabrio ? 'reporte-reabierto' : tipo, base.id, ctx.autor, correo)
  })
}

// ─── Reparto ─────────────────────────────────────────────────────────────────

/** Se repartieron indicadores (lote de la base): se le escribe a cada persona afectada, un correo por persona. */
export function avisarCambioDeReparto(a: { lote: string; origen: string; entrada?: EntradaAGrupo | null }): Promise<void> {
  return aislado('reparto', async () => {
    const ctx = await leerContextoDeLote(a.lote, abierto(), a.entrada ?? null)
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
        grupo: aviso.grupo ?? null,
      })
      // Un fallo con una persona no impide avisar a las demás.
      await entregar(aviso.grupo?.motivo === 'agregado' ? 'grupo-agregado' : aviso.grupo ? 'grupo-indicadores' : 'reparto', a.lote, aviso.persona, correo).catch(e =>
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
    // Quien ENTRÓ al grupo recibe su aviso aunque el grupo no tenga indicadores, y UNO solo: el de grupo, que ya incluye los
    // indicadores que le llegaron con él (no se le manda además el de reparto).
    const [lote, entrada] = await Promise.all([
      leerLoteDeGrupo(a.grupoId, a.actorId, a.marca),
      leerAgregadosAlGrupo(a.grupoId, a.actorId, a.marca),
    ])
    if (!lote && !entrada) return
    await avisarCambioDeReparto({ lote: lote ?? a.grupoId, origen: a.origen, entrada })
  })
}

// ─── Acceso al módulo ────────────────────────────────────────────────────────

/**
 * Se habilitó a alguien, cambió su nivel o se le quitó el acceso: se le dice a ella o a él. `cambio` es lo que devolvió
 * la base; la bitácora de ese lote dice quién lo hizo y de qué nivel a cuál. Si no cambió nada (`ninguno`), no se avisa.
 */
export function avisarAcceso(a: { usuarioId: string; lote: string | null; cambio: CambioDeAcceso; origen: string }): Promise<void> {
  return aislado('acceso', async () => {
    const ref = referenciaDe(a.lote ?? a.usuarioId)
    if (!puedeRecibirCorreoPdm(a.usuarioId, abierto())) { registrar('omitido', { tipo: 'acceso', ref, motivo: 'politica' }); return }
    const ctx = await leerContextoDeAcceso(a.usuarioId, a.lote)
    if (!ctx) return
    const correo = correoAcceso({
      destinatario: ctx.persona.nombre,
      enlace: a.cambio === 'quitado' ? a.origen : enlaceDeMiTrabajo(a.origen),
      vistaPrevia: vistaPrevia(),
      lote: a.lote ?? a.usuarioId,
      ocurridoEn: ctx.ocurridoEn,
      actor: ctx.actor,
      cambio: a.cambio,
      nivel: ctx.nivel,
      nivelAntes: ctx.nivelAntes,
      dependencia: ctx.dependencia,
      indicadores: ctx.indicadores,
      totalIndicadores: ctx.totalIndicadores,
      indicadoresDeLaSecretaria: ctx.indicadoresDeLaSecretaria,
    })
    await entregar(`acceso-${a.cambio}`, a.lote ?? a.usuarioId, ctx.persona, correo)
  })
}

// ─── Anular y restaurar un reporte ───────────────────────────────────────────

/** El administrador anuló un reporte (o lo restauró): se le dice a quien lo reportó, con el motivo. */
export function avisarAnulacion(a: { lote: string; origen: string }): Promise<void> {
  return aislado('reporte-anulado', async () => {
    const ctx = await leerContextoDeAnulacion(a.lote, abierto())
    if (!ctx) return
    const tipo = ctx.accion === 'anular' ? 'reporte-anulado' : 'reporte-restaurado'
    if (ctx.omitidas > 0) registrar('omitido', { tipo, ref: referenciaDe(a.lote), personas: ctx.omitidas, motivo: 'politica' })
    for (const aviso of ctx.avisos) {
      const comun = {
        destinatario: aviso.persona.nombre, enlace: enlaceDeIndicador(a.origen, ctx.indicador.fila, ctx.anio), vistaPrevia: vistaPrevia(),
        reporteId: aviso.reporteId, ocurridoEn: ctx.ocurridoEn, indicador: ctx.indicador, anio: ctx.anio, valor: aviso.valor, meta: ctx.meta,
        actor: ctx.actor, motivo: ctx.motivo,
      }
      const correo = ctx.accion === 'anular' ? correoReporteAnulado(comun) : correoReporteRestaurado(comun)
      await entregar(tipo, aviso.reporteId, aviso.persona, correo).catch(e =>
        console.error(`[pdm/correos] ${tipo}: un envío falló:`, e instanceof Error ? e.message : e))
    }
  })
}

// ─── Comentario de Control Interno ───────────────────────────────────────────

/** Control Interno comentó un indicador: se le dice a quien lo lleva y a la secretaría dueña. Otros niveles no generan aviso. */
export function avisarComentario(a: { comentarioId: string; origen: string }): Promise<void> {
  return aislado('comentario-control-interno', async () => {
    const ctx = await leerContextoDeComentario(a.comentarioId, abierto())
    if (!ctx) return
    if (ctx.omitidas > 0) registrar('omitido', { tipo: 'comentario-control-interno', ref: referenciaDe(a.comentarioId), personas: ctx.omitidas, motivo: 'politica' })
    for (const d of ctx.destinatarios) {
      const correo = correoComentarioControlInterno({
        destinatario: d.persona.nombre, enlace: enlaceDeIndicador(a.origen, ctx.indicador.fila, ctx.anio ?? undefined), vistaPrevia: vistaPrevia(),
        comentarioId: ctx.comentarioId, ocurridoEn: ctx.ocurridoEn, indicador: ctx.indicador, anio: ctx.anio, autor: ctx.autor, texto: ctx.texto, como: d.como,
      })
      await entregar('comentario-control-interno', ctx.comentarioId, d.persona, correo).catch(e =>
        console.error('[pdm/correos] comentario-control-interno: un envío falló:', e instanceof Error ? e.message : e))
    }
  })
}

// ─── Reportó una persona de apoyo ────────────────────────────────────────────

/** Quien reportó es una persona de APOYO del indicador: se le copia a la persona responsable (informativo). */
export function avisarReporteDeApoyo(a: { reporteId: string; origen: string }): Promise<void> {
  return aislado('reporte-de-apoyo', async () => {
    const base = await leerBaseDeReporte(a.reporteId)
    if (!base) return
    const { personas, omitidas } = await leerResponsablesParaCopia(base.indicadorId, base.autorId, abierto())
    if (omitidas > 0) registrar('omitido', { tipo: 'reporte-de-apoyo', ref: referenciaDe(a.reporteId), personas: omitidas, motivo: 'politica' })
    if (personas.length === 0) return
    const ctx = await completarContextoDeReporte(base)
    const archivos = await contarArchivos(base.id)
    for (const p of personas) {
      const correo = correoReporteDeApoyo({
        destinatario: p.nombre, enlace: enlaceDeIndicador(a.origen, ctx.indicador.fila, base.anio), vistaPrevia: vistaPrevia(),
        reporteId: base.id, enviadoEn: base.creadoEn, indicador: ctx.indicador, anio: base.anio, valor: base.valor, meta: ctx.meta,
        quien: ctx.autor.nombre, texto: base.texto, archivos, esCorreccion: base.corrigeA !== null,
      })
      await entregar('reporte-de-apoyo', base.id, p, correo).catch(e =>
        console.error('[pdm/correos] reporte-de-apoyo: un envío falló:', e instanceof Error ? e.message : e))
    }
  })
}

// ─── Resúmenes programados ───────────────────────────────────────────────────

export interface ResultadoDeResumen {
  /** `false` si el módulo está cerrado en este entorno: no se calculó ni se envió nada. */
  habilitado: boolean
  /** Correos enviados con éxito (en ensayo, siempre 0). */
  enviados: number
  /** Personas a quienes no se les escribió (política, sin dirección real, o error). */
  omitidos: number
  /** Solo en ensayo: a quién le tocaría y con qué cifras. Lleva nombres: la ruta que lo devuelve exige el secreto del cron. */
  ensayo?: Record<string, unknown>[]
}

/**
 * Entrega un resumen y cuenta el resultado. A diferencia de los avisos de un hecho, un resumen ES el cron: aquí sí se
 * necesita saber si salió o no, para devolverlo a quien lo programó.
 */
async function entregarResumen(tipo: string, referencia: string, para: Persona, correo: CorreoListo): Promise<boolean> {
  if (!puedeRecibirCorreoPdm(para.id, abierto()) || !esCorreoEntregable(para.correo)) {
    registrar('omitido', { tipo, ref: referenciaDe(referencia), motivo: !puedeRecibirCorreoPdm(para.id, abierto()) ? 'politica' : 'sin-direccion' })
    return false
  }
  const r = await enviarCorreo({ to: para.correo, subject: correo.asunto, html: correo.html, text: correo.texto })
  registrar(r.ok ? 'enviado' : 'fallido', { tipo, ref: referenciaDe(referencia), ...(r.ok ? { resend: r.id ?? '?' } : { error: r.error ?? 'desconocido' }) })
  return r.ok
}

/**
 * El resumen MENSUAL de cada secretaría: «Tienes N reportes por validar», del más antiguo al más reciente. Solo a las
 * secretarías que tienen algo esperando. Sale el primer día de cada mes (ver `vercel.json`).
 *
 * `ensayo` calcula todo y NO envía nada: devuelve a quién le tocaría y con qué cifras.
 */
export async function enviarResumenMensual(a: { origen: string; ensayo?: boolean; ahora?: Date }): Promise<ResultadoDeResumen> {
  if (!habilitado()) return { habilitado: false, enviados: 0, omitidos: 0 }
  const ahora = a.ahora ?? new Date()
  const plan = await leerPlanPdm(createAdminSupabaseClient())
  if (!plan.ok) throw new Error('resumen mensual: no se pudo leer el plan')
  const anioActual = plan.seguimiento.anioActual
  const mes = mesDe(ahora)
  const personas = await leerSecretarias()

  const resultado: ResultadoDeResumen = { habilitado: true, enviados: 0, omitidos: 0, ...(a.ensayo ? { ensayo: [] as Record<string, unknown>[] } : {}) }
  for (const secretaria of [...new Set(personas.map(p => p.secretaria))].sort((x, y) => x.localeCompare(y, 'es'))) {
    const pendientes = pendientesDeValidar(plan.indicadores, ahora, secretaria)
    if (pendientes.length === 0) continue // sin nada esperando, no se escribe
    const anio = anioDelEnlace(pendientes, anioActual)
    for (const persona of personas.filter(p => p.secretaria === secretaria)) {
      const correo = correoResumenMensual({
        destinatario: persona.nombre, enlace: enlaceDePorValidar(a.origen, anio), vistaPrevia: vistaPrevia(),
        mes, dependencia: secretaria, total: pendientes.length,
        pendientes: pendientes.slice(0, MAX_PENDIENTES_EN_RESUMEN).map(p => ({ indicador: filaDeCorreo(p.indicador), anio: p.anio, autor: p.autorNombre, dias: p.dias })),
        anio: anioActual, estado: estadoDeSecretaria(plan.indicadores, secretaria, anioActual),
      })
      if (a.ensayo) {
        resultado.ensayo!.push({ para: persona.nombre, secretaria, asunto: correo.asunto, pendientes: pendientes.length, masAntiguoDias: pendientes[0].dias, recibiria: puedeRecibirCorreoPdm(persona.id, abierto()) && esCorreoEntregable(persona.correo) })
        continue
      }
      try {
        if (await entregarResumen('resumen-mensual', `${secretaria}:${mes}`, persona, correo)) resultado.enviados++
        else resultado.omitidos++
      } catch (e) {
        resultado.omitidos++
        console.error('[pdm/correos] resumen-mensual: un envío falló:', e instanceof Error ? e.message : e)
      }
    }
  }
  return resultado
}

/**
 * El resumen SEMANAL del administrador: qué pasó en los últimos siete días y qué necesita atención hoy. Sale cada lunes.
 * Siempre que haya a quién escribirle: una semana sin movimiento también se dice («no hubo reportes»), porque el
 * silencio del módulo es información para quien lo administra.
 */
export async function enviarResumenSemanal(a: { origen: string; ensayo?: boolean; ahora?: Date }): Promise<ResultadoDeResumen> {
  if (!habilitado()) return { habilitado: false, enviados: 0, omitidos: 0 }
  const ahora = a.ahora ?? new Date()
  const plan = await leerPlanPdm(createAdminSupabaseClient())
  if (!plan.ok) throw new Error('resumen semanal: no se pudo leer el plan')
  const [semana, sinAcceso, administradores] = await Promise.all([leerSemana(ahora), leerSinAcceso(plan.indicadores), leerAdministradores()])
  const rango = rangoDeSemana(ahora)
  const esperando = pendientesDeValidar(plan.indicadores, ahora)
  const hoy = panoramaDeHoy(plan.indicadores, ahora)

  const resultado: ResultadoDeResumen = { habilitado: true, enviados: 0, omitidos: 0, ...(a.ensayo ? { ensayo: [] as Record<string, unknown>[] } : {}) }
  for (const persona of administradores) {
    const correo = correoResumenSemanal({
      destinatario: persona.nombre, enlace: enlaceDeMiTrabajo(a.origen), vistaPrevia: vistaPrevia(),
      rango, semana, hoy, sinAcceso, porSecretaria: esperandoPorSecretaria(esperando),
    })
    if (a.ensayo) {
      resultado.ensayo!.push({ para: persona.nombre, asunto: correo.asunto, semana, hoy, sinAcceso: sinAcceso.total, recibiria: puedeRecibirCorreoPdm(persona.id, abierto()) && esCorreoEntregable(persona.correo) })
      continue
    }
    try {
      if (await entregarResumen('resumen-semanal', rango, persona, correo)) resultado.enviados++
      else resultado.omitidos++
    } catch (e) {
      resultado.omitidos++
      console.error('[pdm/correos] resumen-semanal: un envío falló:', e instanceof Error ? e.message : e)
    }
  }
  return resultado
}
