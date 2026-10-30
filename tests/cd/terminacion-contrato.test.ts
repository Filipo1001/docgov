import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CAUSALES_TERMINACION,
  diaAnterior,
  diasComerciales,
  fechaLarga,
  planDeTerminacion,
  puedeGestionarTerminacion,
  valorProporcional,
  type PeriodoParaTerminar,
} from '@/lib/terminacion-contrato'
import { informePresentado } from '@/lib/constants'

const raiz = new URL('../../', import.meta.url).pathname
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8')

// El contrato de la prueba SQL (supabase/tests/terminacion_anticipada.sql): julio a diciembre, con el ciclo en marcha.
const contrato = { fecha_inicio: '2026-07-01', fecha_fin: '2026-12-31', valor_mensual: 3_000_000 }
const periodo = (n: number, mes: string, ini: string, fin: string, estado: string, extra: Partial<PeriodoParaTerminar> = {}): PeriodoParaTerminar => ({
  id: `p${n}`, numero_periodo: n, mes, anio: 2026, fecha_inicio: ini, fecha_fin: fin, valor_cobro: 3_000_000, estado, es_historico: false, ...extra,
})
const periodos = [
  periodo(1, 'Julio', '2026-07-01', '2026-07-31', 'radicado'),
  periodo(2, 'Agosto', '2026-08-01', '2026-08-31', 'aprobado'),
  periodo(3, 'Septiembre', '2026-09-01', '2026-09-30', 'enviado'),
  periodo(4, 'Octubre', '2026-10-01', '2026-10-31', 'borrador'),
  periodo(5, 'Noviembre', '2026-11-01', '2026-11-30', 'borrador'),
  periodo(6, 'Diciembre', '2026-12-01', '2026-12-31', 'rechazado'),
]
const meses = (ps: PeriodoParaTerminar[]) => ps.map(p => p.mes)

// ─── Las causales: la misma lista en la aplicación y en la base ──────────────

test('las causales y sus nombres son los mismos que en la base (la última migración que define terminacion_causal_nombre)', () => {
  const migraciones = readdirSync(join(raiz, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()
  const ultima = migraciones.filter(f => leer(`supabase/migrations/${f}`).includes('function public.terminacion_causal_nombre')).at(-1)
  assert.ok(ultima, 'ninguna migración define terminacion_causal_nombre')
  const sql = leer(`supabase/migrations/${ultima}`)
  const cuerpo = sql.slice(sql.indexOf('function public.terminacion_causal_nombre'), sql.indexOf('$f$;', sql.indexOf('function public.terminacion_causal_nombre')))
  const enLaBase = [...cuerpo.matchAll(/when '([a-z_]+)'\s+then '([^']+)'/g)].map(m => [m[1], m[2]])
  assert.deepEqual(enLaBase, CAUSALES_TERMINACION.map(c => [c.id, c.nombre]))
})

test('«Otra causal» es la única sin norma, y todas dicen con qué acto se formalizan', () => {
  assert.deepEqual(CAUSALES_TERMINACION.filter(c => !c.norma).map(c => c.id), ['otra'])
  for (const c of CAUSALES_TERMINACION) assert.ok(c.acto === 'acta' || c.acto === 'resolución', c.id)
})

// ─── Fechas y valor ──────────────────────────────────────────────────────────

test('los días se cuentan en meses de 30: del 1 al 15 son 15 en cualquier mes, y el último día del mes cuenta como el 30', () => {
  assert.equal(diasComerciales('2026-10-01', '2026-10-15'), 15)
  assert.equal(diasComerciales('2026-02-01', '2026-02-15'), 15, 'febrero también')
  assert.equal(diasComerciales('2026-09-10', '2026-09-20'), 11, 'un primer periodo que empezó a mitad de mes')
  assert.equal(diasComerciales('2026-02-01', '2026-02-28'), 30, 'febrero completo')
  assert.equal(diasComerciales('2026-10-01', '2026-10-31'), 30, 'un mes de 31 días')
  assert.equal(diasComerciales('2026-10-01', '2026-10-01'), 1)
})

test('el valor propuesto es el proporcional del valor mensual, nunca más que el periodo completo', () => {
  assert.equal(valorProporcional(3_000_000, 3_000_000, 15), 1_500_000)
  assert.equal(valorProporcional(2_000_000, 2_000_000, 11), 733_333, 'se redondea al peso')
  assert.equal(valorProporcional(3_000_000, 1_000_000, 20), 1_000_000, 'un último periodo con residuo menor: no se pasa')
  assert.equal(valorProporcional(0, 900_000, 10), 300_000, 'sin valor mensual, se parte del valor del periodo')
  assert.equal(valorProporcional(null, 900_000, 30), 900_000)
})

test('el día anterior cruza meses y años', () => {
  assert.equal(diaAnterior('2026-03-01'), '2026-02-28')
  assert.equal(diaAnterior('2024-03-01'), '2024-02-29', 'año bisiesto')
  assert.equal(diaAnterior('2026-01-01'), '2025-12-31')
  assert.equal(fechaLarga('2026-10-15'), '15 de octubre de 2026')
})

// ─── El plan: qué pasa si termina ese día ────────────────────────────────────

test('termina el 15 de octubre: se anulan noviembre y diciembre, octubre se recorta y sigue pendiente', () => {
  const plan = planDeTerminacion(contrato, periodos, '2026-10-15')
  assert.equal(plan.error, null)
  assert.deepEqual(meses(plan.anulados), ['Noviembre', 'Diciembre'], 'un devuelto posterior también se anula')
  assert.equal(plan.recortado?.periodo.mes, 'Octubre')
  assert.equal(plan.recortado?.fechaFinNueva, '2026-10-15')
  assert.equal(plan.recortado?.dias, 15)
  assert.equal(plan.recortado?.valorPropuesto, 1_500_000)
  assert.deepEqual(plan.bloqueos, [])
  assert.deepEqual(meses(plan.pendientes), ['Octubre'], 'lo radicado, aprobado o enviado ya no está pendiente')
})

test('no se termina antes de lo ya presentado, y dice qué lo impide', () => {
  const plan = planDeTerminacion(contrato, periodos, '2026-08-15')
  assert.deepEqual(meses(plan.bloqueos), ['Agosto', 'Septiembre'])
})

test('un periodo histórico más allá del último día también lo impide', () => {
  const conHistorico = periodos.map(p => (p.mes === 'Noviembre' ? { ...p, es_historico: true } : p))
  assert.deepEqual(meses(planDeTerminacion(contrato, conHistorico, '2026-10-15').bloqueos), ['Noviembre'])
})

test('terminar el último día de un periodo no recorta nada', () => {
  const plan = planDeTerminacion(contrato, periodos, '2026-10-31')
  assert.equal(plan.recortado, null)
  assert.deepEqual(meses(plan.anulados), ['Noviembre', 'Diciembre'])
  assert.deepEqual(meses(plan.pendientes), ['Octubre'])
})

test('un contrato que nunca se ejecutó: el último día es el anterior al inicio y todo queda anulado', () => {
  const todosBorrador = periodos.map(p => ({ ...p, estado: 'borrador' }))
  const plan = planDeTerminacion(contrato, todosBorrador, diaAnterior(contrato.fecha_inicio))
  assert.equal(plan.error, null)
  assert.equal(plan.anulados.length, 6)
  assert.equal(plan.recortado, null)
  assert.deepEqual(plan.pendientes, [])
})

test('las fechas que no sirven se explican, sin plan', () => {
  assert.match(planDeTerminacion(contrato, periodos, '2026-12-31').error ?? '', /anterior a la terminación pactada/)
  assert.match(planDeTerminacion(contrato, periodos, '2027-01-15').error ?? '', /anterior a la terminación pactada/)
  assert.match(planDeTerminacion(contrato, periodos, '2026-06-29').error ?? '', /anterior al inicio/)
  assert.match(planDeTerminacion(contrato, periodos, '').error ?? '', /Indica el último día/)
})

test('los periodos ya anulados no cuentan (un contrato con una terminación deshecha y vuelta a registrar)', () => {
  const conAnulado = [...periodos, periodo(7, 'Enero', '2027-01-01', '2027-01-31', 'anulado')]
  assert.deepEqual(meses(planDeTerminacion(contrato, conAnulado, '2026-10-15').anulados), ['Noviembre', 'Diciembre'])
})

// ─── Quién ───────────────────────────────────────────────────────────────────

test('la registran admin y contratación en cualquier contrato, y el supervisor solo en los suyos', () => {
  const c = { supervisor_id: 'sup-1' }
  assert.equal(puedeGestionarTerminacion('admin', 'x', c), true)
  assert.equal(puedeGestionarTerminacion('contratacion', 'x', c), true)
  assert.equal(puedeGestionarTerminacion('supervisor', 'sup-1', c), true)
  assert.equal(puedeGestionarTerminacion('supervisor', 'sup-2', c), false, 'el supervisor de otro contrato')
  for (const rol of ['asesor', 'contratista', 'alcalde', 'funcionario'] as const) {
    assert.equal(puedeGestionarTerminacion(rol, 'sup-1', c), false, rol)
  }
  assert.equal(puedeGestionarTerminacion(undefined, undefined, c), false)
})

test('un periodo anulado no es un informe presentado', () => {
  assert.equal(informePresentado('anulado'), false)
  assert.equal(informePresentado('borrador'), false)
  for (const e of ['enviado', 'revision', 'aprobado', 'radicado', 'rechazado']) assert.equal(informePresentado(e), true, e)
})

// ─── El vigilante: nadie vuelve a decidir «activo» con la fecha pactada ─────

/**
 * Antes de la 081 había al menos cinco definiciones de «contrato activo», casi todas `fecha_fin >= hoy`. Con la
 * terminación anticipada esa fecha dejó de decir hasta cuándo va un contrato: la que lo dice es `fecha_fin_efectiva`.
 * Este vigilante falla si una consulta vuelve a filtrar contratos por la fecha pactada sin excluir los terminados, o si
 * el código vuelve a comparar la fecha pactada de un contrato con hoy. Las excepciones están nombradas y explicadas.
 */
test('ninguna consulta decide si un contrato está activo con la fecha pactada', () => {
  const archivos: string[] = []
  const recorrer = (dir: string) => {
    for (const f of readdirSync(join(raiz, dir))) {
      const ruta = `${dir}/${f}`
      if (statSync(join(raiz, ruta)).isDirectory()) recorrer(ruta)
      else if (/\.(ts|tsx)$/.test(f)) archivos.push(ruta)
    }
  }
  for (const dir of ['app', 'lib', 'services', 'components']) recorrer(dir)

  // Comparaciones en memoria con la fecha pactada de un contrato.
  const COMPARACIONES_PERMITIDAS: Record<string, string> = {
    // Selecciona `fecha_fin:fecha_fin_efectiva`: ahí `fecha_fin` YA es la efectiva.
    'app/actions/alcalde.ts': 'alias',
    // El módulo del Plan de Desarrollo se dejó quieto a pedido de Felipe (30-oct-2026). Ya excluye los terminados porque
    // exige `estado === 'vigente'`; lo único que no ve es una terminación registrada por adelantado.
    'lib/pdm/contrato.ts': 'pdm',
  }

  const malas: string[] = []
  for (const ruta of archivos) {
    const lineas = leer(ruta).split('\n')
    lineas.forEach((linea, i) => {
      if (/\.(gte|gt|lte|lt|in|eq)\('fecha_fin'/.test(linea)) {
        // ¿Es una consulta de `periodos`? Su fecha_fin es la del periodo, no la del contrato.
        const cadena = lineas.slice(Math.max(0, i - 8), i + 1).join('\n')
        const deContratos = /from\('contratos'\)/.test(cadena) && !/from\('periodos'\)/.test(cadena.slice(cadena.lastIndexOf("from('contratos')")))
        if (deContratos && !/\.is\('fecha_terminacion', null\)/.test(lineas.slice(Math.max(0, i - 8), i + 8).join('\n'))) {
          malas.push(`${ruta}:${i + 1}  ${linea.trim()}`)
        }
      }
      if (/\bc\.fecha_fin\s*(>=|<=|>|<)\s|(>=|<=|>|<)\s*c\.fecha_fin\b/.test(linea) && !COMPARACIONES_PERMITIDAS[ruta]) {
        malas.push(`${ruta}:${i + 1}  ${linea.trim()}`)
      }
    })
  }
  assert.deepEqual(malas, [], 'usa fecha_fin_efectiva (lib/vigencia-contrato.ts), o excluye los terminados con .is(\'fecha_terminacion\', null)')
})
