/**
 * Muestras de los correos del módulo Plan de Desarrollo, para REVISAR EL TEXTO sin enviar nada.
 *
 *   npx tsx scripts/muestras-correos-pdm.ts <carpeta>
 *
 * Arma cada correo con datos de EJEMPLO (nombres y cifras inventados, ninguna lectura de la base) y deja en la carpeta
 * un `muestras.html` con todos juntos —asunto, texto de vista previa y el correo tal como se ve— y la versión en texto
 * plano de cada uno en `texto/`. Sirve para que quien decide el tono lea los avisos de una vez, como los leería la
 * persona que los recibe, antes de que salgan a nadie.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { esc } from '../lib/pdm/correos/formato'
import type { CorreoListo } from '../lib/pdm/correos/envoltura'
import { correoAsignacion, type IndicadorDeCorreo } from '../lib/pdm/correos/plantillas'
import { correoAcceso } from '../lib/pdm/correos/plantillas-acceso'
import {
  correoComentarioControlInterno, correoReporteAnulado, correoReporteDeApoyo, correoReporteReabierto, correoReporteRestaurado,
} from '../lib/pdm/correos/plantillas-avisos'
import { correoResumenMensual, correoResumenSemanal } from '../lib/pdm/correos/plantillas-resumenes'

const destino = process.argv[2]
if (!destino) { console.error('Uso: npx tsx scripts/muestras-correos-pdm.ts <carpeta>'); process.exit(1) }

const ENLACE = 'https://app.contratistadigital.com/dashboard/plan-desarrollo'
const comun = { enlace: ENLACE, vistaPrevia: false }
const ANA = 'ANA MARÍA PÉREZ RUIZ'
const SARA = 'SARA SÁNCHEZ VÉLEZ'
const lote = '3f2a91c4-5b7d-4e1a-8c20-9d6e41ab7f03'
const ahora = '2026-10-19T14:20:00Z'

const ind = (fila: number, codigo: string, nombre: string, dependencia = 'Secretaría de Bienestar Social'): IndicadorDeCorreo =>
  ({ fila, codigo, nombre, unidad: 'Número', dependencia })
const TRANSPORTE = ind(12, '1.2.4', 'Estudiantes beneficiados con transporte escolar', 'Secretaría General de Gobierno')
const FAMILIAS = ind(40, '3.1.2', 'Familias atendidas con ayudas humanitarias')
const VIA = ind(77, '4.3.1', 'Kilómetros de vía rural mantenidos', 'Secretaría de Desarrollo Territorial')

const muestras: { titulo: string; correo: CorreoListo }[] = [
  // ── Acceso ──
  { titulo: 'Acceso · bienvenida de un responsable CON indicadores', correo: correoAcceso({
    ...comun, destinatario: ANA, lote, ocurridoEn: ahora, actor: SARA, cambio: 'habilitado', nivel: 'responsable', nivelAntes: null,
    dependencia: 'Secretaría General de Gobierno', totalIndicadores: 7, indicadoresDeLaSecretaria: null,
    indicadores: [
      { codigo: '1.2.4', nombre: 'Estudiantes beneficiados con transporte escolar', papel: 'principal' },
      { codigo: '1.2.5', nombre: 'Instituciones educativas con conectividad', papel: 'principal' },
      { codigo: '1.4.1', nombre: 'Docentes capacitados en uso de tecnologías', papel: 'apoyo' },
      { codigo: '1.4.2', nombre: 'Aulas dotadas con equipos de cómputo', papel: 'apoyo' },
      { codigo: '2.1.1', nombre: 'Jóvenes vinculados a programas de emprendimiento', papel: 'apoyo' },
    ],
  }) },
  { titulo: 'Acceso · bienvenida de un responsable SIN indicadores todavía', correo: correoAcceso({
    ...comun, destinatario: 'JUNIOR VEGA ARDILA', lote, ocurridoEn: ahora, actor: SARA, cambio: 'habilitado', nivel: 'responsable', nivelAntes: null,
    dependencia: 'Secretaría General de Gobierno', totalIndicadores: 0, indicadoresDeLaSecretaria: null, indicadores: [],
  }) },
  { titulo: 'Acceso · bienvenida de la secretaría', correo: correoAcceso({
    ...comun, destinatario: SARA, lote, ocurridoEn: ahora, actor: 'ADMINISTRADOR', cambio: 'habilitado', nivel: 'coordinador', nivelAntes: null,
    dependencia: 'Secretaría General de Gobierno', totalIndicadores: 0, indicadoresDeLaSecretaria: 66, indicadores: [],
  }) },
  { titulo: 'Acceso · bienvenida de Control Interno', correo: correoAcceso({
    ...comun, destinatario: 'CARLOS ANDRÉS MESA GÓMEZ', lote, ocurridoEn: ahora, actor: 'ADMINISTRADOR', cambio: 'habilitado', nivel: 'consulta', nivelAntes: null,
    dependencia: null, totalIndicadores: 0, indicadoresDeLaSecretaria: null, indicadores: [],
  }) },
  { titulo: 'Acceso · cambió el nivel', correo: correoAcceso({
    ...comun, destinatario: ANA, lote, ocurridoEn: ahora, actor: SARA, cambio: 'cambiado', nivel: 'coordinador', nivelAntes: 'responsable',
    dependencia: 'Secretaría General de Gobierno', totalIndicadores: 2, indicadoresDeLaSecretaria: 66,
    indicadores: [{ codigo: '1.2.4', nombre: 'Estudiantes beneficiados con transporte escolar', papel: 'principal' }, { codigo: '1.2.5', nombre: 'Instituciones educativas con conectividad', papel: 'apoyo' }],
  }) },
  { titulo: 'Acceso · se retiró', correo: correoAcceso({
    ...comun, destinatario: 'JUNIOR VEGA ARDILA', lote, ocurridoEn: ahora, actor: SARA, cambio: 'quitado', nivel: null, nivelAntes: 'responsable',
    dependencia: 'Secretaría General de Gobierno', totalIndicadores: 0, indicadoresDeLaSecretaria: null, indicadores: [],
  }) },

  // ── Grupos ──
  { titulo: 'Grupo · te agregaron (líder, con indicadores)', correo: correoAsignacion({
    ...comun, destinatario: ANA, lote, ocurridoEn: ahora, actor: SARA, motivo: 'Para nutrir los indicadores de las TICS',
    grupo: { motivo: 'agregado', nombre: 'TICS', lider: true, dependencia: 'Secretaría General de Gobierno', descripcion: 'Grupo de la Tecnología y la información' },
    cambios: [
      { tipo: 'asignado_principal', indicador: { fila: 12, codigo: '1.2.4', nombre: TRANSPORTE.nombre, dependencia: TRANSPORTE.dependencia }, responsableActual: null },
      { tipo: 'asignado_principal', indicador: { fila: 13, codigo: '1.2.5', nombre: 'Instituciones educativas con conectividad', dependencia: TRANSPORTE.dependencia }, responsableActual: null },
      { tipo: 'asignado_apoyo', indicador: { fila: 14, codigo: '1.4.1', nombre: 'Docentes capacitados en uso de tecnologías', dependencia: TRANSPORTE.dependencia }, responsableActual: null },
    ],
  }) },
  { titulo: 'Grupo · te agregaron (el grupo aún no tiene indicadores)', correo: correoAsignacion({
    ...comun, destinatario: 'JUNIOR VEGA ARDILA', lote, ocurridoEn: ahora, actor: SARA, motivo: null,
    grupo: { motivo: 'agregado', nombre: 'UMATA', lider: false, dependencia: 'Secretaría de Desarrollo Territorial', descripcion: null },
    cambios: [],
  }) },
  { titulo: 'Grupo · a tu grupo le asignaron indicadores', correo: correoAsignacion({
    ...comun, destinatario: ANA, lote, ocurridoEn: ahora, actor: SARA, motivo: 'Indicadores de la línea de educación',
    grupo: { motivo: 'asignado', nombre: 'TICS' },
    cambios: [
      { tipo: 'asignado_apoyo', indicador: { fila: 12, codigo: '1.2.4', nombre: TRANSPORTE.nombre, dependencia: TRANSPORTE.dependencia }, responsableActual: null },
      { tipo: 'asignado_apoyo', indicador: { fila: 13, codigo: '1.2.5', nombre: 'Instituciones educativas con conectividad', dependencia: TRANSPORTE.dependencia }, responsableActual: null },
      { tipo: 'asignado_apoyo', indicador: { fila: 14, codigo: '1.4.1', nombre: 'Docentes capacitados en uso de tecnologías', dependencia: TRANSPORTE.dependencia }, responsableActual: null },
    ],
  }) },

  // ── Reportes ──
  { titulo: 'Reporte · reabierto', correo: correoReporteReabierto({
    ...comun, destinatario: ANA, reporteId: lote, ocurridoEn: ahora, indicador: TRANSPORTE, anio: 2026, valor: 480, meta: 600, actor: 'ADMINISTRADOR',
    comentario: 'El valor no coincide con las listas de asistencia del soporte. Revisa las cifras de septiembre.', observados: [{ nombre: 'listas-septiembre.pdf', motivo: 'Faltan las hojas 3 y 4.' }],
  }) },
  { titulo: 'Reporte · anulado', correo: correoReporteAnulado({
    ...comun, destinatario: ANA, reporteId: lote, ocurridoEn: ahora, indicador: FAMILIAS, anio: 2026, valor: 90, meta: 200, actor: 'ADMINISTRADOR',
    motivo: 'Se reportó sobre el indicador equivocado: la evidencia corresponde al 3.1.3.',
  }) },
  { titulo: 'Reporte · restaurado', correo: correoReporteRestaurado({
    ...comun, destinatario: ANA, reporteId: lote, ocurridoEn: ahora, indicador: FAMILIAS, anio: 2026, valor: 90, meta: 200, actor: 'ADMINISTRADOR',
    motivo: 'Se anuló por error; el reporte era correcto.',
  }) },
  { titulo: 'Reporte · copia al responsable cuando reporta una persona de apoyo', correo: correoReporteDeApoyo({
    ...comun, destinatario: SARA, reporteId: lote, enviadoEn: ahora, indicador: VIA, anio: 2026, valor: 34, meta: 60, quien: 'JHONATAN DANILO SUAZA TORRES',
    texto: 'Se hizo el mantenimiento de 12 kilómetros de la vía a la vereda El Rodeo, con cuadrilla municipal.', archivos: 3, esCorreccion: false,
  }) },

  // ── Comentarios ──
  { titulo: 'Comentario de Control Interno · a quien lleva el indicador', correo: correoComentarioControlInterno({
    ...comun, destinatario: ANA, comentarioId: lote, ocurridoEn: ahora, indicador: TRANSPORTE, anio: 2026, autor: 'CARLOS ANDRÉS MESA GÓMEZ', como: 'responsable',
    texto: 'La evidencia cargada es del mes de agosto, pero el avance reportado es acumulado a septiembre. Por favor aclarar de dónde sale la diferencia.',
  }) },
  { titulo: 'Comentario de Control Interno · a la secretaría', correo: correoComentarioControlInterno({
    ...comun, destinatario: SARA, comentarioId: lote, ocurridoEn: ahora, indicador: TRANSPORTE, anio: null, autor: 'CARLOS ANDRÉS MESA GÓMEZ', como: 'secretaria',
    texto: 'Este indicador no tiene meta definida para 2027. ¿Planeación lo va a ajustar?',
  }) },

  // ── Resúmenes ──
  { titulo: 'Resumen MENSUAL · a la secretaría', correo: correoResumenMensual({
    ...comun, enlace: `${ENLACE}/indicadores?filtro=por_validar&anio=2026`, destinatario: SARA, mes: 'noviembre de 2026', dependencia: 'Secretaría General de Gobierno', total: 14, anio: 2026,
    pendientes: [
      { indicador: TRANSPORTE, anio: 2026, autor: ANA, dias: 41 },
      { indicador: ind(13, '1.2.5', 'Instituciones educativas con conectividad', 'Secretaría General de Gobierno'), anio: 2026, autor: 'JHONATAN DANILO SUAZA TORRES', dias: 33 },
      { indicador: ind(14, '1.4.1', 'Docentes capacitados en uso de tecnologías', 'Secretaría General de Gobierno'), anio: 2026, autor: ANA, dias: 19 },
      { indicador: ind(15, '2.1.1', 'Jóvenes vinculados a programas de emprendimiento', 'Secretaría General de Gobierno'), anio: 2025, autor: 'VALENTINA RESTREPO MONTOYA', dias: 6 },
    ],
    estado: { aprobados: 21, sinValidar: 14, devueltos: 3, faltanReportar: 22, sinResponsable: 6 },
  }) },
  { titulo: 'Resumen SEMANAL · al administrador', correo: correoResumenSemanal({
    ...comun, destinatario: 'ADMINISTRADOR', rango: 'del 12 al 18 de octubre',
    semana: { reportados: 9, aprobados: 5, devueltos: 2, anulados: 1 },
    hoy: { porValidar: 18, porValidarMasDe30Dias: 4, sinResponsable: 31 },
    sinAcceso: { total: 23, nombres: ['Ana María Pérez Ruiz', 'Jhonatan Danilo Suaza Torres', 'Valentina Restrepo Montoya', 'Lucas Edilson Muñoz Moreno', 'Jeison Andrés García Gómez', 'Junior Vega Ardila'] },
    porSecretaria: [{ nombre: 'Secretaría General de Gobierno', porValidar: 11, masAntiguoDias: 41 }, { nombre: 'Secretaría de Bienestar Social', porValidar: 7, masAntiguoDias: 12 }],
  }) },
]

mkdirSync(join(destino, 'texto'), { recursive: true })
muestras.forEach((m, k) => writeFileSync(join(destino, 'texto', `${String(k + 1).padStart(2, '0')}.txt`), `ASUNTO: ${m.correo.asunto}\n\n${m.correo.texto}\n`))

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Muestras de correos · Plan de Desarrollo</title>
<style>
  body{margin:0;background:#E9ECF1;font:15px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#192031}
  main{max-width:660px;margin:0 auto;padding:24px 16px 64px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#4A5468;margin:0 0 24px}
  nav{background:#fff;border-radius:12px;padding:14px 18px;margin-bottom:28px} nav a{display:block;color:#192031;padding:3px 0;text-decoration:none} nav a:hover{text-decoration:underline}
  section{margin:0 0 40px} h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#4A5468;margin:0 0 8px}
  .asunto{background:#fff;border-radius:10px;padding:10px 14px;margin-bottom:8px} .asunto b{display:block;font-size:15px} .asunto span{color:#667085;font-size:13px}
  iframe{width:100%;border:0;border-radius:12px;background:#F3F4F7;height:1800px}
</style></head><body><main>
<h1>Muestras de correos · Plan de Desarrollo</h1>
<p class="sub">Datos de ejemplo (nombres y cifras inventados). Así los leería quien los recibe.</p>
<nav>${muestras.map((m, k) => `<a href="#m${k + 1}">${k + 1}. ${esc(m.titulo)}</a>`).join('')}</nav>
${muestras.map((m, k) => `<section id="m${k + 1}"><h2>${k + 1}. ${esc(m.titulo)}</h2>
<div class="asunto"><b>${esc(m.correo.asunto)}</b></div>
<iframe srcdoc="${esc(m.correo.html)}"></iframe></section>`).join('\n')}
</main>
<script>
// Cada marco toma el alto de su correo (si el navegador no deja leerlo, queda el alto de reserva de la hoja de estilo).
const ajusta = f => { try { f.style.height = '0px'; f.style.height = (f.contentDocument.documentElement.scrollHeight + 2) + 'px' } catch (e) {} }
const todos = () => { document.querySelectorAll('iframe').forEach(ajusta); setTimeout(() => document.querySelectorAll('iframe').forEach(ajusta), 400) }
document.querySelectorAll('iframe').forEach(f => f.addEventListener('load', () => ajusta(f)))
if (document.readyState === 'complete') todos(); else addEventListener('load', todos)
addEventListener('resize', () => document.querySelectorAll('iframe').forEach(ajusta))
</script></body></html>`
writeFileSync(join(destino, 'muestras.html'), html)
console.log(`${muestras.length} correos → ${join(destino, 'muestras.html')}`)
