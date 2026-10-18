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

// ─── Los casos difíciles ─────────────────────────────────────────────────────

import fs from 'node:fs'
import { buscarPersona, calidadDelTexto, MAXIMO_CARACTERES } from '../../lib/lectura-planilla'

const ACTA =
  'ACTA DE SUPERVISIÓN Mediante la presente acta el supervisor certifica que el contratista cumplió con el pago de sus ' +
  'aportes al sistema de seguridad social durante el periodo, según la planilla presentada. El supervisor manifiesta que ' +
  'el valor mensual del contrato es de 3.000.000 y que se cumplieron las obligaciones. '.repeat(3)

const ESPERADO = { numero: '6016087440', mes: 'SEPTIEMBRE', anio: 2026, mesInforme: 'OCTUBRE', base: 2_320_000, piso: PISO, cedula: '1.020.304.050' }

test('calidad del documento: escaneo, texto ilegible y otro tipo de documento', () => {
  assert.equal(calidadDelTexto(''), 'sin_texto')
  assert.equal(calidadDelTexto('Escaneado con CamScanner 1 página'), 'sin_texto')
  // Una fuente dañada deja caracteres que no son letras ni cifras.
  assert.equal(calidadDelTexto('\u0001\u0002\u0003 '.repeat(60)), 'ilegible')
  // Un acta habla de «planilla» y «seguridad social» pero no es una planilla.
  assert.equal(calidadDelTexto(ACTA), 'no_parece_planilla')
  assert.equal(calidadDelTexto(SOI), 'ok')
  assert.equal(calidadDelTexto(SIMPLE), 'ok')
  assert.equal(calidadDelTexto(ARUS), 'ok')
})

test('un documento que no es una planilla no «coincide» en nada, aunque el número aparezca suelto', () => {
  const l = leerPlanilla([`${ACTA} 6016087440 septiembre 2026 2.320.000 2.320.000 2.320.000`], ESPERADO)
  assert.equal(l.calidad, 'no_parece_planilla')
  assert.equal(l.hayTexto, false)
  for (const h of [l.numero, l.mes, l.ibc, l.persona]) assert.equal(h.veredicto, 'sin_comprobar')
})

test('un escaneo y un texto ilegible tampoco comprueban nada', () => {
  for (const paginas of [[''], ['\u0001\u0002 '.repeat(80)]]) {
    const l = leerPlanilla(paginas, ESPERADO)
    assert.equal(l.hayTexto, false)
    assert.notEqual(l.calidad, 'ok')
    for (const h of [l.numero, l.mes, l.ibc, l.persona]) assert.equal(h.veredicto, 'sin_comprobar')
  }
})

test('número dibujado cifra a cifra: coincide, pero no hay dónde resaltarlo', () => {
  const h = buscarNumero('Planilla N 6 0 1 6 0 8 7 4 4 0 pagada', '6016087440')
  assert.equal(h.veredicto, 'coincide')
  assert.equal(h.fragmento, null)
  // Y un número parecido con una cifra distinta no coincide.
  assert.equal(buscarNumero('Planilla N 6 0 1 6 0 8 7 4 4 1 pagada', '6016087440').veredicto, 'sin_comprobar')
})

test('mes abreviado con año, y la fecha de un pago no es un periodo', () => {
  assert.equal(buscarMes('Periodo: sep. 2026 IBC', 'SEPTIEMBRE').veredicto, 'coincide')
  assert.equal(buscarMes('Periodo: Sept 2026', 'SEPTIEMBRE').veredicto, 'coincide')
  assert.deepEqual(mesesDelDocumento('Fecha Referencia 25 Sep 2026 19:02'), [])
  assert.deepEqual(mesesDelDocumento('pagado el 5 de sep 2026'), [])
  // «mar» o «may» sueltos, sin año, no son meses.
  assert.deepEqual(mesesDelDocumento('el mar y may estaban cerca'), [])
})

test('el AÑO: septiembre de 2025 en un informe de 2026 es otro periodo aunque el mes coincida', () => {
  const h = buscarMes('Periodo cotización: septiembre de 2025', 'SEPTIEMBRE', 2026, 'OCTUBRE')
  assert.equal(h.veredicto, 'distinto')
  assert.equal(h.otroAnio, true)
  assert.equal(h.anio, 2025)
  assert.equal(h.mes, 'SEPTIEMBRE')
  // El mismo año coincide; y sin año en el documento no se objeta nada.
  assert.equal(buscarMes('septiembre de 2026', 'SEPTIEMBRE', 2026, 'OCTUBRE').veredicto, 'coincide')
  assert.equal(buscarMes('septiembre', 'SEPTIEMBRE', 2026, 'OCTUBRE').veredicto, 'coincide')
  assert.equal(buscarMes('septiembre 2025', 'SEPTIEMBRE', null, null).veredicto, 'coincide')
})

test('el año a caballo: el informe de enero cotiza diciembre del año anterior', () => {
  assert.equal(buscarMes('Periodo 2026-12', 'DICIEMBRE', 2027, 'ENERO').veredicto, 'coincide')
  assert.equal(buscarMes('Periodo 2027-12', 'DICIEMBRE', 2027, 'ENERO').veredicto, 'distinto')
  // Y un informe de diciembre no admite diciembre del año anterior.
  assert.equal(buscarMes('Periodo 2025-12', 'DICIEMBRE', 2026, 'DICIEMBRE').otroAnio, true)
})

test('septiembre/2026 y septiembre-2026 también se leen con año', () => {
  assert.equal(mesesDelDocumento('septiembre/2026')[0].anio, 2026)
  assert.equal(mesesDelDocumento('Septiembre - 2026')[0].anio, 2026)
})

test('IBC: decimales, miles partidos por un espacio y «$» sin separadores', () => {
  assert.deepEqual(montosDelDocumento('IBC 2.320.000,00 días 30').map(m => m.valor), [2_320_000])
  assert.deepEqual(montosDelDocumento('IBC 2,320,000.00').map(m => m.valor), [2_320_000])
  assert.deepEqual(montosDelDocumento('IBC 2.320 .000').map(m => m.valor), [2_320_000])
  assert.deepEqual(montosDelDocumento('IBC 2. 320. 000').map(m => m.valor), [2_320_000])
  assert.deepEqual(montosDelDocumento('IBC $2320000 días').map(m => m.valor), [2_320_000])
  assert.equal(buscarIbc('IBC $2320000 y $2320000 y $2320000', 2_320_000, PISO).veredicto, 'coincide')
  // Una cédula de 10 cifras sin «$» no es un monto.
  assert.deepEqual(montosDelDocumento('documento 1020304050'), [])
})

test('la cédula del contratista: con o sin puntos, con o sin ceros, y sin inventar', () => {
  assert.equal(buscarPersona('Cotizante 1.020.304.050 PERSONA', '1.020.304.050').veredicto, 'coincide')
  assert.equal(buscarPersona('Cotizante 1020304050 PERSONA', '1.020.304.050').veredicto, 'coincide')
  assert.equal(buscarPersona('Cotizante 1 020 304 050 PERSONA', '1020304050').veredicto, 'coincide')
  assert.equal(buscarPersona('Cotizante 8464867', '08464867').veredicto, 'coincide')
  // Pegada a otras cifras no cuenta; ausente o muy corta no prueba nada.
  assert.equal(buscarPersona('Cotizante 91020304050', '1020304050').veredicto, 'sin_comprobar')
  assert.equal(buscarPersona('Cotizante otro 99999999', '1020304050').veredicto, 'sin_comprobar')
  assert.equal(buscarPersona(SOI, null).veredicto, 'sin_comprobar')
  assert.equal(buscarPersona(SOI, '123').veredicto, 'sin_comprobar')
})

test('una planilla completa se lee entera, también con la persona', () => {
  const l = leerPlanilla([SOI], { ...ESPERADO, cedula: '1020304050' })
  assert.equal(l.calidad, 'ok')
  assert.equal(l.persona.veredicto, 'coincide')
  assert.equal(l.mes.veredicto, 'coincide')
  assert.equal(l.mes.otroAnio, false)
})

test('un texto enorme no congela la lectura', () => {
  const enorme = `${SOI} ` + 'IBC 1.000.000 septiembre 2026 DÍAS COT '.repeat(60_000)
  assert.ok(enorme.length > MAXIMO_CARACTERES)
  const inicio = Date.now()
  const l = leerPlanilla([enorme], ESPERADO)
  assert.ok(Date.now() - inicio < 3000, `tardó ${Date.now() - inicio} ms`)
  assert.equal(l.calidad, 'ok')
})

test('sin «lookbehind» en las expresiones: los Safari anteriores a 16.4 no lo entienden y la pantalla entera fallaría', () => {
  for (const ruta of ['lib/lectura-planilla.ts', 'lib/pdf-texto.ts']) {
    const fuente = fs.readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.ok(!fuente.includes('(?<!') && !fuente.includes('(?<='), `${ruta} usa lookbehind`)
  }
})

test('otro mes Y otro año: «septiembre de 2025» en un informe de octubre de 2026 no es un mes vencido', () => {
  const h = buscarMes('Periodo cotización: septiembre de 2025', 'OCTUBRE', 2026, 'OCTUBRE')
  assert.equal(h.veredicto, 'distinto')
  assert.equal(h.otroAnio, true)
  assert.equal(h.mes, 'SEPTIEMBRE')
  // En cambio, septiembre de 2026 sí es un mes vencido normal.
  const normal = buscarMes('Periodo cotización: septiembre de 2026', 'OCTUBRE', 2026, 'OCTUBRE')
  assert.equal(normal.veredicto, 'distinto')
  assert.equal(normal.otroAnio, false)
})

test('una foto de una planilla con el texto mal reconocido SÍ es una planilla: se lee lo que se pueda', () => {
  const FOTO =
    'f ::: sol Per1odo PLANILLA «n» APORTES «n» PAGO a c~vreNi2^ NolulBRE CIUDAD"UNICIplo: cEDULj` DE cniDAn^r`iiA ' +
    'FREDOw lA 46 4814 ON\'Co 9eegggg Comercio al par mayor de NO NUMERO PLANILLA: 6016087440 MES: julia Ano : 2026 ' +
    'FEaiiis eepinn FECHA DE PAGO DIAS DE MORA VALOR DE LA MORA $0 $ 508.300 $ 508.300 $ 508.300'
  assert.equal(calidadDelTexto(FOTO), 'ok')
  const l = leerPlanilla([FOTO], { numero: '6016087440', mes: 'JULIO', base: 508_300, piso: 100_000 })
  assert.equal(l.numero.veredicto, 'coincide')
  // El mes llegó como «julia»: no se inventa; queda sin comprobar.
  assert.equal(l.mes.veredicto, 'sin_comprobar')
  assert.equal(l.ibc.veredicto, 'coincide')
})
