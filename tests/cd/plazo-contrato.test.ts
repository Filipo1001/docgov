import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import {
  MAX_PLAZO_DIAS, PLAZO_DEL_CONTRATO_DESDE, compararPlazo, diasDelPlazo, leerPlazoEscrito, mesesDelPlazo, plazoEnLetras, plazoParaDocumento,
  plazoValido, reglaNuevaDelPlazo, resolverPlazo,
} from '@/lib/plazo-contrato'

const fuente = (ruta: string) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8')

// ─── La sugerencia: lo que dan las fechas ─────────────────────────────────────

test('se cuentan el primer y el último día', () => {
  assert.equal(diasDelPlazo('2026-02-02', '2026-07-31'), 180)
  assert.equal(diasDelPlazo('2026-02-02', '2026-08-20'), 200)
  assert.equal(diasDelPlazo('2026-01-01', '2026-12-31'), 365)
  assert.equal(diasDelPlazo('2028-01-01', '2028-12-31'), 366, 'año bisiesto')
  assert.equal(diasDelPlazo('2026-03-15', '2026-03-15'), 1, 'un contrato de un día dura un día')
  assert.equal(diasDelPlazo('2026-12-31', '2027-01-01'), 2, 'cruza el año')
  assert.equal(diasDelPlazo('2026-02-28', '2026-03-01'), 2, 'cruza febrero')
})

test('sin fechas válidas no hay sugerencia (nunca un número inventado)', () => {
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

test('el plazo en letras, como lo pidió Felipe: «DOSCIENTOS DÍAS (200)»', () => {
  assert.equal(plazoEnLetras(200), 'DOSCIENTOS DÍAS (200)')
  assert.equal(plazoEnLetras(180), 'CIENTO OCHENTA DÍAS (180)')
  assert.equal(plazoEnLetras(365), 'TRESCIENTOS SESENTA Y CINCO DÍAS (365)')
  assert.equal(plazoEnLetras(100), 'CIEN DÍAS (100)')
  assert.equal(plazoEnLetras(101), 'CIENTO UN DÍAS (101)')
  assert.equal(plazoEnLetras(21), 'VEINTIÚN DÍAS (21)')
  assert.equal(plazoEnLetras(1), 'UN DÍA (1)', 'en singular')
})

// ─── El plazo escrito ─────────────────────────────────────────────────────────

test('qué se acepta como plazo escrito', () => {
  for (const [texto, esperado] of [['180', 180], [' 200 ', 200], ['1', 1], ['3650', 3650], [180, 180], ['007', 7]] as const) {
    assert.equal(leerPlazoEscrito(texto), esperado, String(texto))
  }
  for (const malo of ['', '   ', '0', '-5', '12,5', '12.5', '1e3', 'abc', '180 días', '3651', '99999', '123456', null, undefined, NaN]) {
    assert.equal(leerPlazoEscrito(malo as never), null, String(malo))
  }
  assert.equal(MAX_PLAZO_DIAS, 3650)
})

test('lo que llega al servidor: un entero entre 1 y 3.650, sea número o texto', () => {
  assert.equal(plazoValido(180), 180)
  assert.equal(plazoValido('180'), 180)
  assert.equal(plazoValido(180.5), null)
  assert.equal(plazoValido(0), null)
  assert.equal(plazoValido(-3), null)
  assert.equal(plazoValido(1e21), null)
  assert.equal(plazoValido({}), null)
  assert.equal(plazoValido([180]), null)
  assert.equal(plazoValido(true), null)
  assert.equal(plazoValido(null), null)
})

test('el campo sigue a las fechas hasta que alguien lo toca, y entonces manda lo escrito', () => {
  // Sin tocar: la sugerencia.
  assert.deepEqual(resolverPlazo(200, '', false), { valor: '200', efectivo: 200, invalido: false })
  assert.deepEqual(resolverPlazo(null, '', false), { valor: '', efectivo: null, invalido: false })
  // Tocado: lo escrito, aunque las fechas digan otra cosa (es lo que dice el contrato).
  assert.deepEqual(resolverPlazo(183, '180', true), { valor: '180', efectivo: 180, invalido: false })
  // Tocado y vaciado: se queda vacío (no vuelve solo a la sugerencia) y al guardar se usa la sugerencia.
  assert.deepEqual(resolverPlazo(183, '', true), { valor: '', efectivo: 183, invalido: false })
  assert.deepEqual(resolverPlazo(null, '', true), { valor: '', efectivo: null, invalido: false })
  // Lo escrito que no es un plazo se marca, no se corrige en silencio.
  assert.deepEqual(resolverPlazo(183, '0', true), { valor: '0', efectivo: null, invalido: true })
  assert.deepEqual(resolverPlazo(183, '9999999', true), { valor: '9999999', efectivo: null, invalido: true })
})

test('la comparación solo avisa: coincide, es distinto (y cuánto) o no hay con qué comparar', () => {
  assert.deepEqual(compararPlazo(180, 180), { tipo: 'coincide' })
  assert.deepEqual(compararPlazo(180, 183), { tipo: 'distinto', escrito: 180, porFechas: 183, diferencia: -3 })
  assert.deepEqual(compararPlazo(200, 183), { tipo: 'distinto', escrito: 200, porFechas: 183, diferencia: 17 })
  assert.deepEqual(compararPlazo(null, 183), { tipo: 'sin_comparar' })
  assert.deepEqual(compararPlazo(180, null), { tipo: 'sin_comparar' })
})

// ─── Lo que imprimen los documentos ───────────────────────────────────────────

test('un periodo sin emitir imprime el plazo del contrato: el escrito más los otrosíes aplicados', () => {
  const borrador = { estado: 'borrador', fecha_aprobacion: null }
  // 133-2026: firmado «180 días», sus fechas dan 183. El documento dice lo que dice el contrato.
  assert.equal(plazoParaDocumento({ plazo_dias: 180, fecha_inicio: '2026-03-02', fecha_fin: '2026-08-31' }, borrador), 180)
  // 002-2026: 228 + un otrosí aplicado de 110 días = 338, que es también lo que dan las fechas.
  assert.equal(plazoParaDocumento({ plazo_dias: 228, dias_otrosi_aplicados: 110, fecha_inicio: '2026-01-14', fecha_fin: '2026-12-17' }, borrador), 338)
  // 025-2026: 240 + 90 = 330; las fechas darían 316, y manda lo que dice el contrato.
  assert.equal(plazoParaDocumento({ plazo_dias: 240, dias_otrosi_aplicados: 90, fecha_inicio: '2026-02-18', fecha_fin: '2026-12-30' }, borrador), 330)
  // Sin el otrosí, el plazo perdería los 90 días que los documentos de hoy sí cuentan.
  assert.notEqual(plazoParaDocumento({ plazo_dias: 240, fecha_inicio: '2026-02-18', fecha_fin: '2026-12-30' }, borrador), 330)
})

test('sin plazo escrito imprime lo que dan las fechas; sin nada, nada', () => {
  const borrador = { estado: 'enviado', fecha_aprobacion: null }
  for (const plazo_dias of [null, undefined, 0]) {
    assert.equal(plazoParaDocumento({ plazo_dias, fecha_inicio: '2026-02-02', fecha_fin: '2026-07-31' }, borrador), 180)
  }
  assert.equal(plazoParaDocumento({ plazo_dias: null, fecha_inicio: null, fecha_fin: null }, borrador), null)
  assert.equal(plazoParaDocumento({ plazo_dias: null, fecha_inicio: '2026-07-31', fecha_fin: '2026-02-02' }, borrador), null)
})

test('lo aprobado o radicado ANTES de publicar conserva la cuenta con que se emitió', () => {
  const corte = new Date(PLAZO_DEL_CONTRATO_DESDE).getTime()
  const antes = new Date(corte - 60_000).toISOString()
  const despues = new Date(corte + 60_000).toISOString()

  for (const estado of ['borrador', 'enviado', 'revision', 'rechazado', null, undefined]) {
    assert.equal(reglaNuevaDelPlazo({ estado, fecha_aprobacion: null }), true, String(estado))
  }
  assert.equal(reglaNuevaDelPlazo({ estado: 'aprobado', fecha_aprobacion: antes }), false)
  assert.equal(reglaNuevaDelPlazo({ estado: 'radicado', fecha_aprobacion: antes }), false)
  assert.equal(reglaNuevaDelPlazo({ estado: 'radicado', fecha_aprobacion: null }), false, 'anterior a que existiera la fecha')
  assert.equal(reglaNuevaDelPlazo({ estado: 'aprobado', fecha_aprobacion: despues }), true)
  assert.equal(reglaNuevaDelPlazo({ estado: 'aprobado', fecha_aprobacion: PLAZO_DEL_CONTRATO_DESDE }), true, 'en el instante del corte ya cuenta')

  // Lo ya emitido: las fechas SIN el último día, aunque el contrato tenga plazo escrito y otrosíes. Es lo que imprimió entonces.
  const contrato = { plazo_dias: 240, dias_otrosi_aplicados: 90, fecha_inicio: '2026-02-18', fecha_fin: '2026-12-30' }
  assert.equal(plazoParaDocumento(contrato, { estado: 'radicado', fecha_aprobacion: antes }), 315)
  assert.equal(plazoParaDocumento(contrato, { estado: 'aprobado', fecha_aprobacion: antes }), 315)
  assert.equal(plazoParaDocumento(contrato, { estado: 'radicado', fecha_aprobacion: null }), 315)
  assert.equal(plazoParaDocumento(contrato, { estado: 'radicado', fecha_aprobacion: despues }), 330)
})

// ─── Nadie vuelve a contar por su cuenta ──────────────────────────────────────

test('ningún documento ni formulario cuenta los días del plazo por su cuenta', () => {
  // Antes había cuatro cuentas y no coincidían. Si alguien vuelve a escribir una resta de fechas en un documento o en
  // un formulario de contrato, esta prueba lo detiene: la cuenta es `diasDelPlazo` y `plazoParaDocumento`.
  const archivos = [
    ...readdirSync(new URL('../../lib/pdf/', import.meta.url)).filter(n => /\.(ts|tsx)$/.test(n)).map(n => `lib/pdf/${n}`),
    'app/dashboard/contratos/nuevo/NuevoContratoClient.tsx',
    'app/dashboard/contratos/[id]/editar/EditarContratoClient.tsx',
    'app/actions/contratos.ts',
    'components/CampoPlazo.tsx',
  ]
  const restaFechas = /86_?400_?000|getDate\(\)\s*\+\s*dias/
  assert.deepEqual(archivos.filter(a => restaFechas.test(fuente(a))), [])
})

test('las tres piezas que imprimen el plazo usan la cuenta compartida', () => {
  for (const a of ['lib/pdf/acta-supervision.tsx', 'lib/pdf/acta-pago.tsx', 'lib/pdf/cuenta-de-cobro.tsx']) {
    const f = fuente(a)
    assert.match(f, /plazoParaDocumento\(/, `${a} usa plazoParaDocumento`)
    assert.match(f, /dias_otrosi_aplicados: contrato\.dias_otrosi_aplicados/, `${a} le pasa los días de otrosí`)
    assert.match(f, /plazo_dias: contrato\.plazo_dias/, `${a} le pasa el plazo escrito`)
  }
  // Y los datos del documento traen el plazo escrito, los otrosíes aplicados y la fecha de aprobación del periodo.
  const datos = fuente('lib/pdf/data.ts')
  assert.match(datos, /plazo_dias,\n\s+banco/, 'lee plazo_dias del contrato')
  assert.match(datos, /aplicado_en/, 'lee cuáles otrosíes ya se aplicaron')
  assert.match(datos, /dias_otrosi_aplicados: diasOtrosiAplicados/)
  assert.match(datos, /fecha_aprobacion/)
})

test('el servidor guarda el plazo escrito y lo valida; sin plazo, el de las fechas; los meses se derivan', () => {
  const f = fuente('app/actions/contratos.ts')
  assert.equal((f.match(/plazo_dias: plazoDias/g) ?? []).length, 2, 'crearContrato y crearContratoConContratista guardan el plazo validado')
  assert.match(f, /plazoAGuardar\(input\.plazo_dias, input\.fecha_inicio, input\.fecha_fin\)/)
  assert.doesNotMatch(f, /plazo_dias:\s*input\.plazo_dias/, 'nunca guarda lo que llega sin validarlo')
  assert.match(f, /plazoValido\(cambios\.plazo_dias\)/, 'al editar valida el plazo que llega')
  assert.match(f, /campo !== 'plazo_meses'/, 'los meses no se aceptan de la pantalla: salen del plazo')
})
