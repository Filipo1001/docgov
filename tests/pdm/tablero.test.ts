import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { armarIndicadores } from '@/lib/pdm/datos-armar'
import { cuentaDeAnio } from '@/lib/pdm/graficos'
import type { AnioDeIndicador, Indicador } from '@/lib/pdm/plan'
import type { PersonaDirectorio } from '@/lib/pdm/personas'
import { ANIOS_PLAN, type SituacionAnio } from '@/lib/pdm/seguimiento'
import {
  atencionDe, centroDeAnillo, cifrasDeCuenta, cifrasDeFila, comparacionDelAnio, equipoDe, etiquetaDeSemana, filtrarEquipo, lecturaDelTablero,
  lunesDe, ordenarPorTamano, pctEntero, sectoresDe, secretariasDeFilas, semanasDeRitmo, sinAvanceDe, sinCifras, sumarCifras, techoDelEje,
  textoDeFila, tamanoDe, type CifrasDeAnio, type FilaDeCifras, type Trozo,
} from '@/lib/pdm/tablero'

const cifras = (o: Partial<CifrasDeAnio> = {}): CifrasDeAnio => ({ ...sinCifras(2026), conMeta: 10, ...o })
const texto = (t: Trozo[]) => t.map(x => x.texto).join('')

// ─── De la base a las cifras ──────────────────────────────────────────────────

test('una fila de la base se vuelve las cifras de un año, y lo que no es un número es cero (nunca NaN)', () => {
  const f: FilaDeCifras = { dependencia: 'X', anio: 2026, con_meta: 62, aprobados: 21, por_validar: 9, devueltos: 3, faltan: 24, sin_responsable: 5, alcanzaron: 17, parciales: 4, con_avance: 21 }
  assert.deepEqual(cifrasDeFila(f), { anio: 2026, conMeta: 62, aprobados: 21, porValidar: 9, devueltos: 3, faltan: 24, sinResponsable: 5, alcanzaron: 17, parciales: 4, conAvance: 21 })
  const rota = cifrasDeFila({ ...f, con_meta: 'x' as never, aprobados: null as never, por_validar: -3, devueltos: undefined as never })
  assert.equal(rota.conMeta, 0); assert.equal(rota.aprobados, 0); assert.equal(rota.porValidar, 0); assert.equal(rota.devueltos, 0)
  assert.equal(cifrasDeFila({ ...f, con_meta: '62' as never }).conMeta, 62, 'los números como texto (numeric de la base) se leen')
})

test('sumar las cifras de varias secretarías suma cada campo y deja el año que se pide', () => {
  const s = sumarCifras(2026, [cifras({ conMeta: 10, aprobados: 3, alcanzaron: 2, conAvance: 3 }), cifras({ conMeta: 5, aprobados: 1, alcanzaron: 1, conAvance: 1, faltan: 4 })])
  assert.equal(s.anio, 2026); assert.equal(s.conMeta, 15); assert.equal(s.aprobados, 4); assert.equal(s.alcanzaron, 3); assert.equal(s.conAvance, 4); assert.equal(s.faltan, 4)
  assert.deepEqual(sumarCifras(2025, []), sinCifras(2025))
})

test('«sin avance» es lo que no llegó a la meta ni va en avance, y nunca sale negativo', () => {
  assert.equal(sinAvanceDe(cifras({ conMeta: 62, alcanzaron: 11, parciales: 11 })), 40)
  assert.equal(sinAvanceDe(cifras({ conMeta: 2, alcanzaron: 2, parciales: 1 })), 0)
})

test('el porcentaje no redondea hacia un extremo que no es cierto', () => {
  assert.equal(pctEntero(0, 10), 0); assert.equal(pctEntero(10, 10), 100); assert.equal(pctEntero(1, 1000), 1, 'lo poco no es «0»')
  assert.equal(pctEntero(996, 1000), 99, '99,6 no es «100»'); assert.equal(pctEntero(1, 3), 33); assert.equal(pctEntero(5, 0), 0)
})

// ─── La paridad con el tablero actual ─────────────────────────────────────────

test('la función de la base y el cálculo del módulo dan las MISMAS cifras (datos exportados por supabase/tests/pdm_cifras.sql)', () => {
  const d = JSON.parse(readFileSync(new URL('./fixtures/paridad-cifras.json', import.meta.url), 'utf8'))
  const lista = armarIndicadores(d.indicadores, d.metas, d.asignaciones, { anioActual: d.anioActual, avances: d.avances, vigentes: d.vigentes } as never)
  let comparados = 0
  for (const a of ANIOS_PLAN) {
    const ts = cifrasDeCuenta(cuentaDeAnio(lista, a, d.anioActual))
    const sql = d.cifras.find((c: FilaDeCifras) => Number(c.anio) === a)
    assert.ok(sql, `falta la fila SQL de ${a}`)
    assert.deepEqual(ts, cifrasDeFila(sql), `el año ${a} difiere entre TypeScript y SQL`)
    comparados++
  }
  assert.equal(comparados, ANIOS_PLAN.length)
  // El escenario cubre lo que importa: avance validado con el último reporte devuelto, sin responsable, falta y año que no empieza.
  const y26 = cifrasDeCuenta(cuentaDeAnio(lista, 2026, d.anioActual))
  assert.deepEqual([y26.devueltos, y26.alcanzaron, y26.sinResponsable], [1, 1, 1])
})

// ─── Cómo se dice una cifra ───────────────────────────────────────────────────

test('cumplimiento: porcentaje, cifra con pocas metas, y «—» sin avances validados (nunca «0 %»)', () => {
  assert.deepEqual(textoDeFila(cifras({ conMeta: 62, alcanzaron: 11, parciales: 11, conAvance: 22 }), 'cumplimiento'), { valor: '18 %', nota: 'cumplido' })
  assert.deepEqual(textoDeFila(cifras({ conMeta: 2, alcanzaron: 1, conAvance: 2 }), 'cumplimiento'), { valor: '1 de 2', nota: 'pocas metas' })
  assert.deepEqual(textoDeFila(cifras({ conMeta: 92, conAvance: 0 }), 'cumplimiento'), { valor: '—', nota: 'sin avances validados' })
  assert.deepEqual(textoDeFila(cifras({ conMeta: 0 }), 'cumplimiento'), { valor: '—', nota: '' })
  // Con avance validado pero ninguna meta alcanzada, el 0 % SÍ se dice: hay algo medido.
  assert.deepEqual(textoDeFila(cifras({ conMeta: 20, alcanzaron: 0, parciales: 3, conAvance: 3 }), 'cumplimiento'), { valor: '0 %', nota: 'cumplido' })
})

test('reportes: porcentaje aprobado, y «—» mientras nadie haya reportado', () => {
  assert.deepEqual(textoDeFila(cifras({ conMeta: 62, aprobados: 22, porValidar: 7 }), 'reportes'), { valor: '35 %', nota: 'aprobado' })
  assert.deepEqual(textoDeFila(cifras({ conMeta: 62, faltan: 55, sinResponsable: 7 }), 'reportes'), { valor: '—', nota: 'sin reportes' })
  assert.deepEqual(textoDeFila(cifras({ conMeta: 2, aprobados: 1, porValidar: 1 }), 'reportes'), { valor: '1 de 2', nota: 'pocas metas' })
})

test('el centro del anillo es el % cumplido, o nada si ningún indicador tiene un avance validado', () => {
  assert.deepEqual(centroDeAnillo(cifras({ conMeta: 62, alcanzaron: 11, conAvance: 22 })), { pct: 18 })
  assert.deepEqual(centroDeAnillo(cifras({ conMeta: 62, conAvance: 0 })), { pct: null })
  assert.deepEqual(centroDeAnillo(cifras({ conMeta: 0 })), { pct: null })
})

// ─── Las secretarías: orden y comparación ─────────────────────────────────────

const fila = (dependencia: string, anio: number, con_meta: number, extra: Partial<FilaDeCifras> = {}): FilaDeCifras => ({
  dependencia, anio, con_meta, aprobados: 0, por_validar: 0, devueltos: 0, faltan: 0, sin_responsable: 0, alcanzaron: 0, parciales: 0, con_avance: 0, ...extra,
})
const FILAS: FilaDeCifras[] = [
  fila('Bienestar', 2024, 84), fila('Bienestar', 2025, 93), fila('Bienestar', 2026, 92),
  fila('Territorial', 2024, 56), fila('Territorial', 2025, 76), fila('Territorial', 2026, 65),
  fila('Gobierno', 2024, 63), fila('Gobierno', 2025, 63), fila('Gobierno', 2026, 62),
  fila('Hacienda', 2025, 2, { faltan: 2 }), fila('Hacienda', 2026, 2, { faltan: 1, aprobados: 1, alcanzaron: 1, con_avance: 1 }),
]

test('las secretarías se ordenan por TAMAÑO sumado en los años del plan, y el orden no cambia con el año', () => {
  const orden = ordenarPorTamano(secretariasDeFilas(FILAS)).map(s => s.nombre)
  assert.deepEqual(orden, ['Bienestar', 'Territorial', 'Gobierno', 'Hacienda'])
  // Con otro avance, el mismo orden: no se ordena por avance.
  const otras = FILAS.map(f => (f.dependencia === 'Hacienda' ? { ...f, alcanzaron: 2, con_avance: 2, aprobados: 2 } : f))
  assert.deepEqual(ordenarPorTamano(secretariasDeFilas(otras)).map(s => s.nombre), orden)
})

test('a igual tamaño se ordena por nombre; un año sin fila queda en ceros y no se inventa nada', () => {
  const s = secretariasDeFilas([fila('Zeta', 2026, 5), fila('Alfa', 2026, 5)])
  assert.deepEqual(ordenarPorTamano(s).map(x => x.nombre), ['Alfa', 'Zeta'])
  const hacienda = secretariasDeFilas(FILAS).find(x => x.nombre === 'Hacienda')!
  assert.deepEqual(hacienda.porAnio[2024], sinCifras(2024))
  assert.equal(tamanoDe(hacienda), 4)
})

test('la comparación pone la cifra PROPIA de la lista de la sesión y no repite a la propia secretaría', () => {
  const secs = secretariasDeFilas(FILAS)
  const propia = cifras({ anio: 2026, conMeta: 62, alcanzaron: 11, conAvance: 22 })
  const c = comparacionDelAnio(secs, { nombre: 'Gobierno', cifras: propia }, 2026)
  assert.equal(c.length, 4)
  assert.equal(c.filter(x => x.propia).length, 1)
  assert.equal(c.find(x => x.propia)!.nombre, 'Gobierno')
  assert.equal(c.find(x => x.propia)!.cifras, propia, 'es la misma cifra que muestra «Tu secretaría»')
  assert.equal(c.filter(x => x.nombre === 'Gobierno').length, 1)
  assert.equal(c.find(x => x.nombre === 'Bienestar')!.cifras.conMeta, 92)
  const sinFila = comparacionDelAnio(secs, { nombre: 'Gobierno', cifras: { ...propia, anio: 2027 } }, 2027)
  assert.ok(sinFila.every(x => x.cifras.anio === 2027), 'las otras secretarías, sin fila en 2027, salen en ceros de ese año')
})

// ─── Los sectores ─────────────────────────────────────────────────────────────

type Spec = { meta: number | null; avance?: number | null; s?: SituacionAnio | null }
function ind(id: number, sector: string, specs: Partial<Record<number, Spec>>): Indicador {
  const anios: AnioDeIndicador[] = ANIOS_PLAN.map(a => {
    const sp = specs[a]
    return { anio: a, meta: sp?.meta ?? null, avance: sp?.avance ?? null, enAnio: sp?.s ? { situacion: sp.s, reporte: null } : null }
  })
  const v = anios.find(a => a.anio === 2026)!
  return {
    id, uuid: `u${id}`, codigo: `C${id}`, linea: 'L', sector, programa: 'P', producto: 'X', indicador: `I${id}`, unidad: 'n', dependencia: 'D',
    responsable: '', asignados: [{ usuarioId: id % 2 ? 'ana' : 'beto', principal: true, grupoId: null }], lineaBase: 0, metaCuatrienio: 10, anios,
    anio: 2026, meta: v.meta, avance: v.avance, enAnio: v.enAnio,
  }
}

test('los sectores van por tamaño (suma de años) y, a igual tamaño, por nombre', () => {
  const lista = [
    ind(1, 'Salud', { 2026: { meta: 5, s: 'falta' } }), ind(2, 'Salud', { 2026: { meta: 5, s: 'falta' } }),
    ind(3, 'Agua', { 2026: { meta: 5, s: 'falta' } }), ind(4, 'Agua', { 2026: { meta: 5, s: 'falta' }, 2025: { meta: 5, s: 'falta' } }),
    ind(5, 'Cultura', { 2026: { meta: 5, s: 'falta' } }),
  ]
  const s = sectoresDe(lista, 2026, 2026)
  assert.deepEqual(s.map(x => x.nombre), ['Agua', 'Salud', 'Cultura'], 'Agua pesa más (3 metas en dos años), Salud 2, Cultura 1')
  assert.equal(s[0].cifras.conMeta, 2)
  assert.equal(s[0].cifras.faltan, 2)
})

// ─── La frase de lectura ──────────────────────────────────────────────────────

test('lectura: un año que no ha empezado dice cuándo empieza', () => {
  const l = lecturaDelTablero(cifras({ anio: 2027, conMeta: 62 }), 2026, null)
  assert.equal(texto(l.titular), 'El 2027 empieza el 1 de enero de 2027.')
  assert.match(l.detalle, /Sus 62 indicadores con meta se podrán reportar/)
})

test('lectura: sin avances validados no habla de cumplimiento y dice qué hacer primero', () => {
  const l = lecturaDelTablero(cifras({ conMeta: 62, sinResponsable: 7, faltan: 55 }), 2026, null)
  assert.equal(texto(l.titular), 'En 2026 todavía no hay avances validados. Tu secretaría tiene 62 indicadores con meta: 7 sin responsable y 55 por reportar.')
  assert.match(l.detalle, /Lo primero: repartir los 7 indicadores sin responsable/)
  assert.ok(l.titular.filter(x => x.fuerte).map(x => x.texto).includes('62'), 'las cifras van en negrilla')
  assert.doesNotMatch(texto(l.titular), /0 %/)
})

test('lectura: con avances dice cuántos alcanzaron la meta, lo que espera validación y su antigüedad', () => {
  const l = lecturaDelTablero(cifras({ conMeta: 62, alcanzaron: 11, parciales: 11, conAvance: 22, aprobados: 22, porValidar: 7, devueltos: 2, sinResponsable: 7, faltan: 24 }), 2026, 18)
  assert.equal(texto(l.titular), 'En 2026, 11 de 62 indicadores con meta ya la alcanzaron. Tienes 7 reportes por validar, el más antiguo desde hace 18 días.')
  assert.equal(l.detalle, '2 reportes devueltos esperan corrección; 7 indicadores no tienen responsable; faltan 24 indicadores por reportar.')
})

test('lectura: singulares, sin reportes por validar, y un año cerrado dice «quedaron»', () => {
  const uno = lecturaDelTablero(cifras({ conMeta: 5, alcanzaron: 1, conAvance: 1, aprobados: 1, porValidar: 1, devueltos: 1, faltan: 1 }), 2026, 1)
  assert.match(texto(uno.titular), /1 de 5 indicadores con meta ya la alcanzó\. Tienes 1 reporte por validar, el más antiguo desde hace 1 día\./)
  assert.equal(uno.detalle, '1 reporte devuelto espera corrección; falta 1 indicador por reportar.')
  const ninguno = lecturaDelTablero(cifras({ anio: 2025, conMeta: 63, alcanzaron: 30, conAvance: 40, aprobados: 40, faltan: 23 }), 2026, null)
  assert.match(texto(ninguno.titular), /No tienes reportes por validar\./)
  assert.match(ninguno.detalle, /Quedaron 23 indicadores por reportar/)
  assert.equal(lecturaDelTablero(cifras({ conMeta: 0 }), 2026, null).detalle, '')
})

// ─── Lo que necesita atención ─────────────────────────────────────────────────

test('la atención va SIEMPRE en el mismo orden y dice «al día» cuando no hay nada', () => {
  const con = atencionDe(cifras({ porValidar: 7, sinResponsable: 7, devueltos: 2, faltan: 24 }), 18, 2)
  assert.deepEqual(con.map(x => x.clave), ['porValidar', 'sinResponsable', 'sinAcceso', 'devueltos', 'faltan'])
  assert.deepEqual(con.map(x => x.cantidad), [7, 7, 2, 2, 24])
  assert.match(con[0].ayuda, /El más antiguo lleva 18 días esperando/)
  const nada = atencionDe(cifras(), null, 0)
  assert.deepEqual(nada.map(x => x.clave), ['porValidar', 'sinResponsable', 'sinAcceso', 'devueltos', 'faltan'], 'el orden no depende de las cifras')
  assert.ok(nada.every(x => x.cantidad === 0))
  assert.equal(nada[0].ayuda, 'Nada espera tu validación.')
  assert.match(atencionDe(cifras({ porValidar: 1 }), 1, 0)[0].ayuda, /1 día esperando/)
})

// ─── Las semanas ──────────────────────────────────────────────────────────────

test('la semana empieza el lunes, también al cruzar de mes y de año', () => {
  assert.equal(lunesDe('2026-10-19'), '2026-10-19', 'un lunes es su propia semana')
  assert.equal(lunesDe('2026-10-18'), '2026-10-12', 'el domingo cierra la semana anterior')
  assert.equal(lunesDe('2026-11-01'), '2026-10-26', 'cruza de mes')
  assert.equal(lunesDe('2027-01-01'), '2026-12-28', 'cruza de año')
  assert.equal(lunesDe('2026-10-15'), '2026-10-12')
})

test('las semanas se llenan sin huecos y lo que cae fuera del rango se descarta', () => {
  const s = semanasDeRitmo([
    { semana: '2026-10-12', enviados: 3, aprobados: 1 }, { semana: '2026-10-26', enviados: 5, aprobados: 4 },
    { semana: '2026-01-05', enviados: 9, aprobados: 9 }, { semana: '2027-03-01', enviados: 9, aprobados: 9 },
  ], '2026-10-15', '2026-11-04')
  assert.deepEqual(s.map(x => x.semana), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'])
  assert.deepEqual(s.map(x => x.enviados), [3, 0, 5, 0])
  assert.deepEqual(s.map(x => x.aprobados), [1, 0, 4, 0])
  assert.equal(semanasDeRitmo([], '2026-10-19', '2026-10-19').length, 1, 'la misma semana es una semana')
  assert.deepEqual(semanasDeRitmo([{ semana: '2026-10-12T05:00:00+00:00', enviados: 2, aprobados: 0 }], '2026-10-12', '2026-10-12')[0], { semana: '2026-10-12', enviados: 2, aprobados: 0 })
})

test('etiqueta de semana y tope del eje', () => {
  assert.equal(etiquetaDeSemana('2026-10-19'), '19 oct'); assert.equal(etiquetaDeSemana('2026-12-07'), '7 dic'); assert.equal(etiquetaDeSemana('2026-01-05'), '5 ene')
  assert.deepEqual(techoDelEje(0), { techo: 2, marcas: [0, 1, 2] })
  assert.deepEqual(techoDelEje(6), { techo: 6, marcas: [0, 3, 6] })
  assert.deepEqual(techoDelEje(7), { techo: 8, marcas: [0, 4, 8] })
  assert.deepEqual(techoDelEje(14), { techo: 15, marcas: [0, 7.5, 15] })
  assert.ok(techoDelEje(137).techo >= 137)
})

// ─── El equipo ────────────────────────────────────────────────────────────────

const persona = (id: string, nombre: string, acceso: boolean, rol = 'contratista'): PersonaDirectorio => ({
  id, nombre, rol, fotoUrl: null, secretaria: 'D', contrato: {} as never, excel: null, indicadores: 0, resumen: null,
  acceso: acceso ? { nivel: 'responsable', por: null, desde: '2026-10-01' } : null,
})

test('el equipo va por nombre, mide gestión y marca a quien no puede entrar (menos al administrador)', () => {
  const lista = [ind(1, 'S', { 2026: { meta: 5, s: 'falta' } }), ind(2, 'S', { 2026: { meta: 5, s: 'devuelto' } }), ind(3, 'S', { 2026: { meta: 5, s: 'aprobado' } }), ind(4, 'S', { 2026: { meta: 5, s: 'pendiente' } })]
  lista[2].asignados = [{ usuarioId: 'adm', principal: true, grupoId: null }]
  const personas = [persona('beto', 'Beto Zea', false), persona('ana', 'Ana Ríos', true), persona('adm', 'Administrador', false, 'admin'), persona('nadie', 'Sin indicadores', true)]
  const eq = equipoDe(lista, personas, 2026, 2026)
  assert.deepEqual(eq.map(p => p.nombre), ['Administrador', 'Ana Ríos', 'Beto Zea'], 'por nombre; quien no tiene indicadores no figura')
  const ana = eq.find(p => p.id === 'ana')!, beto = eq.find(p => p.id === 'beto')!, adm = eq.find(p => p.id === 'adm')!
  // `ind` le da los impares a Ana y los pares a Beto (3 se reasigna al administrador): Ana tiene el 1 (falta); Beto el 2 (devuelto) y el 4 (sin validar).
  assert.deepEqual([ana.indicadores, ana.porReportar, ana.devueltos, ana.porValidar, ana.sinAcceso], [1, 1, 0, 0, false])
  assert.deepEqual([beto.indicadores, beto.porReportar, beto.devueltos, beto.porValidar, beto.sinAcceso], [2, 0, 1, 1, true])
  assert.equal(adm.sinAcceso, false, 'el administrador no necesita acceso al módulo')
  assert.deepEqual(filtrarEquipo(eq, 'sin_acceso').map(p => p.id), ['beto'])
  assert.deepEqual(filtrarEquipo(eq, 'pendientes').map(p => p.id), ['ana', 'beto'], 'con algo por reportar o devuelto')
  assert.equal(filtrarEquipo(eq, 'todos').length, 3)
})
