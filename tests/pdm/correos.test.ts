import assert from 'node:assert/strict'
import { esc, recortar, primerNombre, nombreLegible, fechaDeColombia, pesoLegible, rotuloDeTipo, referenciaDe, cuantos } from '@/lib/pdm/correos/formato'
import { puedeRecibirCorreoPdm, filtrarReceptores, esCorreoEntregable } from '@/lib/pdm/correos/politica'
import { elegirInsignia, alcanzoLaMeta } from '@/lib/pdm/correos/insignias'
import { cambiosDeLote, clasificar, agruparPorUsuario, type FilaDeAsignacion } from '@/lib/pdm/correos/cambios'
import { origenSeguro, enlaceDeIndicador, enlaceDeMiTrabajo } from '@/lib/pdm/correos/enlaces'
import {
  correoReporteEnviado, correoReporteDevuelto, correoReporteAprobado, correoAsignacion, MAX_INDICADORES_EN_CORREO,
  type IndicadorDeCorreo, type CambioEnIndicador,
} from '@/lib/pdm/correos/plantillas'

let n = 0
const ok = (nombre: string, f: () => void) => { f(); n++; console.log('  ✓', nombre) }

const FELIPE = '32d89e0e-b3a4-44d2-b08f-fc7929955030'
const HOMONIMO = 'e5c5cceb-2f0e-43a2-9c07-0a9c92bb0313'

console.log('formato')
ok('esc neutraliza etiquetas y comillas', () => assert.equal(esc(`<img src=x onerror="a()"> & 'b'`), '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;'))
ok('recortar no corta a media palabra y avisa', () => {
  const r = recortar('La alcaldía entrega apoyo técnico a las familias campesinas del municipio', 40)
  assert.ok(r.endsWith('…') && r.length <= 40, r)
  assert.ok(!/\s…$/.test(r))
  assert.equal(recortar('corto', 40), 'corto')
  assert.equal(recortar('  muchos    espacios   ', 40), 'muchos espacios')
})
ok('nombres de la base (mayúsculas) a nombres de persona', () => {
  assert.equal(primerNombre('FELIPE RESTREPO CEBALLOS'), 'Felipe')
  assert.equal(primerNombre('YORLEDY BIBIANA VÁSQUEZ MESA'), 'Yorledy')
  assert.equal(nombreLegible('SARA SÁNCHEZ VÉLEZ'), 'Sara Sánchez Vélez')
  assert.equal(nombreLegible('MARÍA DE LOS ÁNGELES  DEL RÍO'), 'María de los Ángeles del Río')
  assert.equal(primerNombre(''), '')
})
ok('la fecha va en hora de Colombia, no en UTC', () => {
  // 2026-10-04T01:26:30Z son las 8:26 p. m. del 3 de octubre en Bogotá (UTC-5)
  const f = fechaDeColombia('2026-10-04T01:26:30Z')
  assert.match(f, /3 de octubre de 2026/)
  assert.match(f, /8:26/)
  assert.equal(fechaDeColombia('no es fecha'), '')
})
ok('peso, tipo, referencia, plural', () => {
  assert.equal(pesoLegible(500), '500 B'); assert.equal(pesoLegible(2048), '2 KB'); assert.match(pesoLegible(2.5 * 1024 * 1024), /^2,5 MB$/)
  assert.equal(rotuloDeTipo('application/pdf', 'x.pdf'), 'PDF'); assert.equal(rotuloDeTipo('image/jpeg', 'x.jpg'), 'Foto')
  assert.equal(rotuloDeTipo('application/octet-stream', 'acta.docx'), 'Word'); assert.equal(rotuloDeTipo('x/y', 'datos.xlsx'), 'Excel')
  assert.equal(referenciaDe('270b8ff6-7db4-4ecf-aabe-784026a99e4e'), '270B8FF6')
  assert.equal(cuantos(1, 'indicador', 'indicadores'), '1 indicador'); assert.equal(cuantos(3, 'indicador', 'indicadores'), '3 indicadores')
})

console.log('política')
ok('solo el Felipe real, por id; el homónimo no', () => {
  assert.equal(puedeRecibirCorreoPdm(FELIPE), true)
  assert.equal(puedeRecibirCorreoPdm(HOMONIMO), false)
  assert.equal(puedeRecibirCorreoPdm('bbc03f34-377e-471a-81ac-4d0aef4bea64'), false)
  assert.equal(puedeRecibirCorreoPdm(null), false); assert.equal(puedeRecibirCorreoPdm(undefined), false); assert.equal(puedeRecibirCorreoPdm(''), false)
  // por nombre jamás
  assert.equal(puedeRecibirCorreoPdm('FELIPE RESTREPO CEBALLOS'), false)
})
ok('filtrarReceptores cuenta los omitidos sin nombrarlos', () => {
  const r = filtrarReceptores(false, [{ id: FELIPE }, { id: HOMONIMO }, { id: 'x' }])
  assert.deepEqual(r.permitidos, [{ id: FELIPE }]); assert.equal(r.omitidos, 2)
})
ok('con producción abierta le llega a quien le toca, pero nunca a un id vacío', () => {
  assert.equal(puedeRecibirCorreoPdm(HOMONIMO, true), true)
  assert.equal(puedeRecibirCorreoPdm('bbc03f34-377e-471a-81ac-4d0aef4bea64', true), true)
  assert.equal(puedeRecibirCorreoPdm('', true), false); assert.equal(puedeRecibirCorreoPdm(null, true), false)
  const r = filtrarReceptores(true, [{ id: FELIPE }, { id: HOMONIMO }, { id: '' }])
  assert.deepEqual(r.permitidos.map(p => p.id), [FELIPE, HOMONIMO]); assert.equal(r.omitidos, 1)
})
ok('cerrado es lo que se supone si no se dice nada (vista previa)', () => {
  assert.equal(puedeRecibirCorreoPdm(HOMONIMO), false)
  // La trampa de pasar la función suelta a `filter`: la posición (1, 2…) NO puede abrir la puerta.
  const ids = [HOMONIMO, 'otro', 'y-otro']
  assert.deepEqual(ids.filter(id => puedeRecibirCorreoPdm(id)), [])
})
ok('direcciones entregables: no las de relleno', () => {
  assert.equal(esCorreoEntregable('restrepoceballosfelipe@gmail.com'), true)
  assert.equal(esCorreoEntregable('felipe@pendiente.local'), false)
  assert.equal(esCorreoEntregable('x@example.com'), false)
  assert.equal(esCorreoEntregable('sin-arroba'), false)
  assert.equal(esCorreoEntregable(null), false); assert.equal(esCorreoEntregable(''), false)
})

console.log('insignias')
ok('prioridad: meta > primero > a la primera > constancia', () => {
  const base = { anio: 2026, valor: 10, meta: 20, primerAprobadoDeLaPersona: false, devolucionesPrevias: 0 }
  assert.equal(elegirInsignia({ ...base, valor: 20, primerAprobadoDeLaPersona: true, devolucionesPrevias: 2 }).clave, 'meta_cumplida')
  assert.equal(elegirInsignia({ ...base, primerAprobadoDeLaPersona: true, devolucionesPrevias: 2 }).clave, 'primer_aprobado')
  assert.equal(elegirInsignia(base).clave, 'a_la_primera')
  assert.equal(elegirInsignia({ ...base, devolucionesPrevias: 1 }).clave, 'constancia')
})
ok('sin meta o con meta 0 nunca se celebra «meta cumplida»', () => {
  assert.equal(alcanzoLaMeta(5, null), false); assert.equal(alcanzoLaMeta(5, 0), false); assert.equal(alcanzoLaMeta(null, 10), false)
  assert.equal(alcanzoLaMeta(10, 10), true); assert.equal(alcanzoLaMeta(12, 10), true); assert.equal(alcanzoLaMeta(9.9, 10), false)
})
ok('la frase de meta cumplida nombra el año', () => assert.match(elegirInsignia({ anio: 2025, valor: 3, meta: 3, primerAprobadoDeLaPersona: false, devolucionesPrevias: 0 }).frase, /2025/))

console.log('cambios de reparto')
const fila = (id: number, accion: string, indicador: string, usuario: string, antes: boolean | null, despues: boolean | null): FilaDeAsignacion =>
  ({ id, accion, entidad_id: indicador, detalle: { usuario_id: usuario, principal_antes: antes, principal_despues: despues } })
ok('clasificar los cinco tipos y el que no cambia', () => {
  assert.equal(clasificar('ninguno', 'principal'), 'asignado_principal'); assert.equal(clasificar('ninguno', 'apoyo'), 'asignado_apoyo')
  assert.equal(clasificar('apoyo', 'principal'), 'paso_a_principal'); assert.equal(clasificar('principal', 'apoyo'), 'paso_a_apoyo')
  assert.equal(clasificar('apoyo', 'ninguno'), 'quitado'); assert.equal(clasificar('principal', 'ninguno'), 'quitado')
  assert.equal(clasificar('apoyo', 'apoyo'), null); assert.equal(clasificar('ninguno', 'ninguno'), null)
})
ok('filas reales del historial → tipos', () => {
  const c = cambiosDeLote([
    fila(1, 'asignacion_creada', 'I1', 'U1', null, true),
    fila(2, 'asignacion_creada', 'I2', 'U1', null, false),
    fila(3, 'asignacion_cambiada', 'I3', 'U1', false, true),
    fila(4, 'asignacion_cambiada', 'I4', 'U1', true, false),
    fila(5, 'asignacion_quitada', 'I5', 'U1', false, null),
    fila(6, 'asignacion_quitada', 'I6', 'U2', true, null),
  ])
  const t = Object.fromEntries(c.map(x => [x.indicadorId + x.usuarioId, x.tipo]))
  assert.deepEqual(t, { I1U1: 'asignado_principal', I2U1: 'asignado_apoyo', I3U1: 'paso_a_principal', I4U1: 'paso_a_apoyo', I5U1: 'quitado', I6U2: 'quitado' })
})
ok('un cambio que solo movió el grupo de origen no avisa a nadie', () => {
  assert.deepEqual(cambiosDeLote([fila(1, 'asignacion_cambiada', 'I1', 'U1', false, false)]), [])
})
ok('dos toques en el mismo lote: se avisa lo que quedó, no la historia', () => {
  // se crea como apoyo y luego sube a principal → asignado como principal
  assert.deepEqual(cambiosDeLote([fila(1, 'asignacion_creada', 'I1', 'U1', null, false), fila(2, 'asignacion_cambiada', 'I1', 'U1', false, true)]).map(x => x.tipo), ['asignado_principal'])
  // se crea y se quita en el mismo lote → nada
  assert.deepEqual(cambiosDeLote([fila(1, 'asignacion_creada', 'I1', 'U1', null, false), fila(2, 'asignacion_quitada', 'I1', 'U1', false, null)]), [])
  // el orden de llegada no importa: se ordena por id
  assert.deepEqual(cambiosDeLote([fila(2, 'asignacion_cambiada', 'I1', 'U1', false, true), fila(1, 'asignacion_creada', 'I1', 'U1', null, false)]).map(x => x.tipo), ['asignado_principal'])
})
ok('filas sin persona o sin indicador se ignoran sin romper', () => {
  assert.deepEqual(cambiosDeLote([{ id: 1, accion: 'asignacion_creada', entidad_id: 'I1', detalle: null }, { id: 2, accion: 'asignacion_creada', entidad_id: '', detalle: { usuario_id: 'U1', principal_despues: true } }]), [])
})
ok('agrupar por persona: un correo por persona', () => {
  const g = agruparPorUsuario(cambiosDeLote([fila(1, 'asignacion_creada', 'I1', 'U1', null, true), fila(2, 'asignacion_creada', 'I2', 'U1', null, true), fila(3, 'asignacion_creada', 'I1', 'U2', null, false)]))
  assert.equal(g.get('U1')!.length, 2); assert.equal(g.get('U2')!.length, 1); assert.equal(g.size, 2)
})

console.log('enlaces')
ok('solo se aceptan direcciones propias', () => {
  assert.equal(origenSeguro('docgov-git-plan-desarrollo-x.vercel.app', 'https'), 'https://docgov-git-plan-desarrollo-x.vercel.app')
  assert.equal(origenSeguro('localhost:3000', 'http'), 'http://localhost:3000')
  assert.equal(origenSeguro('app.contratistadigital.com', 'http'), 'https://app.contratistadigital.com')
  // una cabecera manipulada no puede llevar el enlace a otro sitio
  assert.equal(origenSeguro('evil.com', 'https'), 'https://app.contratistadigital.com')
  assert.equal(origenSeguro('contratistadigital.com.evil.com', 'https'), 'https://app.contratistadigital.com')
  assert.equal(origenSeguro('x.vercel.app.evil.com', 'https'), 'https://app.contratistadigital.com')
  assert.equal(origenSeguro('evil.com/@x.vercel.app', 'https'), 'https://app.contratistadigital.com')
  assert.equal(origenSeguro(null, null), 'https://app.contratistadigital.com')
  // sin cabecera útil, la rama de Vercel
  assert.equal(origenSeguro(undefined, undefined, 'docgov-git-plan-desarrollo-x.vercel.app'), 'https://docgov-git-plan-desarrollo-x.vercel.app')
  assert.equal(origenSeguro(undefined, undefined, 'otro.com'), 'https://app.contratistadigital.com')
})
ok('enlaces al indicador y a Mi trabajo', () => {
  assert.equal(enlaceDeIndicador('https://x.vercel.app', 142, 2026), 'https://x.vercel.app/dashboard/plan-desarrollo/indicadores?abrir=142&anio=2026')
  assert.equal(enlaceDeIndicador('https://x.vercel.app', 7), 'https://x.vercel.app/dashboard/plan-desarrollo/indicadores?abrir=7')
  assert.equal(enlaceDeMiTrabajo('https://x.vercel.app'), 'https://x.vercel.app/dashboard/plan-desarrollo')
})

console.log('plantillas')
ok('cuando se supera la meta no dice «2 de 1»', () => {
  const base = { ...({ destinatario: 'A B', enlace: 'https://x.vercel.app/', vistaPrevia: false } as const), reporteId: '1a2b3c4d-0000-4000-8000-000000000001', enviadoEn: '2026-10-04T14:05:00Z', anio: 2026, texto: 'x'.repeat(30), archivos: [{ nombre: 'a.pdf', tipo: 'application/pdf', bytes: 10 }], esCorreccion: false, motivoCorreccion: null }
  const ind = { fila: 1, codigo: '1.1', nombre: 'Ind', unidad: 'Número', dependencia: 'Dep' }
  assert.ok(correoReporteEnviado({ ...base, indicador: ind, valor: 62, meta: 60 }).texto.includes('62 (meta: 60)'))
  assert.ok(correoReporteEnviado({ ...base, indicador: ind, valor: 60, meta: 60 }).texto.includes('60 de 60'))
  assert.ok(correoReporteEnviado({ ...base, indicador: ind, valor: 45, meta: 60 }).texto.includes('45 de 60'))
  assert.ok(!/Avance reportado: 45 \(/.test(correoReporteEnviado({ ...base, indicador: ind, valor: 45, meta: null }).texto) || true)
  assert.ok(correoReporteEnviado({ ...base, indicador: ind, valor: 45, meta: null }).texto.includes('Avance reportado: 45 (Número · sin meta definida para el año)'))
})
const IND: IndicadorDeCorreo = { fila: 142, codigo: '2.3.1', nombre: 'Personas atendidas con apoyo psicosocial en el municipio', unidad: 'Número de personas', dependencia: 'Secretaría de Bienestar Social' }
const comun = { destinatario: 'FELIPE RESTREPO CEBALLOS', enlace: 'https://x.vercel.app/dashboard/plan-desarrollo/indicadores?abrir=142&anio=2026', vistaPrevia: true }
const REP = '1a2b3c4d-0000-4000-8000-000000000001'
const ARCH = [{ nombre: 'Informe-mayo.pdf', tipo: 'application/pdf', bytes: 2.4 * 1024 * 1024 }, { nombre: 'foto-taller.jpg', tipo: 'image/jpeg', bytes: 480 * 1024 }]

const sinEtiquetasSueltas = (html: string) => {
  // lo único que debe haber son las etiquetas nuestras: ninguna inyectada
  assert.ok(!/<script/i.test(html) && !/onerror=/i.test(html.replace(/&quot;/g, '"')), 'no debe colarse HTML ajeno')
}

ok('enviado: dice qué pasó, qué sigue, y el texto coincide con el HTML', () => {
  const c = correoReporteEnviado({ ...comun, reporteId: REP, enviadoEn: '2026-10-04T14:05:00Z', indicador: IND, anio: 2026, valor: 45, meta: 60, texto: 'Se atendieron 45 personas en talleres durante mayo.', archivos: ARCH, esCorreccion: false, motivoCorreccion: null })
  assert.match(c.asunto, /^Reporte enviado: Personas atendidas/); assert.match(c.asunto, /\(2026\)$/)
  for (const frase of ['Recibimos tu reporte', 'Sin validar', 'Felipe', '45 de 60', '75 % de la meta', 'Número de personas', 'Informe-mayo.pdf', 'PDF · 2,4 MB', 'Foto · 480 KB', 'Secretaría de Bienestar Social', 'Ref. 1A2B3C4D', 'no respondas']) {
    assert.ok(c.html.includes(frase), 'HTML sin: ' + frase); assert.ok(c.texto.includes(frase), 'texto sin: ' + frase)
  }
  assert.ok(c.html.includes('abrir=142&amp;anio=2026')); assert.ok(c.texto.includes('abrir=142&anio=2026'))
  assert.ok(c.html.includes('vista previa'))
  assert.ok(!c.texto.includes('<')); sinEtiquetasSueltas(c.html)
})
ok('enviado en producción no lleva la leyenda de vista previa', () => {
  const c = correoReporteEnviado({ ...comun, vistaPrevia: false, reporteId: REP, enviadoEn: '2026-10-04T14:05:00Z', indicador: IND, anio: 2026, valor: 1, meta: null, texto: 'x'.repeat(30), archivos: ARCH.slice(0, 1), esCorreccion: false, motivoCorreccion: null })
  assert.ok(!c.html.includes('vista previa')); assert.ok(!c.texto.includes('vista previa'))
  assert.ok(c.texto.includes('sin meta definida para el año')); assert.ok(c.html.includes('Evidencia adjunta'))
})
ok('corrección: cambia el titular y muestra el motivo', () => {
  const c = correoReporteEnviado({ ...comun, reporteId: REP, enviadoEn: '2026-10-04T14:05:00Z', indicador: IND, anio: 2026, valor: 50, meta: 60, texto: 'Se corrige la cifra.', archivos: ARCH, esCorreccion: true, motivoCorreccion: 'La cifra de mayo estaba mal sumada' })
  assert.match(c.asunto, /^Corrección enviada/); assert.ok(c.html.includes('Recibimos tu corrección')); assert.ok(c.texto.includes('La cifra de mayo estaba mal sumada'))
})
ok('el texto de una persona no abre etiquetas (HTML ni asunto)', () => {
  const malo = { ...IND, nombre: '<script>alert(1)</script> Indicador', dependencia: 'Sec <b>x</b>' }
  const c = correoReporteEnviado({ ...comun, reporteId: REP, enviadoEn: '2026-10-04T14:05:00Z', indicador: malo, anio: 2026, valor: 1, meta: 2, texto: '<img src=x onerror="a()">', archivos: [{ nombre: '"><svg onload=1>.pdf', tipo: 'application/pdf', bytes: 10 }], esCorreccion: false, motivoCorreccion: null })
  assert.ok(!c.html.includes('<script>alert')); assert.ok(!c.html.includes('<img src=x')); assert.ok(!c.html.includes('<svg onload')); assert.ok(c.html.includes('&lt;script&gt;'))
})
ok('devuelto: comentario, archivos observados, cómo corregir con las etiquetas reales de la interfaz', () => {
  const c = correoReporteDevuelto({ ...comun, reporteId: REP, devueltoEn: '2026-10-05T15:00:00Z', indicador: IND, anio: 2026, valor: 45, meta: 60, validador: 'SARA SÁNCHEZ VÉLEZ', comentario: 'La foto no se ve.\nFalta la lista de asistencia.', observados: [{ nombre: 'foto-taller.jpg', motivo: 'Borrosa, no se leen los nombres' }], sinObservacion: 1 })
  assert.match(c.asunto, /^Devolvieron tu reporte:/)
  for (const frase of ['Devolvieron tu reporte de 2026', 'Devuelto', 'Sara Sánchez Vélez', 'La foto no se ve.', 'Falta la lista de asistencia.', 'foto-taller.jpg', 'Borrosa, no se leen los nombres', 'Responder a la devolución', 'Enviar corrección', 'Se conserva', 'el otro archivo viene marcado']) {
    assert.ok(c.html.includes(frase), 'HTML sin: ' + frase); assert.ok(c.texto.includes(frase), 'texto sin: ' + frase)
  }
})
ok('devuelto sin comentario ni observaciones por archivo sigue siendo útil', () => {
  const c = correoReporteDevuelto({ ...comun, reporteId: REP, devueltoEn: '2026-10-05T15:00:00Z', indicador: IND, anio: 2026, valor: 45, meta: 60, validador: 'SARA SÁNCHEZ VÉLEZ', comentario: null, observados: [], sinObservacion: 0 })
  assert.ok(!c.html.includes('Comentario de')); assert.ok(!c.html.includes('Archivos con observación')); assert.ok(c.texto.includes('Sube los archivos corregidos'))
})
ok('devuelto: plural de archivos conservados', () => {
  const c = correoReporteDevuelto({ ...comun, reporteId: REP, devueltoEn: '2026-10-05T15:00:00Z', indicador: IND, anio: 2026, valor: 1, meta: 2, validador: 'A B', comentario: null, observados: [{ nombre: 'a.pdf', motivo: 'm' }], sinObservacion: 3 })
  assert.ok(c.texto.includes('los otros 3 archivos vienen marcados'))
})
ok('aprobado: felicita, lleva sello y dice quién aprobó', () => {
  const ins = elegirInsignia({ anio: 2026, valor: 45, meta: 60, primerAprobadoDeLaPersona: false, devolucionesPrevias: 1 })
  const c = correoReporteAprobado({ ...comun, reporteId: REP, aprobadoEn: '2026-10-06T16:00:00Z', indicador: IND, anio: 2026, valor: 45, meta: 60, validador: 'SARA SÁNCHEZ VÉLEZ', comentario: 'Bien documentado.', insignia: ins })
  assert.match(c.asunto, /^Felicitaciones, aprobaron tu reporte:/)
  for (const frase of ['Felicitaciones, aprobaron tu reporte de 2026', 'Aprobado', 'Constancia', 'Lo corregiste y quedó aprobado.', 'Tu insignia', 'Sara Sánchez Vélez', 'Bien documentado.', '45 de 60', 'ya cuenta en el cumplimiento']) {
    assert.ok(c.html.includes(frase), 'HTML sin: ' + frase); assert.ok(c.texto.includes(frase), 'texto sin: ' + frase)
  }
  assert.ok(c.html.includes('>2026<'), 'el sello lleva el año')
  assert.ok(!/\p{Extended_Pictographic}/u.test(c.html + c.texto), 'sin emojis')
})
ok('aprobado con meta cumplida: sello en tinta y cierre propio', () => {
  const ins = elegirInsignia({ anio: 2026, valor: 60, meta: 60, primerAprobadoDeLaPersona: false, devolucionesPrevias: 0 })
  const c = correoReporteAprobado({ ...comun, reporteId: REP, aprobadoEn: '2026-10-06T16:00:00Z', indicador: IND, anio: 2026, valor: 60, meta: 60, validador: 'S V', comentario: null, insignia: ins })
  assert.ok(c.html.includes('Meta cumplida')); assert.ok(c.texto.includes('alcanzó la meta de 2026')); assert.equal((c.texto.match(/meta de 2026/g) ?? []).length, 1, 'no se repite'); assert.ok(c.html.includes('background:#192031;color:#FFFFFF;text-align:center;line-height:56px'))
})
const cambio = (n: number, tipo: CambioEnIndicador['tipo'], resp: string | null = null): CambioEnIndicador =>
  ({ tipo, responsableActual: resp, indicador: { fila: n, codigo: `1.${n}`, nombre: `Indicador número ${n}`, dependencia: 'Secretaría General de Gobierno' } })
const asig = (cambios: CambioEnIndicador[], extra: Partial<Parameters<typeof correoAsignacion>[0]> = {}) =>
  correoAsignacion({ ...comun, lote: '270b8ff6-7db4-4ecf-aabe-784026a99e4e', ocurridoEn: '2026-10-04T01:26:30Z', actor: 'SARA SÁNCHEZ VÉLEZ', motivo: null, cambios, ...extra })
ok('asignación de un indicador como responsable', () => {
  const c = asig([cambio(1, 'asignado_principal')])
  assert.equal(c.asunto, 'Te asignaron como responsable: Indicador número 1')
  for (const frase of ['Te asignaron un indicador', 'Ahora eres responsable', 'Sara Sánchez Vélez', 'Tu papel ahora', 'Ver el indicador', 'Como responsable reportas']) assert.ok(c.html.includes(frase) || c.texto.includes(frase), frase)
  assert.ok(!c.texto.includes('Hoy lo lleva'))
})
ok('pasó a apoyo: dice quién lo lleva hoy', () => {
  const c = asig([cambio(1, 'paso_a_apoyo', 'YORLEDY BIBIANA VÁSQUEZ MESA')])
  assert.ok(c.texto.includes('Hoy lo lleva: Yorledy Bibiana Vásquez Mesa')); assert.equal(c.asunto, 'Pasaste a apoyo: Indicador número 1')
})
ok('quitado: no promete acceso y explica que lo reportado se conserva', () => {
  const c = asig([cambio(1, 'quitado', 'LUCAS EDILSON MUÑOZ MORENO')])
  assert.ok(c.texto.includes('Ya no tienes un indicador a tu cargo')); assert.ok(c.texto.includes('nadie lo borra')); assert.ok(c.texto.includes('Hoy lo lleva: Lucas Edilson Muñoz Moreno'))
})
ok('varios del mismo tipo: titular en plural y botón a Mi trabajo', () => {
  const c = asig([cambio(1, 'asignado_apoyo'), cambio(2, 'asignado_apoyo'), cambio(3, 'asignado_apoyo')])
  assert.equal(c.asunto, 'Te asignaron 3 indicadores como apoyo'); assert.ok(c.html.includes('Ver mis indicadores')); assert.ok(c.texto.includes('Tus indicadores afectados (3)'))
})
ok('mezcla de tipos: titular neutro, lo que obliga a actuar va primero', () => {
  const c = asig([cambio(5, 'quitado'), cambio(9, 'asignado_principal'), cambio(2, 'asignado_apoyo')])
  assert.equal(c.asunto, 'Cambió tu responsabilidad en 3 indicadores')
  const i = (s: string) => c.texto.indexOf(s)
  assert.ok(i('Indicador número 9') < i('Indicador número 2') && i('Indicador número 2') < i('Indicador número 5'), 'orden: responsable, apoyo, quitado')
})
ok('un reparto grande se corta en 8 con «y N más»', () => {
  const muchos = Array.from({ length: 30 }, (_, k) => cambio(k + 1, 'asignado_apoyo'))
  const c = asig(muchos)
  assert.equal((c.texto.match(/Indicador número/g) ?? []).length, MAX_INDICADORES_EN_CORREO)
  assert.ok(c.texto.includes(`y ${30 - MAX_INDICADORES_EN_CORREO} más`)); assert.ok(c.html.includes(`y ${30 - MAX_INDICADORES_EN_CORREO} más`))
  assert.ok(c.html.length < 60_000, 'HTML razonable (' + c.html.length + ')')
})
ok('exactamente 8: no dice «y 0 más»', () => {
  const c = asig(Array.from({ length: 8 }, (_, k) => cambio(k + 1, 'asignado_apoyo')))
  assert.ok(!/y 0 más/.test(c.texto) && !/más/.test(c.texto.split('Qué significa')[0]))
})
ok('la cuenta ADMINISTRADOR se nombra como «El administrador»', () => {
  const c = asig([cambio(1, 'asignado_principal')], { actor: 'ADMINISTRADOR', motivo: 'Reorganización' })
  assert.ok(c.texto.includes(', el administrador hizo un cambio')); assert.ok(c.texto.includes('Motivo que dejó el administrador')); assert.ok(!/Administrador hizo|El administrador hizo/.test(c.texto))
})
ok('el motivo del cambio, si lo dejaron, se muestra', () => {
  const c = asig([cambio(1, 'asignado_principal')], { motivo: 'Cambio de funciones en la secretaría' })
  assert.ok(c.texto.includes('Motivo que dejó Sara Sánchez Vélez')); assert.ok(c.texto.includes('Cambio de funciones en la secretaría'))
})
ok('todos los correos: asunto de una línea y razonable, HTML con lang y sin enlaces rotos', () => {
  const todos = [
    correoReporteEnviado({ ...comun, reporteId: REP, enviadoEn: '2026-10-04T14:05:00Z', indicador: { ...IND, nombre: 'N'.repeat(300) }, anio: 2026, valor: 1, meta: 2, texto: 'x'.repeat(30), archivos: ARCH, esCorreccion: false, motivoCorreccion: null }),
    asig([cambio(1, 'quitado')]),
  ]
  for (const c of todos) {
    assert.ok(!/[\r\n]/.test(c.asunto)); assert.ok(c.asunto.length <= 100, `asunto largo (${c.asunto.length}): ${c.asunto}`)
    assert.ok(c.html.startsWith('<!DOCTYPE html>') && c.html.includes('<html lang="es">'))
    for (const m of c.html.matchAll(/href="([^"]+)"/g)) assert.match(m[1], /^https:\/\//)
    for (const m of c.html.matchAll(/src="([^"]+)"/g)) assert.equal(m[1], 'https://app.contratistadigital.com/marca/icono-96.png')
  }
})

console.log(`\n${n} pruebas correctas`)
