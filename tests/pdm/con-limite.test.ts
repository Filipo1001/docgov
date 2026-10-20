import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conLimite } from '@/lib/pdm/con-limite'

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

test('devuelve los resultados en el orden de los elementos, aunque terminen al revés', async () => {
  const r = await conLimite([30, 20, 10, 0], 4, async (ms, i) => { await espera(ms); return `${i}:${ms}` })
  assert.deepEqual(r, ['0:30', '1:20', '2:10', '3:0'])
})

test('nunca corre más tareas a la vez que el límite, y corre todas', async () => {
  let enCurso = 0
  let maximo = 0
  let hechas = 0
  const r = await conLimite(Array.from({ length: 30 }, (_, i) => i), 6, async i => {
    enCurso++
    maximo = Math.max(maximo, enCurso)
    await espera(2)
    enCurso--
    hechas++
    return i * 2
  })
  assert.equal(maximo, 6, 'llegó al límite sin pasarlo')
  assert.equal(hechas, 30)
  assert.deepEqual(r, Array.from({ length: 30 }, (_, i) => i * 2))
})

test('con menos elementos que el límite, no inventa trabajadores; con lista vacía devuelve vacío', async () => {
  let enCurso = 0
  let maximo = 0
  const r = await conLimite([1, 2], 6, async x => { enCurso++; maximo = Math.max(maximo, enCurso); await espera(2); enCurso--; return x })
  assert.deepEqual(r, [1, 2])
  assert.equal(maximo, 2)
  assert.deepEqual(await conLimite([], 6, async () => 1), [])
})

test('un límite absurdo (0, negativo, NaN) se trata como uno a la vez', async () => {
  for (const limite of [0, -3, Number.NaN]) {
    let enCurso = 0
    let maximo = 0
    await conLimite([1, 2, 3], limite, async () => { enCurso++; maximo = Math.max(maximo, enCurso); await espera(1); enCurso-- })
    assert.equal(maximo, 1, `límite ${limite}`)
  }
})

test('si una tarea lanza, el error se propaga y no se empieza ninguna más', async () => {
  const empezadas: number[] = []
  await assert.rejects(
    conLimite(Array.from({ length: 20 }, (_, i) => i), 2, async i => {
      empezadas.push(i)
      await espera(1)
      if (i === 3) throw new Error('falló la tarea 3')
      return i
    }),
    /falló la tarea 3/,
  )
  assert.ok(empezadas.length < 20, `no debió empezar las 20 (empezó ${empezadas.length})`)
})
