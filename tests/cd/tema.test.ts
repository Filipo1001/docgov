import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import {
  ATRIBUTO_TEMA, CLAVE_TEMA, PREFERENCIAS_TEMA, SCRIPT_TEMA, leerPreferencia, rutaAdmiteTema, temaAplicado,
} from '@/lib/tema'

const CSS = readFileSync('app/globals.css', 'utf8')

// ─── La regla ────────────────────────────────────────────────────────────────

test('lo guardado se lee como una preferencia, y lo que no se entiende es «claro» (como siempre se ha visto)', () => {
  assert.deepEqual([...PREFERENCIAS_TEMA], ['claro', 'oscuro', 'sistema'])
  assert.equal(leerPreferencia('oscuro'), 'oscuro')
  assert.equal(leerPreferencia('sistema'), 'sistema')
  assert.equal(leerPreferencia('claro'), 'claro')
  for (const raro of [null, undefined, '', 'OSCURO', 'dark', 1, {}, 'oscuro ']) assert.equal(leerPreferencia(raro), 'claro', String(raro))
})

test('el tema aplicado: «automático» sigue al sistema; claro y oscuro no', () => {
  assert.equal(temaAplicado('claro', true), 'claro')
  assert.equal(temaAplicado('oscuro', false), 'oscuro')
  assert.equal(temaAplicado('sistema', true), 'oscuro')
  assert.equal(temaAplicado('sistema', false), 'claro')
})

test('el tema oscuro vale en el panel y el inicio de sesión, y en nada más (ni el módulo del plan, por ahora)', () => {
  for (const ok of ['/dashboard', '/dashboard/contratos', '/dashboard/contratos/abc/periodo/1', '/login', '/auth/nueva-contrasena', '/dashboard/perfil']) {
    assert.equal(rutaAdmiteTema(ok), true, ok)
  }
  for (const no of [
    '/', '/inicio', '/verificar/CD-FASD-X8SW', '/propuesta/caramanta', '/api/pdf/x', '/maintenance', '/dashboard/plan-desarrollo',
    '/dashboard/plan-desarrollo/indicadores', '/dashboardx', '/loginx', '/authors',
  ]) {
    assert.equal(rutaAdmiteTema(no), false, no)
  }
  assert.equal(rutaAdmiteTema('/dashboard/plan-desarrollox'), true, 'una ruta que solo se PARECE a la del módulo no queda fuera')
})

// ─── El script que corre antes de pintar ─────────────────────────────────────

/** Ejecuta el script tal como va en el `<head>`, con un navegador de mentira. Devuelve el atributo que quedó en la raíz. */
function correrScript(o: { ruta: string; guardado?: string | null; sistemaOscuro?: boolean; sinAlmacenamiento?: boolean }): string | null {
  let atributo: string | null = null
  const contexto = {
    location: { pathname: o.ruta },
    localStorage: {
      getItem: (k: string) => {
        if (o.sinAlmacenamiento) throw new Error('sin almacenamiento')
        return k === CLAVE_TEMA ? (o.guardado ?? null) : null
      },
    },
    matchMedia: () => ({ matches: o.sistemaOscuro === true }),
    document: { documentElement: { setAttribute: (k: string, v: string) => { if (k === ATRIBUTO_TEMA) atributo = v } } },
  }
  runInNewContext(SCRIPT_TEMA, contexto)
  return atributo
}

test('el script pone el tema oscuro solo cuando se eligió y la ruta lo admite', () => {
  assert.equal(correrScript({ ruta: '/dashboard', guardado: 'oscuro' }), 'oscuro')
  assert.equal(correrScript({ ruta: '/login', guardado: 'oscuro' }), 'oscuro')
  assert.equal(correrScript({ ruta: '/dashboard', guardado: 'sistema', sistemaOscuro: true }), 'oscuro')
  assert.equal(correrScript({ ruta: '/dashboard', guardado: 'sistema', sistemaOscuro: false }), null)
  assert.equal(correrScript({ ruta: '/dashboard', guardado: 'claro', sistemaOscuro: true }), null, 'claro es claro aunque el sistema sea oscuro')
  assert.equal(correrScript({ ruta: '/dashboard', guardado: null, sistemaOscuro: true }), null, 'sin elegir nada, como siempre: claro')
  assert.equal(correrScript({ ruta: '/dashboard', guardado: 'basura' }), null)
})

test('el script no toca nada fuera de donde vale el oscuro: el sitio público, /verificar, las propuestas y el módulo del plan', () => {
  for (const ruta of ['/', '/verificar/CD-FASD-X8SW', '/propuesta/venecia', '/dashboard/plan-desarrollo/reportes']) {
    assert.equal(correrScript({ ruta, guardado: 'oscuro' }), null, ruta)
  }
})

test('sin almacenamiento (navegación privada, políticas del navegador) el script no lanza y todo queda claro', () => {
  assert.equal(correrScript({ ruta: '/dashboard', sinAlmacenamiento: true }), null)
})

// ─── La paleta oscura ────────────────────────────────────────────────────────

const bloqueOscuro = (() => {
  const i = CSS.indexOf('html[data-tema="oscuro"] {')
  assert.ok(i > 0, 'globals.css trae el bloque del tema oscuro')
  return CSS.slice(i, CSS.indexOf('\n}\n', i))
})()

test('globals.css: claro por defecto, oscuro con el atributo, y la variante `dark:` disponible', () => {
  assert.match(CSS, /:root \{\s*color-scheme: light;/)
  assert.match(bloqueOscuro, /color-scheme: dark;/)
  assert.match(CSS, /@custom-variant dark \(&:where\(\[data-tema="oscuro"\], \[data-tema="oscuro"\] \*\)\);/)
  // Lo único que fuerza «light» es la raíz: nada más lo hace, ni siquiera sin el atributo.
  assert.equal(CSS.match(/color-scheme:\s*light/g)?.length, 1)
})

test('globals.css: los campos de formulario toman su color de una variable (no del #111827 de siempre) y la tinta tiene su par oscuro', () => {
  assert.match(CSS, /input, textarea, select \{\s*color: var\(--texto-campo\);/)
  assert.match(CSS, /--texto-campo: #111827;/)
  assert.match(bloqueOscuro, /--texto-campo: #E6E9EF;/)
  assert.match(CSS, /--tinta: #192031;/)
  assert.match(bloqueOscuro, /--tinta: #E6E9EF;/)
  assert.match(CSS, /--color-tinta: var\(--tinta\);/)
  assert.match(CSS, /--color-tinta-clara: var\(--tinta-clara\);/)
  assert.doesNotMatch(bloqueOscuro, /--color-black:/, 'el negro NO se toca: son los velos de los diálogos y las sombras')
})

const PASOS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

test('la paleta oscura redefine TODOS los pasos de los grises y del blanco', () => {
  assert.match(bloqueOscuro, /--color-white: #/)
  for (const f of ['gray', 'slate']) for (const p of PASOS) assert.match(bloqueOscuro, new RegExp(`--color-${f}-${p}: #`), `${f}-${p}`)
})

// Todo lo que el panel de Contratista Digital pide por clase de Tailwind (sin el módulo del plan, el sitio público ni las propuestas).
const EXCLUIDOS = ['app/dashboard/plan-desarrollo', 'components/pdm', 'components/folleto', 'lib/pdm', 'app/propuesta', 'app/inicio', 'app/verificar', 'app/amigosecreto']

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (EXCLUIDOS.some(e => ruta === e || ruta.startsWith(`${e}/`))) continue
    if (statSync(ruta).isDirectory()) archivos(ruta, salida)
    else if (/\.(tsx|ts)$/.test(nombre)) salida.push(ruta)
  }
  return salida
}
const ALCANCE = ['app/dashboard', 'app/login', 'app/auth', 'components', 'lib'].flatMap(d => archivos(d))

test('toda familia de color de Tailwind que usa el panel tiene su escala en la paleta oscura (si no, ahí quedaría un parche claro)', () => {
  const USO = /\b(?:bg|text|border|ring|divide|placeholder|from|to|via|fill|stroke|accent|outline|decoration|shadow)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(\d{2,3})\b/g
  const usados = new Map<string, Set<string>>()
  for (const ruta of ALCANCE) {
    for (const m of readFileSync(ruta, 'utf8').matchAll(USO)) {
      if (!usados.has(m[1])) usados.set(m[1], new Set())
      usados.get(m[1])!.add(m[2])
    }
  }
  assert.ok(usados.size >= 10, 'el análisis encontró las familias del panel')
  const sinEscala = [...usados.entries()].flatMap(([familia, pasos]) =>
    [...pasos].filter(p => !new RegExp(`--color-${familia}-${p}:`).test(bloqueOscuro)).map(p => `${familia}-${p}`))
  assert.deepEqual(sinEscala, [], 'añade la familia (o el paso) al bloque `html[data-tema="oscuro"]` de globals.css')
})

test('el panel no escribe la tinta de la marca a mano: usa `tinta` (así cambia con el tema)', () => {
  const sueltos = ALCANCE.flatMap(ruta =>
    [...readFileSync(ruta, 'utf8').matchAll(/(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide)-\[#(?:192031|242F45)\]/gi)].map(m => `${ruta}: ${m[0]}`))
  assert.deepEqual(sueltos, [], 'usa bg-tinta, text-tinta, border-tinta o hover:bg-tinta-clara')
})

// ─── Contraste ───────────────────────────────────────────────────────────────

type Lab = [number, number, number]

const lineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Un color de la paleta (#hex, oklch(L% C H) o la mezcla `color-mix(in oklab, <color> P%, #hex)`) en OKLab. */
function aOklab(color: string): Lab {
  const mezcla = /^color-mix\(in oklab, (oklch\([^)]*\)) ([\d.]+)%, (#[0-9A-Fa-f]{6})\)$/.exec(color)
  if (mezcla) {
    const [a, b] = [aOklab(mezcla[1]), aOklab(mezcla[3])]
    const p = Number(mezcla[2]) / 100
    return [0, 1, 2].map(k => b[k] * (1 - p) + a[k] * p) as Lab
  }
  const oklch = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/.exec(color)
  if (oklch) {
    const h = (Number(oklch[3]) * Math.PI) / 180
    return [Number(oklch[1]) / 100, Number(oklch[2]) * Math.cos(h), Number(oklch[2]) * Math.sin(h)]
  }
  const hex = color.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => lineal(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

/** Luminancia relativa WCAG de un color de la paleta. */
function luminancia(color: string): number {
  const [L, a, b] = aOklab(color)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const [r, g, bl] = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map(c => Math.min(1, Math.max(0, c)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const valorOscuro = (nombre: string): string => {
  const m = new RegExp(`--${nombre}:\\s*([^;]+);`).exec(bloqueOscuro)
  assert.ok(m, nombre)
  return m[1].trim()
}

test('el conversor de color de la prueba es fiable (blanco/negro y un gris conocido)', () => {
  assert.ok(Math.abs(contraste('#FFFFFF', '#000000') - 21) < 0.05)
  assert.ok(Math.abs(contraste('#767676', '#FFFFFF') - 4.54) < 0.05, 'el gris más claro que pasa 4,5 sobre blanco')
  // El mismo color escrito en oklch y en hex da el mismo resultado (rojo 500 de Tailwind ≈ #fb2c36).
  assert.ok(Math.abs(luminancia('oklch(63.7% 0.237 25.331)') - luminancia('#FB2C36')) < 0.01)
  assert.ok(Math.abs(luminancia('color-mix(in oklab, oklch(100% 0 0) 50%, #000000)') - luminancia('#636363')) < 0.01, 'la mezcla en oklab')
})

test('contraste (WCAG 4,5:1) de los pares que más se ven: texto sobre superficie y sobre el fondo de página', () => {
  const superficie = valorOscuro('color-white')
  const pagina = valorOscuro('color-gray-50')
  for (const [texto, fondo, nombre] of [
    ['gray-900', superficie, 'título sobre tarjeta'], ['gray-700', superficie, 'texto sobre tarjeta'], ['gray-600', superficie, 'texto secundario sobre tarjeta'],
    ['gray-500', superficie, 'texto apagado sobre tarjeta'], ['gray-400', superficie, 'texto más apagado e iconos sobre tarjeta'],
    ['gray-900', pagina, 'título sobre la página'], ['gray-500', pagina, 'texto apagado sobre la página'], ['gray-400', pagina, 'iconos sobre la página'],
  ] as const) {
    const r = contraste(valorOscuro(`color-${texto}`), fondo)
    assert.ok(r >= 4.5, `${nombre}: ${r.toFixed(2)}:1`)
  }
  assert.ok(contraste(valorOscuro('tinta'), superficie) >= 7, 'la tinta (títulos, botones, logo) sobre la superficie')
  // El botón primario (`bg-gray-900 text-white`): fondo claro, texto de la superficie oscura.
  assert.ok(contraste(superficie, valorOscuro('color-gray-900')) >= 7, 'botón primario')
})

test('contraste de los avisos de color: texto 700 sobre fondo 50 y texto 800 sobre fondo 100, en cada familia de estado', () => {
  const de = (familia: string, paso: number) => valorOscuro(`color-${familia}-${paso}`)
  for (const familia of ['red', 'amber', 'emerald', 'blue', 'green']) {
    for (const [texto, fondo] of [[700, 50], [800, 100], [600, 50]] as const) {
      const r = contraste(de(familia, texto), de(familia, fondo))
      assert.ok(r >= 4.5, `${familia}-${texto} sobre ${familia}-${fondo}: ${r.toFixed(2)}:1`)
    }
  }
})

// ─── Conexión ────────────────────────────────────────────────────────────────

test('el script va en el <head> de la raíz, el interruptor en la barra lateral y AplicarTema en el layout del panel', () => {
  const raiz = readFileSync('app/layout.tsx', 'utf8')
  assert.match(raiz, /SCRIPT_TEMA/)
  assert.match(raiz, /suppressHydrationWarning/)
  const panel = readFileSync('app/dashboard/layout.tsx', 'utf8')
  assert.match(panel, /<SelectorTema \/>/)
  assert.match(panel, /<AplicarTema \/>/)
  const logo = readFileSync('components/Logo.tsx', 'utf8')
  assert.match(logo, /const TINTA = 'var\(--tinta\)'/, 'el logo sigue a la tinta (y por tanto al tema)')
})
