import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { COMPACTA_DESDE, VISIBLES_EN_LISTA, partirLista, textoVerResto } from '@/lib/pdm/lista-compacta'
import { MAX_EVIDENCIAS } from '@/lib/pdm/seguimiento-acciones'

const n = (k: number) => Array.from({ length: k }, (_, i) => i + 1)

test('una lista corta se ve entera; desde nueve se ven cinco y el resto se despliega', () => {
  assert.equal(VISIBLES_EN_LISTA, 5)
  assert.equal(COMPACTA_DESDE, 9)
  for (const k of [0, 1, 5, 8]) assert.deepEqual(partirLista(n(k)), { primeros: n(k), resto: [] }, `${k} se ven todos`)
  assert.deepEqual(partirLista(n(9)), { primeros: [1, 2, 3, 4, 5], resto: [6, 7, 8, 9] })
  const cien = partirLista(n(MAX_EVIDENCIAS))
  assert.deepEqual(cien.primeros, [1, 2, 3, 4, 5])
  assert.equal(cien.resto.length, MAX_EVIDENCIAS - 5)
  assert.deepEqual([...cien.primeros, ...cien.resto], n(MAX_EVIDENCIAS), 'en el mismo orden, sin perder ni repetir nada')
})

test('el botón nunca esconde menos de cuatro (esconder uno o dos estorba más de lo que ahorra)', () => {
  for (let k = 0; k <= MAX_EVIDENCIAS; k++) {
    const { resto } = partirLista(n(k))
    assert.ok(resto.length === 0 || resto.length >= 4, `${k}: esconde ${resto.length}`)
  }
  // Con otros valores (la regla no deja una lista «compacta» que no esconda nada).
  assert.deepEqual(partirLista(n(6), 6, 3), { primeros: n(6), resto: [] })
})

test('lo que dice el botón', () => {
  assert.equal(textoVerResto(95), 'Ver los 95 archivos restantes')
  assert.equal(textoVerResto(1), 'Ver el archivo restante')
  assert.equal(textoVerResto(4, { uno: 'archivo marcado', varios: 'archivos marcados' }), 'Ver los 4 archivos marcados restantes')
})

test('las listas de archivos del módulo usan la lista compacta', () => {
  // Si alguien vuelve a pintar con `.map` una de estas listas, con cien archivos la pantalla se vuelve kilométrica.
  const usa = (archivo: string) => readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8').includes('<ListaCompacta')
  for (const archivo of [
    'components/pdm/FormularioReporte.tsx',
    'components/pdm/ZonaEvidencias.tsx',
    'components/pdm/SeguimientoIndicador.tsx',
    'components/pdm/EvidenciasPdm.tsx',
    'components/pdm/verificacion/ArchivosDeConstancia.tsx',
  ]) assert.ok(usa(archivo), `${archivo} usa <ListaCompacta>`)
})
