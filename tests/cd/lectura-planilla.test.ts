import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buscarIbc, buscarMes, buscarNumero, leerPlanilla, mesesDelDocumento, montosDelDocumento } from '../../lib/lectura-planilla'

const PISO = 1_750_905

// Textos con la forma de las planillas reales (operadores SOI, SimplePila/Aportes en Línea y ARUS), con datos inventados.
const SOI =
  'DATOS GENERALES DE LA PLANILLA NÚMERO PLANILLA: TIPO DE PLANILLA: PERIODO COTIZACIÓN OTROS MES AÑO septiembre 2026 ' +
  'PERIODO COTIZACIÓN SALUD: MES AÑO septiembre 2026 FECHA PAGO (aaaa/mm/dd): 2026/09/10 NÚMERO AUTORIZACIÓN: 6034455667 ' +
  '6016087440 I-INDEPENDIENTES 1020304050 PERSONA DE PRUEBA IBC 2.320.000 30 $ 371.200 IBC 2.320.000 30 $ 290.000 ' +
  'IBC 2.320.000 30 $ 12.200 IBC 2.320.000 TOTAL PAGADO: $ 673.400'

const SIMPLE =
  'Fecha creación reporte: 2026-09-07, 03:46:11 PM Numéro Planilla: agosto de 2026 agosto de 2026 4455667788 ' +
  'Periodo Cotización: Periodo Servicio: IBC Pensión Días 1.920.000 30 1.920.000 30 1.920.000 30 PAGADO 07/09/2026'

const ARUS =
  'PERÍODO PENSIÓN: PERÍODO SALUD: NÚMERO PLANILLA: FECHA DE PAGO: 0 2026-07-27 2026-07 I 8899001122 2026-07 ' +
  '2026-07-10 FECHA DE PAGO: 2026-08-13 TOTAL 1 $ 414.700 $ 530.800 $ 3.317.420 $ 3.317.420 $ 3.317.420'

const RESUMEN = 'Planilla Resumen (1 Afiliados) $1,800,000 $288,000 $1,800,000 $225,000 $1,800,000 $216,000 septiembre de 2026'

test('el número de planilla se encuentra solo si va entero, no pegado a otros dígitos', () => {
  assert.equal(buscarNumero(SOI, '6016087440').veredicto, 'coincide')
  assert.equal(buscarNumero(SOI, ' 6016087440 ').veredicto, 'coincide')
  // 601608744 es un trozo del número real: no cuenta.
  assert.equal(buscarNumero(SOI, '601608744').veredicto, 'sin_comprobar')
  assert.equal(buscarNumero(SOI, '9999999999').veredicto, 'sin_comprobar')
  assert.equal(buscarNumero(SOI, null).veredicto, 'sin_comprobar')
  assert.equal(buscarNumero(SOI, 'sin dígitos').veredicto, 'sin_comprobar')
})

test('el mes: por nombre, con o sin año, y en las formas numéricas AAAA-MM y MM/AAAA', () => {
  assert.equal(buscarMes(SOI, 'SEPTIEMBRE').veredicto, 'coincide')
  assert.equal(buscarMes(SOI, 'Septiembre').veredicto, 'coincide')
  assert.equal(buscarMes(SIMPLE, 'AGOSTO').veredicto, 'coincide')
  assert.equal(buscarMes(ARUS, 'JULIO').veredicto, 'coincide')
  assert.equal(buscarMes(RESUMEN, 'SEPTIEMBRE').veredicto, 'coincide')
  assert.equal(buscarMes('Periodo 07/2026 pagado', 'JULIO').veredicto, 'coincide')
})

test('una fecha completa no es un periodo: el mes del PAGO no es el mes cotizado', () => {
  const meses = mesesDelDocumento(ARUS).map(m => m.mes)
  assert.deepEqual(meses, ['JULIO'])
  assert.ok(!meses.includes('AGOSTO'))
  assert.deepEqual(mesesDelDocumento('pagado el 10/09/2026 y creado 2026-09-07'), [])
})

test('mes vencido: la planilla dice otro mes con claridad → «distinto», y se ofrece ese mes', () => {
  const h = buscarMes(SIMPLE, 'SEPTIEMBRE')
  assert.equal(h.veredicto, 'distinto')
  assert.equal(h.mes, 'AGOSTO')
  assert.equal(h.encontrado, 'AGOSTO')
})

test('si el documento nombra varios meses por igual y ninguno es el esperado, no se afirma nada', () => {
  const h = buscarMes('abril 2026 mayo 2026', 'JUNIO')
  assert.equal(h.veredicto, 'sin_comprobar')
  assert.equal(h.mes, null)
  // Pero si uno de ellos es el esperado, coincide aunque haya otros.
  assert.equal(buscarMes('abril 2026 mayo 2026', 'MAYO').veredicto, 'coincide')
  assert.equal(buscarMes('sin ninguna fecha de periodo', 'MAYO').veredicto, 'sin_comprobar')
})

test('los montos se leen con puntos o con comas de miles', () => {
  assert.deepEqual(montosDelDocumento('$ 2.320.000 y $1,800,000 y 12.200').map(m => m.valor).sort((a, b) => a - b), [12_200, 1_800_000, 2_320_000])
  // Una cédula pegada o una cifra sin separador de miles no es un monto.
  assert.deepEqual(montosDelDocumento('cédula 1020304050 o 2320000'), [])
})

test('IBC: el esperado aparece → coincide', () => {
  assert.equal(buscarIbc(SOI, 2_320_000, PISO).veredicto, 'coincide')
  assert.equal(buscarIbc(RESUMEN, 1_800_000, PISO).veredicto, 'coincide')
})

test('IBC: otro valor que se repite en la planilla → «distinto», y se ofrece ese valor', () => {
  const h = buscarIbc(SIMPLE, 2_320_000, PISO)
  assert.equal(h.veredicto, 'distinto')
  assert.equal(h.valor, 1_920_000)
  const soiConOtraBase = buscarIbc(SOI, 8_000_000, PISO)
  assert.equal(soiConOtraBase.veredicto, 'distinto')
  assert.equal(soiConOtraBase.valor, 2_320_000)
})

test('IBC: sin un candidato claro no se afirma nada', () => {
  // Montos que salen una sola vez (cotizaciones, totales): ninguno es «el IBC».
  assert.equal(buscarIbc(ARUS, 2_000_000, PISO).veredicto, 'distinto') // $ 3.317.420 se repite tres veces
  assert.equal(buscarIbc('Total $ 414.700 $ 530.800 $ 12.200', 2_000_000, PISO).veredicto, 'sin_comprobar')
  // Dos candidatos con las mismas repeticiones: ambiguo.
  assert.equal(buscarIbc('2.000.000 2.000.000 2.000.000 3.000.000 3.000.000 3.000.000', 2_500_000, PISO).veredicto, 'sin_comprobar')
  // Bajo el piso no se toma por IBC aunque se repita.
  assert.equal(buscarIbc('500.000 500.000 500.000', 2_000_000, PISO).veredicto, 'sin_comprobar')
})

test('un documento sin texto (escaneo o foto) queda sin comprobar, sin inventar nada', () => {
  const l = leerPlanilla(['', '  '], { numero: '6016087440', mes: 'SEPTIEMBRE', base: 2_320_000, piso: PISO })
  assert.equal(l.hayTexto, false)
  for (const h of [l.numero, l.mes, l.ibc]) {
    assert.equal(h.veredicto, 'sin_comprobar')
    assert.equal(h.encontrado, null)
    assert.equal(h.fragmento, null)
  }
})

test('leerPlanilla junta las páginas y coteja los tres datos', () => {
  const l = leerPlanilla([SOI.slice(0, 200), SOI.slice(200)], { numero: '6016087440', mes: 'SEPTIEMBRE', base: 2_320_000, piso: PISO })
  assert.equal(l.hayTexto, true)
  assert.equal(l.numero.veredicto, 'coincide')
  assert.equal(l.mes.veredicto, 'coincide')
  assert.equal(l.ibc.veredicto, 'coincide')
  assert.equal(l.mes.fragmento?.toLowerCase(), 'septiembre')
  assert.equal(l.ibc.fragmento, '2.320.000')
})

test('lo declarado cambia → la lectura cambia (al corregir la base, el cotejo pasa a coincidir)', () => {
  const antes = leerPlanilla([SIMPLE], { numero: '4455667788', mes: 'AGOSTO', base: 2_320_000, piso: PISO })
  assert.equal(antes.ibc.veredicto, 'distinto')
  const despues = leerPlanilla([SIMPLE], { numero: '4455667788', mes: 'AGOSTO', base: 1_920_000, piso: PISO })
  assert.equal(despues.ibc.veredicto, 'coincide')
})
