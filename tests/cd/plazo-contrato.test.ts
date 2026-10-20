import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { PLAZO_INCLUSIVO_DESDE, cuentaUltimoDia, diasDelPlazo, mesesDelPlazo, plazoEnLetras } from '@/lib/plazo-contrato'

// ─── La cuenta ────────────────────────────────────────────────────────────────

test('se cuentan el primer y el último día', () => {
  assert.equal(diasDelPlazo('2026-02-02', '2026-07-31'), 180)
  assert.equal(diasDelPlazo('2026-01-01', '2026-12-31'), 365)
  assert.equal(diasDelPlazo('2028-01-01', '2028-12-31'), 366, 'año bisiesto')
  assert.equal(diasDelPlazo('2026-03-15', '2026-03-15'), 1, 'un contrato de un día dura un día')
  assert.equal(diasDelPlazo('2026-12-31', '2027-01-01'), 2, 'cruza el año')
  assert.equal(diasDelPlazo('2026-02-28', '2026-03-01'), 2, 'cruza febrero')
})

test('casos reales de producción (20-oct-2026)', () => {
  // 094-2026 y 184-2026: su plazo guardado ya contaba los dos días.
  assert.equal(diasDelPlazo('2026-02-02', '2026-07-31'), 180)
  assert.equal(diasDelPlazo('2026-08-24', '2026-12-31'), 130)
  // 133-2026: firmado «180 días», pero sus fechas dan 183. El sistema dice lo que dicen las fechas.
  assert.equal(diasDelPlazo('2026-03-02', '2026-08-31'), 183)
})

test('sin fechas válidas no hay plazo (nunca un número inventado)', () => {
  assert.equal(diasDelPlazo('', '2026-07-31'), null)
  assert.equal(diasDelPlazo('2026-02-02', null), null)
  assert.equal(diasDelPlazo(undefined, undefined), null)
  assert.equal(diasDelPlazo('2026-07-31', '2026-02-02'), null, 'la terminación antes del inicio')
  assert.equal(diasDelPlazo('2026-02-30', '2026-07-31'), null, 'el 30 de febrero no existe')
  assert.equal(diasDelPlazo('02/02/2026', '31/07/2026'), null, 'otro formato')
  assert.equal(diasDelPlazo('2026-13-01', '2026-12-31'), null)
})

test('una fecha con hora (como la devuelve a veces la base) se lee por su día', () => {
  assert.equal(diasDelPlazo('2026-02-02T00:00:00', '2026-07-31T00:00:00+00:00'), 180)
})

test('la cuenta vieja (sin el último día) es exactamente la que hacían los documentos', () => {
  // La fórmula que tenían el acta de supervisión y el acta de pago, copiada tal cual.
  const vieja = (inicio: string, fin: string) =>
    Math.round((new Date(fin + 'T00:00:00').getTime() - new Date(inicio + 'T00:00:00').getTime()) / 86_400_000)
  let a = Date.UTC(2025, 0, 1)
  for (let k = 0; k < 400; k++) {
    const inicio = new Date(a).toISOString().slice(0, 10)
    const fin = new Date(a + ((k * 37) % 500) * 86_400_000).toISOString().slice(0, 10)
    assert.equal(diasDelPlazo(inicio, fin, { contarUltimoDia: false }), vieja(inicio, fin), `${inicio} → ${fin}`)
    assert.equal(diasDelPlazo(inicio, fin), vieja(inicio, fin) + 1, `${inicio} → ${fin}`)
    a += 3 * 86_400_000
  }
})

test('los meses que se guardan junto al plazo siguen siendo días / 30', () => {
  assert.equal(mesesDelPlazo(180), 6)
  assert.equal(mesesDelPlazo(365), 12)
  assert.equal(mesesDelPlazo(44), 1)
  assert.equal(mesesDelPlazo(46), 2)
})

// ─── En letras ────────────────────────────────────────────────────────────────

test('el plazo en letras, como lo pidió Felipe: «DOSCIENTOS DÍAS (200)»', () => {
  assert.equal(plazoEnLetras(200), 'DOSCIENTOS DÍAS (200)')
  assert.equal(plazoEnLetras(180), 'CIENTO OCHENTA DÍAS (180)')
  assert.equal(plazoEnLetras(365), 'TRESCIENTOS SESENTA Y CINCO DÍAS (365)')
  assert.equal(plazoEnLetras(100), 'CIEN DÍAS (100)')
  assert.equal(plazoEnLetras(101), 'CIENTO UN DÍAS (101)')
  assert.equal(plazoEnLetras(21), 'VEINTIÚN DÍAS (21)')
  assert.equal(plazoEnLetras(1), 'UN DÍA (1)', 'en singular')
})

// ─── Lo ya emitido ────────────────────────────────────────────────────────────

test('lo aprobado o radicado ANTES de publicar conserva la cuenta con que se emitió', () => {
  const corte = new Date(PLAZO_INCLUSIVO_DESDE).getTime()
  const antes = new Date(corte - 60_000).toISOString()
  const despues = new Date(corte + 60_000).toISOString()

  // Lo que todavía no se emite: la cuenta nueva.
  for (const estado of ['borrador', 'enviado', 'revision', 'rechazado', null, undefined]) {
    assert.equal(cuentaUltimoDia({ estado, fecha_aprobacion: null }), true, String(estado))
  }
  // Ya emitido antes: la vieja. Los radicados sin fecha de aprobación son anteriores a que existiera el campo.
  assert.equal(cuentaUltimoDia({ estado: 'aprobado', fecha_aprobacion: antes }), false)
  assert.equal(cuentaUltimoDia({ estado: 'radicado', fecha_aprobacion: antes }), false)
  assert.equal(cuentaUltimoDia({ estado: 'radicado', fecha_aprobacion: null }), false)
  // Aprobado después de publicar: la nueva.
  assert.equal(cuentaUltimoDia({ estado: 'aprobado', fecha_aprobacion: despues }), true)
  assert.equal(cuentaUltimoDia({ estado: 'radicado', fecha_aprobacion: despues }), true)
  // Un devuelto que se vuelve a aprobar tiene una fecha nueva: la nueva cuenta.
  assert.equal(cuentaUltimoDia({ estado: 'aprobado', fecha_aprobacion: PLAZO_INCLUSIVO_DESDE }), true, 'en el instante del corte ya cuenta')
})

// ─── Nadie vuelve a contar por su cuenta ──────────────────────────────────────

test('ningún documento ni formulario cuenta los días del plazo por su cuenta', () => {
  // Antes había cuatro cuentas y no coincidían. Si alguien vuelve a escribir una resta de fechas en un documento o en
  // un formulario de contrato, esta prueba lo detiene: la cuenta es `diasDelPlazo`.
  const archivos = [
    ...readdirSync(new URL('../../lib/pdf/', import.meta.url)).filter(n => /\.(ts|tsx)$/.test(n)).map(n => `lib/pdf/${n}`),
    'app/dashboard/contratos/nuevo/NuevoContratoClient.tsx',
    'app/dashboard/contratos/[id]/editar/EditarContratoClient.tsx',
    'app/actions/contratos.ts',
  ]
  const restaFechas = /86_?400_?000|getDate\(\)\s*\+\s*dias/
  const culpables = archivos.filter(a => restaFechas.test(readFileSync(new URL(`../../${a}`, import.meta.url), 'utf8')))
  assert.deepEqual(culpables, [])
})

test('las tres piezas que imprimen el plazo usan la cuenta compartida y respetan lo ya emitido', () => {
  for (const a of ['lib/pdf/acta-supervision.tsx', 'lib/pdf/acta-pago.tsx', 'lib/pdf/cuenta-de-cobro.tsx']) {
    const fuente = readFileSync(new URL(`../../${a}`, import.meta.url), 'utf8')
    assert.match(fuente, /diasDelPlazo\(/, `${a} usa diasDelPlazo`)
    assert.match(fuente, /cuentaUltimoDia\(periodo\)/, `${a} decide la cuenta por el periodo`)
  }
  // Y el periodo trae su fecha de aprobación, sin la cual todo lo emitido parecería «antiguo».
  assert.match(readFileSync(new URL('../../lib/pdf/data.ts', import.meta.url), 'utf8'), /fecha_aprobacion/)
})

test('el servidor no acepta un plazo escrito: lo calcula de las fechas al crear y al editar', () => {
  const fuente = readFileSync(new URL('../../app/actions/contratos.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(fuente, /plazo_dias:\s*input\.plazo_dias/, 'no guarda el plazo que llega de la pantalla')
  assert.equal((fuente.match(/plazo_dias:\s*plazoDias/g) ?? []).length, 2, 'crearContrato y crearContratoConContratista')
  assert.match(fuente, /campo !== 'plazo_dias' && campo !== 'plazo_meses'/, 'al editar descarta el plazo que llegue')
})
