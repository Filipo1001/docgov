import * as ev from '@/lib/pdm/evidencias-armar'
import type { Indicador } from '@/lib/pdm/plan'
import type { EstadoReporte } from '@/lib/pdm/seguimiento'
import * as sem from '@/lib/pdm/semaforo'

let mal = 0, total = 0
const es = (n: string, o: unknown, e: unknown) => { total++; if (JSON.stringify(o) !== JSON.stringify(e)) { mal++; console.log('FALLA', n, '\n  esperado', JSON.stringify(e), '\n  obtuvo  ', JSON.stringify(o)) } }

const DEPS = ['Secretaría General de Gobierno', 'Secretaría de Bienestar Social']

// ── limpiarBusqueda / claveDeBusqueda ──
es('texto normal', ev.limpiarBusqueda('acta de inicio'), 'acta de inicio')
es('comas y paréntesis', ev.limpiarBusqueda('a,b)(c'), 'a b c')
es('comodines y comillas', ev.limpiarBusqueda(`50%*"x'`), '50 x')
es('dos puntos y barras', ev.limpiarBusqueda('a:b/c\\d'), 'a b c d')
es('tildes y eñes', ev.limpiarBusqueda('Transacción año'), 'Transacción año')
es('punto, guion y guion bajo se quedan', ev.limpiarBusqueda('foto_1-final.pdf'), 'foto_1-final.pdf')
es('espacios de más', ev.limpiarBusqueda('  a    b  '), 'a b')
es('solo basura', ev.limpiarBusqueda(',,,()'), '')
es('tope de largo', ev.limpiarBusqueda('x'.repeat(200)).length, 60)
es('emoji', ev.limpiarBusqueda('ok ✅ listo'), 'ok listo')
const K = ev.claveDeBusqueda
es('sin tildes y en minúsculas', K('Transacción'), 'transaccion')
es('mayúsculas acentuadas', K('TRANSACCIÓN AÑO'), 'transaccion ano')
es('tilde descompuesta', K('Transacción'), 'transaccion')
es('la eñe y la diéresis', K('pingüino niño'), 'pinguino nino')
es('el guion bajo se escapa', K('foto_1'), 'foto\\_1')

// ── leerFiltros: siempre UN año ──
const L = (p: Record<string, string | string[] | undefined>, hoy = 2026) => ev.leerFiltros(p, DEPS, hoy)
es('sin nada: el año de hoy y nada más', L({}), { anio: 2026, q: '', estado: null, dependencia: null, pagina: 1 })
es('el año de hoy sigue al reloj', L({}, 2025).anio, 2025)
es('antes del plan se abre en el primer año', L({}, 2020).anio, 2024)
es('después del plan se abre en el último', L({}, 2035).anio, 2027)
es('año del plan', L({ anio: '2025' }).anio, 2025)
es('año fuera del plan: el de hoy', L({ anio: '2030' }).anio, 2026)
es('año basura: el de hoy', L({ anio: '2025abc' }).anio, 2026)
es('nunca hay «todos los años»', L({ anio: '' }).anio, 2026)
es('estado conocido', L({ estado: 'devuelto' }).estado, 'devuelto')
es('«observado» ya no es un estado', L({ estado: 'observado' }).estado, null)
es('estado desconocido se ignora', L({ estado: 'raro' }).estado, null)
es('secretaría del plan', L({ dependencia: DEPS[0] }).dependencia, DEPS[0])
es('secretaría inventada se ignora', L({ dependencia: 'Otra' }).dependencia, null)
es('página', L({ pagina: '3' }).pagina, 3)
es('página 0 o basura: la primera', [L({ pagina: '0' }).pagina, L({ pagina: 'x' }).pagina, L({ pagina: '-2' }).pagina], [1, 1, 1])
es('arreglo: el primero', L({ estado: ['aprobado', 'devuelto'] }).estado, 'aprobado')
es('búsqueda limpia', L({ q: 'a,b)' }).q, 'a b')
es('un filtro que viaja entero', ev.aParametros({ anio: 2025, q: 'acta', estado: 'aprobado', dependencia: DEPS[0], pagina: 2 }).toString(), 'anio=2025&q=acta&estado=aprobado&dependencia=Secretar%C3%ADa+General+de+Gobierno&pagina=2')
es('el año siempre se escribe; lo demás solo si hay', ev.aParametros({ anio: 2026, pagina: 1 }).toString(), 'anio=2026')
es('ida y vuelta', L(Object.fromEntries(ev.aParametros({ anio: 2024, q: 'acta', estado: 'pendiente', pagina: 4 }))), { anio: 2024, q: 'acta', estado: 'pendiente', dependencia: null, pagina: 4 })
es('hayFiltros no cuenta el año ni la página', [ev.hayFiltros({ anio: 2025, q: '', estado: null, dependencia: null, pagina: 3 }), ev.hayFiltros({ anio: 2025, q: 'x', estado: null, dependencia: null, pagina: 1 })], [false, true])

// ── rangoDePagina ──
es('sin filas', ev.rangoDePagina(1, 0), { desde: 0, hasta: 0, paginas: 1, pagina: 1 })
es('una página', ev.rangoDePagina(1, 10), { desde: 1, hasta: 10, paginas: 1, pagina: 1 })
es('la segunda', ev.rangoDePagina(2, 54), { desde: 26, hasta: 50, paginas: 3, pagina: 2 })
es('la última, incompleta', ev.rangoDePagina(3, 54), { desde: 51, hasta: 54, paginas: 3, pagina: 3 })
es('una página que no existe se lleva a la última', ev.rangoDePagina(9, 54).pagina, 3)

// ── Un mismo archivo en varios indicadores (siempre del mismo año) ──
const F = (id: string, ind: string, extra: Partial<ev.FilaDeVista> = {}): ev.FilaDeVista => ({
  id, reporte_id: 'r-' + id, nombre: 'Acta de comité.pdf', tipo: 'application/pdf', bytes: 1000, conservada: false, indicador_id: ind, indicador_fila: 10, codigo: '1.1.1', indicador: 'Ind ' + ind,
  sector: 'Educación', dependencia: 'Secretaría X', anio: 2026, valor: 1, autor_nombre: 'ANA PROPIA', reportado_en: '2026-09-01T12:00:00Z', estado_reporte: 'pendiente', reemplazada: false, observacion: null, ...extra,
})
const R = (id: string, ind: string, extra: Partial<ev.FilaRelacionable> = {}): ev.FilaRelacionable => ({
  id, indicador_id: ind, indicador_fila: 20, codigo: '2.2.2', indicador: 'Ind ' + ind, sector: 'Salud', dependencia: 'Secretaría Y', anio: 2026, estado_reporte: 'aprobado', nombre: 'Acta de comité.pdf', bytes: 1000, tipo: 'application/pdf', ...extra,
})
es('la clave ignora mayúsculas y normaliza la tilde', ev.claveDeArchivo({ nombre: 'Transacción.PDF', bytes: 5, tipo: 'application/pdf' }), ev.claveDeArchivo({ nombre: 'transacción.pdf', bytes: '5', tipo: 'application/pdf' }))
es('distinto tamaño: otro archivo', ev.claveDeArchivo({ nombre: 'a.pdf', bytes: 5, tipo: 'x' }) === ev.claveDeArchivo({ nombre: 'a.pdf', bytes: 6, tipo: 'x' }), false)
es('distinto tipo: otro archivo', ev.claveDeArchivo({ nombre: 'a', bytes: 5, tipo: 'image/png' }) === ev.claveDeArchivo({ nombre: 'a', bytes: 5, tipo: 'image/jpeg' }), false)
es('nombres pedibles: sin comillas ni barras, sin repetir', ev.nombresPedibles([{ nombre: 'a.pdf' }, { nombre: 'a.pdf' }, { nombre: 'b"c.pdf' }, { nombre: 'd\\e.pdf' }, { nombre: 'f (1).pdf' }, { nombre: '' }]), ['a.pdf', 'f (1).pdf'])
const filasR = [F('e1', 'i1')]
es('sin otros: nada', ev.relacionar(filasR, [R('x1', 'i1')]).size, 0)
es('el propio indicador no cuenta', ev.relacionar(filasR, [R('x1', 'i1', { anio: 2026 })]).size, 0)
es('otro indicador con el mismo archivo EL MISMO AÑO: se relaciona', ev.relacionar(filasR, [R('x2', 'i2')]).get('e1')?.map(o => o.indicadorFila), [20])
es('el mismo archivo en OTRO AÑO no se mezcla', ev.relacionar(filasR, [R('x2', 'i2', { anio: 2025 })]).size, 0)
es('mismo nombre pero distinto tamaño: no es el mismo archivo', ev.relacionar(filasR, [R('x2', 'i2', { bytes: 999 })]).size, 0)
es('mismo nombre y tamaño pero distinto tipo: no es el mismo', ev.relacionar(filasR, [R('x2', 'i2', { tipo: 'image/png' })]).size, 0)
es('mayúsculas distintas en el nombre: es el mismo', ev.relacionar(filasR, [R('x2', 'i2', { nombre: 'ACTA DE COMITÉ.PDF' })]).size, 1)
es('el mismo indicador dos veces cuenta una', ev.relacionar(filasR, [R('x2', 'i2'), R('x3', 'i2')]).get('e1')?.length, 1)
es('orden por código, numérico', ev.relacionar(filasR, [R('a', 'i2', { codigo: '3.1.1' }), R('b', 'i3', { codigo: '10.1.1' }), R('c', 'i4', { codigo: '2.1.1' })]).get('e1')?.map(o => o.codigo), ['2.1.1', '3.1.1', '10.1.1'])
es('el estado se entiende; uno raro no se inventa', ev.relacionar(filasR, [R('a', 'i2', { estado_reporte: 'devuelto' }), R('b', 'i3', { estado_reporte: 'raro' })]).get('e1')?.map(o => o.estado), ['devuelto', null])
es('cada archivo recibe SU lista', (() => { const m = ev.relacionar([F('e1', 'i1'), F('e2', 'i2', { nombre: 'Otro.pdf' })], [R('a', 'i3'), R('b', 'i4', { nombre: 'Otro.pdf' })]); return [m.get('e1')?.length, m.get('e2')?.length] })(), [1, 1])

// ── Indicadores sintéticos con su reporte de cada año ──
interface Rep { estado: EstadoReporte; creado: string; n: number; autor?: string; validador?: string }
const IND = (id: number, dep: string, reportes: Partial<Record<number, Rep>>): Indicador => ({
  id, uuid: `u${id}`, codigo: `1.1.${id}`, linea: 'L', sector: 'Educación', programa: 'P', producto: 'X', indicador: `Indicador ${id}`, unidad: 'n', dependencia: dep, responsable: 'x', asignados: [],
  lineaBase: null, metaCuatrienio: null, anio: 2026, meta: 10, avance: null, enAnio: null,
  anios: [2024, 2025, 2026, 2027].map(a => {
    const r = reportes[a]
    return { anio: a, meta: 10, avance: null, enAnio: r ? { situacion: r.estado, reporte: { reporteId: `r${id}-${a}`, valor: 1, estado: r.estado, autorId: 'u', autorNombre: r.autor ?? 'ANA PROPIA', creado: r.creado, nEvidencias: r.n, esCorreccion: false, validacionComentario: null, validadorNombre: r.validador ?? null } } : { situacion: 'falta' as const, reporte: null } }
  }),
}) as unknown as Indicador

const A = IND(1, DEPS[0], { 2026: { estado: 'aprobado', creado: '2026-09-03T12:00:00Z', n: 1, validador: 'SARA SÁNCHEZ VÉLEZ' } })
const B = IND(2, DEPS[1], { 2026: { estado: 'pendiente', creado: '2026-09-10T12:00:00Z', n: 3 }, 2025: { estado: 'aprobado', creado: '2025-11-01T12:00:00Z', n: 2 } })
const C = IND(3, DEPS[0], { 2026: { estado: 'devuelto', creado: '2026-09-07T12:00:00Z', n: 2 } })
const D = IND(4, DEPS[0], {})                                                           // sin reportes
const E = IND(5, DEPS[1], { 2026: { estado: 'pendiente', creado: '2026-09-07T12:00:00Z', n: 0 } }) // reporte sin archivos (corrección del admin)
const TODOS = [A, B, C, D, E]
type FiltroDeEvidencias = Parameters<typeof ev.indicadoresConEvidencia>[1]
const base: FiltroDeEvidencias = { anio: 2026, estado: null, dependencia: null }
const filtrar = (f: Partial<FiltroDeEvidencias> = {}, ids: Set<string> | null = null) => ev.indicadoresConEvidencia(TODOS, { ...base, ...f }, ids).map(i => i.id)

es('solo los que tienen evidencia ese año (sin reporte o sin archivos no salen)', filtrar(), [2, 3, 1])
es('orden: lo más reciente primero', filtrar(), [2, 3, 1])
es('2025: solo el que tiene evidencia ese año', filtrar({ anio: 2025 }), [2])
es('2024: nadie', filtrar({ anio: 2024 }), [])
es('los años no se mezclan: el de 2025 no aparece en 2026 por eso', filtrar().includes(2) && filtrar({ anio: 2025 }).includes(2), true)
es('por estado del último reporte', [filtrar({ estado: 'aprobado' }), filtrar({ estado: 'pendiente' }), filtrar({ estado: 'devuelto' })], [[1], [2], [3]])
es('por secretaría', filtrar({ dependencia: DEPS[0] }), [3, 1])
es('estado y secretaría juntos', filtrar({ estado: 'pendiente', dependencia: DEPS[0] }), [])
es('con la búsqueda de la base: solo los que coinciden', filtrar({}, new Set(['u1', 'u3'])), [3, 1])
es('una búsqueda sin coincidencias', filtrar({}, new Set()), [])
es('una búsqueda con coincidencias de otros años no mezcla', filtrar({ anio: 2024 }, new Set(['u1', 'u2'])), [])
es('un empate de fecha se ordena por el número del indicador', ev.indicadoresConEvidencia([IND(9, DEPS[0], { 2026: { estado: 'aprobado', creado: 'X', n: 1 } }), IND(7, DEPS[0], { 2026: { estado: 'aprobado', creado: 'X', n: 1 } })], base, null).map(i => i.id), [7, 9])
es('lista vacía', ev.indicadoresConEvidencia([], base, null), [])

// ── Las filas ──
const AR = (id: string, ind: string, extra: Partial<ev.FilaDeVista> = {}) => F(id, ind, { indicador_id: ind, ...extra })
const arch = [
  AR('f1', 'u1', { nombre: 'acta.pdf', reportado_en: '2026-09-03T12:00:00Z', estado_reporte: 'aprobado' }),
  AR('f2', 'u2', { nombre: 'foto.png', tipo: 'image/png', bytes: 5000, reportado_en: '2026-09-10T12:00:00Z' }),
  AR('f3', 'u2', { nombre: 'acta-b.pdf', reportado_en: '2026-09-09T12:00:00Z', reporte_id: 'otro' }),
  AR('f4', 'u2', { nombre: 'lista.xlsx', tipo: 'application/vnd.ms-excel', reportado_en: '2026-09-10T12:00:00Z' }),
  AR('f5', 'u2', { nombre: 'del-2025.pdf', anio: 2025 }),                       // otro año: no entra
  AR('f6', 'u2', { nombre: 'vieja.pdf', reemplazada: true }),                   // versión anterior: no entra
  AR('f7', 'u3', { nombre: 'devuelto.pdf', observacion: 'No abre', estado_reporte: 'devuelto', conservada: true }),
]
const filas = ev.armarFilasIndicador([B, A, C], 2026, arch)
es('una fila por indicador, en el orden que se le da', filas.map(f => f.indicadorFila), [2, 1, 3])
es('un solo archivo: un solo archivo', filas[1].archivos.map(a => a.nombre), ['acta.pdf'])
es('varios: todos los de ESE año, vigentes, del más reciente al más antiguo', filas[0].archivos.map(a => a.nombre), ['foto.png', 'lista.xlsx', 'acta-b.pdf'])
es('el archivo de otro año y el de una versión anterior no se mezclan', filas[0].archivos.some(a => a.nombre === 'del-2025.pdf' || a.nombre === 'vieja.pdf'), false)
es('la fila lleva lo del último reporte del año', [filas[0].estado, filas[0].autor, filas[0].reportadoEn], ['pendiente', 'Ana Propia', '2026-09-10T12:00:00Z'])
es('categoría y tamaño', filas[0].archivos.map(a => [a.categoria, a.bytes]), [['imagen', 5000], ['excel', 1000], ['pdf', 1000]])
es('la nota de devolución y lo conservado viajan con SU archivo', [filas[2].archivos[0].observacion, filas[2].archivos[0].conservada, filas[2].archivos[0].estado], ['No abre', true, 'devuelto'])
es('cada archivo dice el reporte al que pertenece', filas[0].archivos.map(a => a.reporteId), ['r-f2', 'r-f4', 'otro'])
es('un indicador sin archivos en la lista pedida: fila vacía, no se pierde', ev.armarFilasIndicador([A], 2026, []).map(f => f.archivos.length), [0])
es('archivos de OTRO indicador no se cuelan', ev.armarFilasIndicador([A], 2026, [AR('z', 'u9')])[0].archivos.length, 0)
es('«también» llega por archivo', ev.armarFilasIndicador([A], 2026, [AR('f1', 'u1')], ev.relacionar([AR('f1', 'u1')], [R('x', 'u8')]))[0].archivos[0].tambien.length, 1)
es('resumen de tipos: lo más frecuente primero', ev.resumenDeTipos(filas[0].archivos), 'Excel · Imagen · PDF')
es('resumen con repetidos', ev.resumenDeTipos([{ categoria: 'pdf' }, { categoria: 'pdf' }, { categoria: 'imagen' }, { categoria: 'pdf' }]), 'PDF ×3 · Imagen')
es('un tipo que no se conoce no se esconde', ev.resumenDeTipos([{ categoria: null }]), 'Otro')


// ── El semáforo ──
es('tres luces, de arriba abajo: rojo, ámbar, verde', sem.LUCES, ['rojo', 'ambar', 'verde'])
es('cada estado tiene su luz', [sem.LUZ_DE.devuelto, sem.LUZ_DE.pendiente, sem.LUZ_DE.aprobado], ['rojo', 'ambar', 'verde'])
es('las palabras son las del módulo', [sem.PALABRA_DE.devuelto, sem.PALABRA_DE.pendiente, sem.PALABRA_DE.aprobado], ['Devuelto', 'Sin validar', 'Aprobado'])
es('lo que más urge primero', sem.ESTADOS_POR_URGENCIA, ['devuelto', 'pendiente', 'aprobado'])
es('el recuento y el semáforo hablan de los mismos estados', [...sem.ESTADOS_POR_URGENCIA].sort(), Object.keys(sem.LUZ_DE).sort())
const D0 = { autor: 'Felipe Restrepo Ceballos', dependencia: 'Secretaría General de Gobierno', validador: 'Sara Sánchez Vélez' }
es('devuelto: le toca a quien reportó (su primer nombre)', sem.lineaDeSemaforo('devuelto', D0), 'Lo corrige Felipe')
es('sin validar: le toca a la secretaría', sem.lineaDeSemaforo('pendiente', D0), 'Lo valida Secretaría General de Gobierno')
es('aprobado: quién lo aprobó', sem.lineaDeSemaforo('aprobado', D0), 'Lo aprobó Sara Sánchez Vélez')
es('aprobado sin saber quién: no se inventa', [sem.lineaDeSemaforo('aprobado', { ...D0, validador: null }), sem.lineaDeSemaforo('aprobado', { ...D0, validador: '  ' })], [null, null])
es('devuelto sin autor: no se inventa', sem.lineaDeSemaforo('devuelto', { ...D0, autor: '' }), null)
es('sin secretaría: no se inventa', sem.lineaDeSemaforo('pendiente', { ...D0, dependencia: ' ' }), null)
es('los espacios de sobra no estorban', sem.lineaDeSemaforo('devuelto', { ...D0, autor: '  Ana   Propia ' }), 'Lo corrige Ana')

// ── Los contadores de los chips ──
const contar = (f: { anio?: number; dependencia?: string | null } = {}, ids: Set<string> | null = null) => ev.contarPorEstado(TODOS, { anio: 2026, dependencia: null, ...f }, ids)
es('cuenta cada estado (sin reporte o sin archivos no cuentan)', contar(), { devuelto: 1, pendiente: 1, aprobado: 1 })
es('2025', contar({ anio: 2025 }), { devuelto: 0, pendiente: 0, aprobado: 1 })
es('2024: nadie', contar({ anio: 2024 }), { devuelto: 0, pendiente: 0, aprobado: 0 })
es('con la secretaría puesta', contar({ dependencia: DEPS[0] }), { devuelto: 1, pendiente: 0, aprobado: 1 })
es('con la búsqueda puesta', contar({}, new Set(['u1'])), { devuelto: 0, pendiente: 0, aprobado: 1 })
es('NO depende del estado elegido: los otros chips no se ponen en cero', [ev.indicadoresConEvidencia(TODOS, { anio: 2026, estado: 'aprobado', dependencia: null }, null).length, contar()], [1, { devuelto: 1, pendiente: 1, aprobado: 1 }])
es('la suma de los chips es «Todos» (lo que la lista mostraría sin elegir estado)', (() => { const c = contar({ dependencia: DEPS[1] }); return c.devuelto + c.pendiente + c.aprobado })(), filtrar({ dependencia: DEPS[1] }).length)
es('cada chip coincide con lo que la lista muestra al elegirlo', ['devuelto', 'pendiente', 'aprobado'].map(e => contar({ dependencia: DEPS[0] })[e as EstadoReporte] === filtrar({ estado: e as EstadoReporte, dependencia: DEPS[0] }).length), [true, true, true])
es('«sin conteo» está en ceros y no se comparte', (() => { const a = { ...ev.SIN_CONTEO }; a.devuelto = 9; return [ev.SIN_CONTEO.devuelto, a.devuelto] })(), [0, 9])
es('el validador viaja a la fila, con nombre propio', ev.armarFilasIndicador([A], 2026, [AR('f1', 'u1')])[0].validador, 'Sara Sánchez Vélez')
es('sin validador: null', ev.armarFilasIndicador([B], 2026, [AR('f2', 'u2')])[0].validador, null)

// Esta batería no toca ninguna base: lo que se comprobaba contra los archivos reales (búsqueda, años) se corre aparte, a mano.
console.log(`\n${total - mal} de ${total} casos bien${mal ? ` · ${mal} FALLAN` : ''}`)
if (mal) process.exit(1)
