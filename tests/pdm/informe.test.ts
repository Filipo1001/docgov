import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SECTORES_EN_INFORME, armarInforme, inicialesDe, lecturaDelPlan, nombreDeArchivoDelInforme } from '@/lib/pdm/informe'
import type { AnioDeIndicador, Indicador } from '@/lib/pdm/plan'
import type { PersonaDirectorio } from '@/lib/pdm/personas'
import { ANIOS_PLAN, type SituacionAnio } from '@/lib/pdm/seguimiento'
import { datosDelTablero, sinCifras, type FilaDeCifras } from '@/lib/pdm/tablero'

// Las mismas cuentas del tablero, reunidas para imprimir: aquí se prueba lo que el informe LLEVA y lo que no.

type Spec = { meta: number | null; avance?: number | null; s?: SituacionAnio | null }
function ind(id: number, dueno: string, specs: Partial<Record<number, Spec>>): Indicador {
  const anios: AnioDeIndicador[] = ANIOS_PLAN.map(a => {
    const sp = specs[a]
    return { anio: a, meta: sp?.meta ?? null, avance: sp?.avance ?? null, enAnio: sp?.s ? { situacion: sp.s, reporte: null } : null }
  })
  const v = anios.find(a => a.anio === 2026)!
  return {
    id, uuid: `u${id}`, codigo: `C${id}`, linea: 'L', sector: 'Salud', programa: 'P', producto: 'X', indicador: `I${id}`, unidad: 'n', dependencia: 'Gobierno',
    responsable: '', asignados: [{ usuarioId: dueno, principal: true, grupoId: null }], lineaBase: 0, metaCuatrienio: 10, anios,
    anio: 2026, meta: v.meta, avance: v.avance, enAnio: v.enAnio,
  }
}
const persona = (id: string, nombre: string, acceso: boolean): PersonaDirectorio => ({
  id, nombre, rol: 'contratista', fotoUrl: null, secretaria: 'Gobierno', contrato: {} as never, excel: null, indicadores: 0, resumen: null,
  acceso: acceso ? { nivel: 'responsable', por: null, desde: '2026-10-01' } : null,
})
const fila = (dependencia: string, anio: number, con_meta: number, extra: Partial<FilaDeCifras> = {}): FilaDeCifras => ({
  dependencia, anio, con_meta, aprobados: 0, por_validar: 0, devueltos: 0, faltan: 0, sin_responsable: 0, alcanzaron: 0, parciales: 0, con_avance: 0, ...extra,
})

const LISTA = [
  ind(1, 'zoila', { 2026: { meta: 5, avance: 5, s: 'aprobado' } }),
  ind(2, 'ana', { 2026: { meta: 5, s: 'falta' } }),
  ind(3, 'ana', { 2026: { meta: 5, s: 'devuelto' } }),
]
const PERSONAS = [persona('zoila', 'Zoila Mejía', true), persona('ana', 'Ana Ríos', false)]
const DATOS = datosDelTablero({
  secretaria: 'Gobierno', indicadores: LISTA, filasDeCifras: [fila('Bienestar', 2026, 90), fila('Hacienda', 2026, 2)], filasDeRitmo: null,
  anioActual: 2026, ahora: new Date('2026-10-19T12:00:00Z'), hoy: '2026-10-19', corte: 'lunes 19 de octubre de 2026',
})
const pedir = (o: Partial<Parameters<typeof armarInforme>[0]> = {}) => armarInforme({
  datos: DATOS, indicadores: LISTA, personas: PERSONAS, personasLeidas: true, anio: 2026, medida: 'cumplimiento', conEquipo: false, ...o,
})

test('por defecto el informe NO lleva a nadie por su nombre', () => {
  const i = pedir()
  assert.equal(i.equipo, null)
  assert.doesNotMatch(JSON.stringify(i), /Zoila|Ana Ríos/, 'ni en el equipo ni en ninguna otra parte')
})

test('con el equipo pedido lleva a las personas por nombre y sin identificadores', () => {
  const i = pedir({ conEquipo: true })
  assert.deepEqual(i.equipo!.map(p => p.nombre), ['Ana Ríos', 'Zoila Mejía'], 'por nombre, no por avance')
  const ana = i.equipo!.find(p => p.nombre === 'Ana Ríos')!
  assert.deepEqual([ana.indicadores, ana.porReportar, ana.devueltos, ana.sinAcceso], [2, 1, 1, true])
  assert.ok(i.equipo!.every(p => !('id' in p)), 'solo lo que se imprime: el identificador de la persona no sale del servidor en el documento')
})

test('si el directorio no se pudo leer, el informe no dice «sin acceso» ni trae un equipo vacío', () => {
  const i = pedir({ conEquipo: true, personasLeidas: false, personas: [] })
  assert.equal(i.equipo, null)
  assert.ok(!i.atencion.some(x => x.clave === 'sinAcceso'))
  assert.ok(pedir({ conEquipo: false }).atencion.some(x => x.clave === 'sinAcceso'), 'y con el directorio leído sí lo cuenta')
})

test('las cifras del informe son las del tablero: la propia secretaría, el plan sumado y las otras por tamaño', () => {
  const i = pedir()
  assert.equal(i.cifras.conMeta, 3); assert.equal(i.cifras.alcanzaron, 1); assert.equal(i.cifras.devueltos, 1); assert.equal(i.cifras.faltan, 1)
  assert.deepEqual(i.comparacion!.map(f => f.nombre), ['Bienestar', 'Gobierno', 'Hacienda'], 'por tamaño (90, 3 y 2), con la propia dentro')
  assert.equal(i.comparacion!.filter(f => f.propia).length, 1)
  assert.equal(i.plan!.conMeta, 90 + 2 + 3, 'el plan es la suma de las secretarías del año')
  assert.equal(i.secretaria, 'Gobierno'); assert.equal(i.corte, 'lunes 19 de octubre de 2026'); assert.equal(i.anio, 2026)
})

test('los sectores van por tamaño, hasta los que caben en la hoja, y dice cuántos hay en total', () => {
  const muchos = Array.from({ length: SECTORES_EN_INFORME + 3 }, (_, k) => ({ ...ind(100 + k, 'ana', { 2026: { meta: 5, s: 'falta' } }), sector: `Sector ${String(k).padStart(2, '0')}` }))
  const i = pedir({ indicadores: muchos })
  assert.equal(i.sectores.length, SECTORES_EN_INFORME)
  assert.equal(i.sectoresTotal, SECTORES_EN_INFORME + 3)
  assert.deepEqual(i.sectores.map(x => x.nombre), muchos.slice(0, SECTORES_EN_INFORME).map(x => x.sector), 'a igual tamaño, por nombre')
  assert.equal(pedir().sectoresTotal, 1)
})

test('sin las otras secretarías el informe sigue siendo de la propia: no hay comparación ni plan, y no se inventan', () => {
  const sin = armarInforme({ datos: { ...DATOS, otras: null }, indicadores: LISTA, personas: PERSONAS, personasLeidas: true, anio: 2026, medida: 'reportes', conEquipo: false })
  assert.equal(sin.comparacion, null); assert.equal(sin.plan, null)
  assert.equal(sin.cifras.conMeta, 3); assert.equal(sin.medida, 'reportes')
})

test('un año sin metas da un informe en ceros, no un error', () => {
  const i = pedir({ anio: 2027 })
  assert.deepEqual(i.cifras, { ...sinCifras(2027) })
  assert.match(i.lectura.titular.map(t => t.texto).join(''), /2027/)
})

test('lo que el informe dice del plan: la frase, o por qué todavía no hay cifra', () => {
  const plan = (o: object) => ({ ...sinCifras(2026), conMeta: 95, ...o })
  assert.equal(lecturaDelPlan(plan({ alcanzaron: 12, conAvance: 20 })), '12 de 95 indicadores con meta del plan ya la alcanzaron.')
  assert.equal(lecturaDelPlan(plan({ alcanzaron: 1, conAvance: 1 })), '1 de 95 indicadores con meta del plan ya la alcanzó.')
  assert.equal(lecturaDelPlan(plan({})), 'Todavía no hay avances validados en el plan: 95 indicadores con meta en 2026.')
  assert.equal(lecturaDelPlan(plan({ conMeta: 0 })), 'En 2026 ningún indicador del plan tiene meta.')
})

test('el nombre del archivo no lleva tildes ni signos, y las iniciales son dos letras como mucho', () => {
  assert.equal(nombreDeArchivoDelInforme('Secretaría General de Gobierno', 2026), 'tablero-secretaria-general-de-gobierno-2026.pdf')
  assert.equal(nombreDeArchivoDelInforme('  ¡¿?!  ', 2026), 'tablero-secretaria-2026.pdf')
  assert.equal(inicialesDe('Ana María Ríos'), 'AR'); assert.equal(inicialesDe('Zoila'), 'Z'); assert.equal(inicialesDe('  '), '?')
  assert.equal(inicialesDe('óscar peña'), 'ÓP')
})
