import assert from 'node:assert/strict'
import { cambiosDeLote, type FilaDeAsignacion } from '@/lib/pdm/correos/cambios'
import { enlaceDePorValidar } from '@/lib/pdm/correos/enlaces'
import { correoAsignacion, type CambioEnIndicador, type IndicadorDeCorreo } from '@/lib/pdm/correos/plantillas'
import { correoAcceso, MAX_INDICADORES_EN_BIENVENIDA, type DatosAcceso } from '@/lib/pdm/correos/plantillas-acceso'
import {
  correoComentarioControlInterno, correoReporteAnulado, correoReporteDeApoyo, correoReporteReabierto, correoReporteRestaurado,
} from '@/lib/pdm/correos/plantillas-avisos'
import { correoResumenMensual, correoResumenSemanal, MAX_PENDIENTES_EN_RESUMEN } from '@/lib/pdm/correos/plantillas-resumenes'
import {
  anioDelEnlace, diasDesde, esperandoPorSecretaria, estadoDeSecretaria, filaDeCorreo, inicioDeSemana, mesDe, panoramaDeHoy,
  pendientesDeValidar, rangoDeSemana,
} from '@/lib/pdm/correos/resumenes-armar'
import { cuentaDeAnio } from '@/lib/pdm/graficos'
import type { AnioDeIndicador, Indicador } from '@/lib/pdm/plan'
import { ANIOS_PLAN, type SituacionAnio } from '@/lib/pdm/seguimiento'

let n = 0
const ok = (nombre: string, f: () => void) => { f(); n++; console.log('  ✓', nombre) }

const IND: IndicadorDeCorreo = { fila: 142, codigo: '2.3.1', nombre: 'Personas atendidas con apoyo psicosocial en el municipio', unidad: 'Número de personas', dependencia: 'Secretaría de Bienestar Social' }
const comun = { destinatario: 'YORLEDY BIBIANA VÁSQUEZ MESA', enlace: 'https://app.contratistadigital.com/dashboard/plan-desarrollo', vistaPrevia: false }
const REP = '1a2b3c4d-0000-4000-8000-000000000001'
const LOTE = '270b8ff6-7db4-4ecf-aabe-784026a99e4e'

/** Lo que cualquier correo debe cumplir: una línea de asunto razonable, sin emojis, sin etiquetas ajenas y el texto sin HTML. */
function sano(c: { asunto: string; html: string; texto: string }) {
  assert.ok(!/[\r\n]/.test(c.asunto), 'asunto de una línea')
  assert.ok(c.asunto.length <= 100, `asunto largo (${c.asunto.length}): ${c.asunto}`)
  assert.ok(!/\p{Extended_Pictographic}/u.test(c.html + c.texto), 'sin emojis')
  assert.ok(!c.texto.includes('<'), 'el texto no lleva etiquetas')
  assert.ok(!/<script/i.test(c.html), 'sin scripts')
  for (const m of c.html.matchAll(/href="([^"]+)"/g)) assert.match(m[1], /^https:\/\//)
}

// ─── Acceso al módulo ────────────────────────────────────────────────────────

console.log('acceso al módulo')
const acceso = (extra: Partial<DatosAcceso> = {}): DatosAcceso => ({
  ...comun, lote: LOTE, ocurridoEn: '2026-10-18T15:00:00Z', actor: 'SARA SÁNCHEZ VÉLEZ', cambio: 'habilitado', nivel: 'responsable', nivelAntes: null,
  dependencia: 'Secretaría de Bienestar Social', indicadores: [], totalIndicadores: 0, indicadoresDeLaSecretaria: null, ...extra,
})
ok('habilitar a quien aún no tiene indicadores: se le dice que no hace falta nada y que se le avisa aparte', () => {
  const c = correoAcceso(acceso())
  assert.equal(c.asunto, 'Te habilitaron en el módulo del Plan de Desarrollo')
  for (const frase of ['Yorledy', 'Sara Sánchez Vélez te habilitó', 'Responsable de indicadores', 'Todavía no tienes indicadores a tu cargo', 'no tienes que hacer nada ahora', 'Cómo empezar']) {
    assert.ok(c.html.includes(frase) && c.texto.includes(frase), 'falta: ' + frase)
  }
  sano(c)
})
ok('habilitar a quien ya tiene indicadores: los nombra, hasta cinco y «y N más»', () => {
  const lista = Array.from({ length: 5 }, (_, k) => ({ codigo: `1.${k}`, nombre: `Indicador ${k}`, papel: (k === 0 ? 'principal' : 'apoyo') as 'principal' | 'apoyo' }))
  const c = correoAcceso(acceso({ indicadores: lista, totalIndicadores: 7 }))
  assert.ok(c.texto.includes('Ya tienes 7 indicadores a tu cargo')); assert.equal((c.texto.match(/Indicador \d/g) ?? []).length, MAX_INDICADORES_EN_BIENVENIDA)
  assert.ok(c.texto.includes('y 2 más')); assert.ok(!c.texto.includes('Todavía no tienes'))
  assert.ok(c.texto.includes('1.0 · Responsable') && c.texto.includes('1.1 · Apoyo'))
  const exacto = correoAcceso(acceso({ indicadores: lista, totalIndicadores: 5 }))
  assert.ok(!/y 0 más/.test(exacto.texto) && !/\by \d+ más\b/.test(exacto.texto))
})
ok('quien habilita es el administrador: se dice «el administrador», no «Administrador te habilitó»', () => {
  const c = correoAcceso(acceso({ actor: 'ADMINISTRADOR' }))
  assert.ok(c.texto.includes('el administrador te habilitó')); assert.ok(c.texto.includes('El administrador del módulo')); assert.ok(!/Administrador te habilitó/.test(c.texto))
})
ok('cada nivel dice lo suyo: secretaría valida y reparte, Control Interno consulta y comenta', () => {
  const sec = correoAcceso(acceso({ nivel: 'coordinador', indicadoresDeLaSecretaria: 41 }))
  assert.equal(sec.asunto, 'Ya tienes acceso al Plan de Desarrollo como secretaría')
  assert.ok(sec.texto.includes('Validas lo que reportan en tu secretaría')); assert.ok(sec.texto.includes('Indicadores de tu secretaría: 41'))
  const ci = correoAcceso(acceso({ nivel: 'consulta', dependencia: null }))
  assert.ok(ci.texto.includes('Consultas todo el plan y dejas comentarios')); assert.ok(ci.texto.includes('No reportas ni cambias nada')); assert.ok(!ci.texto.includes('Secretaría:'))
  sano(sec); sano(ci)
})
ok('cambio de nivel: antes, ahora y qué puede hacer con el nuevo', () => {
  const c = correoAcceso(acceso({ cambio: 'cambiado', nivelAntes: 'responsable', nivel: 'coordinador' }))
  assert.ok(c.texto.includes('Antes: Responsable de indicadores')); assert.ok(c.texto.includes('Ahora: Secretaría')); assert.ok(c.texto.includes('Con este nivel: Validas'))
  sano(c)
})
ok('retirar el acceso: sin acusar, y lo reportado se conserva', () => {
  const c = correoAcceso(acceso({ cambio: 'quitado', nivel: null, nivelAntes: 'responsable' }))
  assert.equal(c.asunto, 'Ya no tienes acceso al módulo del Plan de Desarrollo')
  assert.ok(c.texto.includes('nadie lo borra')); assert.ok(c.texto.includes('Tu nivel hasta hoy: Responsable de indicadores'))
  sano(c)
})
ok('habilitar sin nivel es un error de programación, no un correo a medias', () => {
  assert.throws(() => correoAcceso(acceso({ nivel: null })), /falta el nivel/)
})

// ─── Grupos ──────────────────────────────────────────────────────────────────

console.log('grupos')
const cambio = (k: number): CambioEnIndicador => ({ tipo: 'asignado_apoyo', responsableActual: null, indicador: { fila: k, codigo: `1.${k}`, nombre: `Indicador número ${k}`, dependencia: 'Secretaría General de Gobierno' } })
const deGrupo = (cambios: CambioEnIndicador[], grupo: NonNullable<Parameters<typeof correoAsignacion>[0]['grupo']>) =>
  correoAsignacion({ ...comun, lote: LOTE, ocurridoEn: '2026-10-18T15:00:00Z', actor: 'SARA SÁNCHEZ VÉLEZ', motivo: null, cambios, grupo })
ok('entrar a un grupo con indicadores: un solo correo que dice el grupo y los indicadores', () => {
  const c = deGrupo([cambio(1), cambio(2)], { nombre: 'Atención a la infancia', motivo: 'agregado', lider: false, descripcion: 'Lleva los indicadores de primera infancia.' })
  assert.ok(c.texto.includes('Te agregaron al grupo «Atención a la infancia»')); assert.ok(c.texto.includes('Integrante')); assert.ok(c.texto.includes('Lleva los indicadores de primera infancia.'))
  assert.ok(c.texto.includes('Indicadores del grupo (2)')); sano(c)
})
ok('entrar como líder se dice', () => {
  const c = deGrupo([cambio(1)], { nombre: 'Infancia', motivo: 'agregado', lider: true })
  assert.ok(c.texto.includes('como líder')); assert.ok(c.texto.includes('Líder del grupo'))
})
ok('entrar a un grupo SIN indicadores: no inventa nada y dice que hoy no hay trabajo', () => {
  const c = deGrupo([], { nombre: 'Infancia', motivo: 'agregado' })
  assert.ok(c.texto.includes('Por ahora el grupo no tiene indicadores a su cargo')); assert.ok(!c.texto.includes('Indicadores del grupo'))
  sano(c)
})
ok('al grupo le asignan indicadores: título y asunto hablan del grupo', () => {
  const uno = deGrupo([cambio(1)], { nombre: 'Infancia', motivo: 'asignado' })
  assert.ok(uno.html.includes('A tu grupo «Infancia» le asignaron un indicador')); assert.match(uno.asunto, /^Tu grupo «Infancia» recibió: /)
  const tres = deGrupo([cambio(1), cambio(2), cambio(3)], { nombre: 'Infancia', motivo: 'asignado' })
  assert.ok(tres.html.includes('A tu grupo «Infancia» le asignaron 3')); assert.equal(tres.asunto, 'Tu grupo «Infancia» recibió 3 indicadores')
})
ok('el nombre del grupo, escrito por una persona, no abre etiquetas', () => {
  const c = deGrupo([cambio(1)], { nombre: '<img src=x onerror="a()">', motivo: 'asignado' })
  assert.ok(!c.html.includes('<img src=x')); assert.ok(c.html.includes('&lt;img'))
})
ok('las filas de la bitácora dicen por qué grupo llegó cada indicador (y una asignación quitada, ninguno)', () => {
  const fila = (id: number, accion: string, indicador: string, d: FilaDeAsignacion['detalle']): FilaDeAsignacion => ({ id, accion, entidad_id: indicador, detalle: d })
  const r = cambiosDeLote([
    fila(1, 'asignacion_creada', 'i1', { usuario_id: 'u1', principal_despues: false, operacion: 'asignar_grupo', grupo_despues: 'g1', grupo_nombre: 'Infancia' }),
    fila(2, 'asignacion_creada', 'i2', { usuario_id: 'u1', principal_despues: false }),
    fila(3, 'asignacion_quitada', 'i3', { usuario_id: 'u1', principal_antes: false, grupo_despues: 'g1', grupo_nombre: 'Infancia' }),
  ])
  const por = new Map(r.map(c => [c.indicadorId, c]))
  assert.equal(por.get('i1')?.grupo, 'Infancia'); assert.equal(por.get('i2')?.grupo, null); assert.equal(por.get('i3')?.grupo, null)
})

// ─── Reabierto, anulado, restaurado ──────────────────────────────────────────

console.log('reabrir, anular y restaurar')
const sobre = { ...comun, reporteId: REP, ocurridoEn: '2026-10-18T15:00:00Z', indicador: IND, anio: 2026, valor: 45, meta: 60, actor: 'ADMINISTRADOR' }
ok('reabierto: dice «reabrió», qué cambia para el cumplimiento y por qué, con los archivos observados', () => {
  const c = correoReporteReabierto({ ...sobre, comentario: 'La cifra de mayo está mal sumada.', observados: [{ nombre: 'informe.pdf', motivo: 'No coincide con el total' }] })
  assert.match(c.asunto, /^Reabrieron tu reporte/)
  for (const frase of ['el administrador reabrió el reporte de 2026', 'deja de contar en el cumplimiento', 'La cifra de mayo está mal sumada.', 'informe.pdf', 'No coincide con el total', '45 de 60']) {
    assert.ok(c.html.includes(frase) && c.texto.includes(frase), 'falta: ' + frase)
  }
  sano(c)
})
ok('anulado: el motivo le llega a quien reportó, y se dice que no se borró', () => {
  const c = correoReporteAnulado({ ...sobre, motivo: 'Se reportó en el indicador equivocado' })
  assert.match(c.asunto, /^Anularon tu reporte/)
  for (const frase of ['el administrador anuló tu reporte de 2026', 'Ya no cuenta', 'No se borró', 'Se reportó en el indicador equivocado', 'Por qué se anuló']) assert.ok(c.texto.includes(frase), 'falta: ' + frase)
  sano(c)
})
ok('anulado sin motivo no deja un bloque vacío', () => {
  const c = correoReporteAnulado({ ...sobre, motivo: null })
  assert.ok(!c.texto.includes('Por qué se anuló'))
})
ok('restaurado: vuelve como estaba, con el motivo', () => {
  const c = correoReporteRestaurado({ ...sobre, motivo: 'La anulación fue un error' })
  assert.match(c.asunto, /^Restauraron tu reporte/)
  assert.ok(c.texto.includes('restauró tu reporte de 2026')); assert.ok(c.texto.includes('La anulación fue un error')); sano(c)
})
ok('el texto de una persona en el motivo no abre etiquetas', () => {
  const c = correoReporteAnulado({ ...sobre, motivo: '<script>alert(1)</script> motivo largo' })
  assert.ok(!c.html.includes('<script>alert')); assert.ok(c.html.includes('&lt;script&gt;'))
})

// ─── Control Interno y apoyos ────────────────────────────────────────────────

console.log('comentario de Control Interno y copia de apoyo')
const comentario = { ...comun, comentarioId: REP, ocurridoEn: '2026-10-18T15:00:00Z', indicador: IND, anio: 2026, autor: 'JUAN PÉREZ GÓMEZ', texto: 'La meta de 2026 parece subestimada.' }
ok('comentario: a quien lleva el indicador le dice que es suyo; a la secretaría, que es de su secretaría', () => {
  const r = correoComentarioControlInterno({ ...comentario, como: 'responsable' })
  const s = correoComentarioControlInterno({ ...comentario, como: 'secretaria' })
  assert.ok(r.texto.includes('en un indicador que tienes a tu cargo')); assert.ok(s.texto.includes('en un indicador de Secretaría de Bienestar Social'))
  for (const c of [r, s]) { assert.ok(c.texto.includes('La meta de 2026 parece subestimada.')); assert.ok(c.texto.includes('Juan Pérez Gómez')); sano(c) }
  assert.notEqual(r.asunto === s.asunto && r.texto === s.texto, true)
})
ok('copia de apoyo: informativa, nombra a quien reportó y dice que no hay que hacer nada', () => {
  const c = correoReporteDeApoyo({ ...comun, reporteId: REP, enviadoEn: '2026-10-18T15:00:00Z', indicador: IND, anio: 2026, valor: 45, meta: 60, quien: 'LUCAS EDILSON MUÑOZ MORENO', texto: 'Se atendieron 45 personas.', archivos: 2, esCorreccion: false })
  for (const frase of ['Lucas Edilson Muñoz Moreno', 'que apoya el indicador que tienes a tu cargo', 'envió un reporte de 2026', 'no tienes que hacer nada', '2 archivos', '45 de 60']) assert.ok(c.texto.includes(frase), 'falta: ' + frase)
  sano(c)
  const corr = correoReporteDeApoyo({ ...comun, reporteId: REP, enviadoEn: '2026-10-18T15:00:00Z', indicador: IND, anio: 2026, valor: 45, meta: 60, quien: 'L M', texto: 'x'.repeat(30), archivos: 1, esCorreccion: true })
  assert.ok(corr.texto.includes('corrigió su reporte de 2026')); assert.ok(corr.texto.includes('1 archivo') && !corr.texto.includes('1 archivos'))
})

// ─── Cuentas de los resúmenes ────────────────────────────────────────────────

console.log('cuentas de los resúmenes')
const AHORA = new Date('2026-11-01T12:00:00Z')
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString()
type Spec = { meta: number | null; s?: SituacionAnio | null; dias?: number; autor?: string }
function ind(id: number, dep: string, specs: Partial<Record<number, Spec>>, asignado = true): Indicador {
  const anios: AnioDeIndicador[] = ANIOS_PLAN.map(a => {
    const sp = specs[a]
    return {
      anio: a, meta: sp?.meta ?? null, avance: null,
      enAnio: sp?.s ? {
        situacion: sp.s,
        reporte: sp.s === 'falta' ? null : {
          reporteId: `r${id}-${a}`, valor: 1, estado: sp.s, autorId: 'a', autorNombre: sp.autor ?? 'ANA RÍOS', creado: haceDias(sp.dias ?? 1),
          nEvidencias: 1, esCorreccion: false, validacionComentario: null, validadorNombre: null,
        },
      } : null,
    }
  })
  const v = anios.find(a => a.anio === 2026)!
  return {
    id, uuid: `u${id}`, codigo: `C${id}`, linea: 'L', sector: 'S', programa: 'P', producto: 'X', indicador: `Indicador ${id}`, unidad: 'n',
    dependencia: dep, responsable: '', asignados: asignado ? [{ usuarioId: 'x', principal: true, grupoId: null }] : [],
    lineaBase: 0, metaCuatrienio: 10, anios, anio: 2026, meta: v.meta, avance: v.avance, enAnio: v.enAnio,
  }
}
const PLAN: Indicador[] = [
  ind(1, 'Salud', { 2026: { meta: 10, s: 'pendiente', dias: 20 } }),
  ind(2, 'Salud', { 2026: { meta: 10, s: 'pendiente', dias: 45 }, 2025: { meta: 5, s: 'pendiente', dias: 200 } }),
  ind(3, 'Salud', { 2026: { meta: 10, s: 'aprobado' } }),
  ind(4, 'Salud', { 2026: { meta: 10, s: 'devuelto', dias: 3 } }),
  ind(5, 'Salud', { 2026: { meta: 10, s: 'falta' } }),
  ind(6, 'Salud', { 2026: { meta: 10 } }, false),
  ind(7, 'Educación', { 2026: { meta: 10, s: 'pendiente', dias: 5 } }),
  ind(8, 'Educación', { 2026: { meta: 10, s: 'aprobado' } }),
  ind(9, 'Cultura', { 2026: { meta: 10, s: 'falta' } }, false),
]
ok('los días se cuentan enteros y nunca salen negativos', () => {
  assert.equal(diasDesde('2026-10-30T12:00:00Z', AHORA), 2); assert.equal(diasDesde('2026-10-31T13:00:00Z', AHORA), 0)
  assert.equal(diasDesde('2026-11-05T12:00:00Z', AHORA), 0); assert.equal(diasDesde('no es fecha', AHORA), 0)
})
ok('los pendientes de todos los años, del más antiguo al más reciente', () => {
  const todos = pendientesDeValidar(PLAN, AHORA)
  assert.deepEqual(todos.map(p => [p.indicador.id, p.anio, p.dias]), [[2, 2025, 200], [2, 2026, 45], [1, 2026, 20], [7, 2026, 5]])
})
ok('por secretaría: solo los suyos', () => {
  assert.deepEqual(pendientesDeValidar(PLAN, AHORA, 'Salud').map(p => p.indicador.id), [2, 2, 1])
  assert.deepEqual(pendientesDeValidar(PLAN, AHORA, 'Educación').map(p => p.indicador.id), [7])
  assert.deepEqual(pendientesDeValidar(PLAN, AHORA, 'Cultura'), [])
  assert.deepEqual(pendientesDeValidar(PLAN, AHORA, 'No existe'), [])
})
ok('a igual antigüedad el orden es estable (código y año)', () => {
  const l = [ind(2, 'S', { 2026: { meta: 1, s: 'pendiente', dias: 10 } }), ind(1, 'S', { 2026: { meta: 1, s: 'pendiente', dias: 10 } })]
  assert.deepEqual(pendientesDeValidar(l, AHORA).map(p => p.indicador.codigo), ['C1', 'C2'])
})
ok('el botón lleva al año en curso si tiene algo esperando; si no, al más antiguo', () => {
  assert.equal(anioDelEnlace(pendientesDeValidar(PLAN, AHORA, 'Salud'), 2026), 2026)
  assert.equal(anioDelEnlace(pendientesDeValidar([ind(1, 'S', { 2025: { meta: 1, s: 'pendiente' }, 2024: { meta: 1, s: 'pendiente' } })], AHORA), 2026), 2024)
  assert.equal(anioDelEnlace([], 2026), 2026)
})
ok('el estado de la secretaría es el del tablero, ni una cifra distinta', () => {
  const e = estadoDeSecretaria(PLAN, 'Salud', 2026)
  const c = cuentaDeAnio(PLAN.filter(i => i.dependencia === 'Salud'), 2026, 2026)
  assert.deepEqual(e, { aprobados: c.aprobados, sinValidar: c.porValidar, devueltos: c.devueltos, faltanReportar: c.faltan, sinResponsable: c.sinResponsable })
  assert.deepEqual(e, { aprobados: 1, sinValidar: 2, devueltos: 1, faltanReportar: 1, sinResponsable: 1 })
})
ok('el panorama de hoy cuenta pendientes, los de más de 30 días y los indicadores sin responsable', () => {
  assert.deepEqual(panoramaDeHoy(PLAN, AHORA), { porValidar: 4, porValidarMasDe30Dias: 2, sinResponsable: 2 })
})
ok('esperando por secretaría: las más cargadas primero, con su más antiguo', () => {
  assert.deepEqual(esperandoPorSecretaria(pendientesDeValidar(PLAN, AHORA)), [
    { nombre: 'Salud', porValidar: 3, masAntiguoDias: 200 },
    { nombre: 'Educación', porValidar: 1, masAntiguoDias: 5 },
  ])
})
ok('el indicador del plan se vuelve el de los correos con la fila como identidad', () => {
  assert.deepEqual(filaDeCorreo(PLAN[0]), { fila: 1, codigo: 'C1', nombre: 'Indicador 1', unidad: 'n', dependencia: 'Salud' })
})

console.log('fechas del envío (hora de Colombia)')
ok('el mes es el de Colombia, no el de UTC', () => {
  assert.equal(mesDe(new Date('2026-11-01T12:00:00Z')), 'noviembre de 2026')
  // 1 de diciembre 03:00 UTC son las 10 p. m. del 30 de noviembre en Bogotá
  assert.equal(mesDe(new Date('2026-12-01T03:00:00Z')), 'noviembre de 2026')
})
ok('la semana de un lunes: del lunes al domingo anteriores', () => {
  assert.equal(rangoDeSemana(new Date('2026-10-19T12:00:00Z')), 'del 12 al 18 de octubre')
})
ok('la semana que cruza de mes y de año lo dice', () => {
  assert.equal(rangoDeSemana(new Date('2026-11-02T12:00:00Z')), 'del 26 de octubre al 1 de noviembre')
  assert.equal(rangoDeSemana(new Date('2027-01-04T12:00:00Z')), 'del 28 de diciembre de 2026 al 3 de enero de 2027')
})
ok('el inicio de la semana son siete días antes', () => {
  assert.equal(inicioDeSemana(new Date('2026-10-19T12:00:00Z')).toISOString(), '2026-10-12T12:00:00.000Z')
})
ok('el enlace del resumen mensual lleva el filtro y el año', () => {
  assert.equal(enlaceDePorValidar('https://app.contratistadigital.com', 2026), 'https://app.contratistadigital.com/dashboard/plan-desarrollo/indicadores?filtro=por_validar&anio=2026')
})

// ─── Los resúmenes ───────────────────────────────────────────────────────────

console.log('resúmenes')
const estadoDe = { aprobados: 12, sinValidar: 3, devueltos: 1, faltanReportar: 8, sinResponsable: 0 }
const pendientesDe = (k: number) => Array.from({ length: k }, (_, i) => ({ indicador: { ...IND, fila: i + 1, codigo: `2.${i}`, nombre: `Indicador número ${i}` }, anio: 2026, autor: 'LUCAS EDILSON MUÑOZ MORENO', dias: 30 - i }))
const mensual = (total: number, mostrados = total) => correoResumenMensual({
  ...comun, destinatario: 'SARA SÁNCHEZ VÉLEZ', mes: 'noviembre de 2026', dependencia: 'Secretaría de Bienestar Social', total, pendientes: pendientesDe(mostrados),
  anio: 2026, estado: estadoDe, enlace: 'https://app.contratistadigital.com/dashboard/plan-desarrollo/indicadores?filtro=por_validar&anio=2026',
})
ok('mensual: «Tienes N reportes por validar», el más antiguo primero, y el botón lleva a validar', () => {
  const c = mensual(3)
  assert.equal(c.asunto, 'Tienes 3 reportes por validar · noviembre de 2026')
  for (const frase of ['Sara', 'en Secretaría de Bienestar Social 3 reportes esperan tu validación', 'el más antiguo lleva 30 días', 'Del más antiguo al más reciente', 'Lucas Muñoz', 'Validar ahora', '12 aprobados', 'Faltan por reportar']) {
    assert.ok(c.html.includes(frase) && c.texto.includes(frase), 'falta: ' + frase)
  }
  assert.ok(c.texto.indexOf('Indicador número 0') < c.texto.indexOf('Indicador número 2'))
  sano(c)
})
ok('mensual con uno solo: singular', () => {
  const c = mensual(1)
  assert.equal(c.asunto, 'Tienes 1 reporte por validar · noviembre de 2026'); assert.ok(c.texto.includes('1 reporte espera tu validación'))
})
ok('mensual con muchos: se corta en diez con «y N más» y el total sigue siendo el real', () => {
  const c = mensual(37, MAX_PENDIENTES_EN_RESUMEN)
  assert.equal((c.texto.match(/Indicador número/g) ?? []).length, MAX_PENDIENTES_EN_RESUMEN)
  assert.ok(c.texto.includes('y 27 más')); assert.ok(c.asunto.startsWith('Tienes 37 reportes'))
  assert.ok(!/y 0 más/.test(mensual(10).texto) && !/\by \d+ más\b/.test(mensual(10).texto))
})
ok('mensual: el pie dice que llega una vez al mes y solo si hay reportes', () => {
  assert.ok(mensual(2).texto.includes('una vez al mes, y solo si hay reportes esperando'))
})
const semanal = (semana: { reportados: number; aprobados: number; devueltos: number; anulados: number }, extra: Partial<Parameters<typeof correoResumenSemanal>[0]> = {}) => correoResumenSemanal({
  ...comun, destinatario: 'ADMINISTRADOR', rango: 'del 12 al 18 de octubre', semana, hoy: { porValidar: 4, porValidarMasDe30Dias: 1, sinResponsable: 31 },
  sinAcceso: { total: 23, nombres: ['Ana Ríos', 'Luis Mora'] }, porSecretaria: [{ nombre: 'Salud', porValidar: 3, masAntiguoDias: 200 }], ...extra,
})
ok('semanal con movimiento: cifras de la semana, lo que necesita atención y a quién habilitar', () => {
  const c = semanal({ reportados: 5, aprobados: 3, devueltos: 1, anulados: 1 })
  assert.equal(c.asunto, 'Resumen semanal del Plan de Desarrollo · del 12 al 18 de octubre')
  for (const frase of ['Esto pasó en el Plan de Desarrollo del 12 al 18 de octubre', 'Reportes enviados: 5', 'Anulados: 1', 'Esperan validación: 4', '1 llevan más de 30 días', 'Y esto es lo que necesita atención hoy', 'Sin responsable: 31', 'Sin acceso: 23', 'Ana Ríos', 'y 21 más', 'el más antiguo, 200 días']) {
    assert.ok(c.texto.includes(frase), 'falta: ' + frase)
  }
  sano(c)
})
ok('semanal sin movimiento: lo dice, y no lista «Anulados: 0»', () => {
  const c = semanal({ reportados: 0, aprobados: 0, devueltos: 0, anulados: 0 })
  assert.ok(c.texto.includes('No hubo reportes ni validaciones del 12 al 18 de octubre')); assert.ok(!c.texto.includes('Anulados')); assert.ok(!c.texto.includes('Reportes enviados: 0'), 'sin tabla de ceros')
})
ok('semanal sin nadie esperando ni sin acceso: no abre bloques vacíos', () => {
  const c = semanal({ reportados: 1, aprobados: 0, devueltos: 0, anulados: 0 }, { porSecretaria: [], sinAcceso: { total: 0, nombres: [] }, hoy: { porValidar: 0, porValidarMasDe30Dias: 0, sinResponsable: 0 } })
  assert.ok(!c.texto.includes('Esperan validación, por secretaría')); assert.ok(!c.texto.includes('Sin acceso al módulo')); assert.ok(!c.texto.includes('llevan más de 30'))
})

console.log(`\n${n} pruebas correctas`)
