import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QueryClient, QueryObserver, keepPreviousData } from '@tanstack/query-core'
import { conLimite } from '@/lib/con-limite'

/**
 * El comportamiento que /dashboard/informes necesita al cambiar de mes, comprobado con la misma configuración de consulta que
 * usa la pantalla: (1) mientras llega el mes nuevo se sigue viendo el anterior; (2) una petición colgada se vuelve un error
 * visible, no un «Cargando…» eterno; (3) reintentar vuelve a pedir y se recupera sin recargar; (4) un mes pedido de antemano
 * aparece al instante.
 */
const mes = (nombre: string) => ({ periodos: [{ id: nombre }], borradores: [] })
const colgada = () => new Promise<never>(() => {})
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

function observador(qc: QueryClient, clave: string, queryFn: () => Promise<unknown>, extra: Record<string, unknown> = {}) {
  return new QueryObserver(qc, {
    queryKey: ['informes-mes', clave], queryFn: () => conLimite(queryFn(), 'Informes del mes', 60),
    retry: 1, retryDelay: 10, placeholderData: keepPreviousData, staleTime: 60_000, ...extra,
  } as never)
}

test('al cambiar de mes se sigue viendo el anterior hasta que llega el nuevo', async () => {
  const qc = new QueryClient()
  await qc.fetchQuery({ queryKey: ['informes-mes', 'Noviembre'], queryFn: async () => mes('Noviembre') })
  let resolver: (v: unknown) => void = () => {}
  const previo = new QueryObserver(qc, { queryKey: ['informes-mes', 'Noviembre'], queryFn: async () => mes('Noviembre'), placeholderData: keepPreviousData } as never)
  const desuscribir = previo.subscribe(() => {})
  previo.setOptions({ queryKey: ['informes-mes', 'Octubre'], queryFn: () => conLimite(new Promise(r => { resolver = r }), 'x', 500), placeholderData: keepPreviousData } as never)
  const r = previo.getCurrentResult()
  assert.equal(r.isPlaceholderData, true, 'se marca como dato del mes anterior')
  assert.deepEqual((r.data as ReturnType<typeof mes>).periodos[0].id, 'Noviembre', 'y es el de noviembre')
  resolver(mes('Octubre'))
  await esperar(20)
  const fin = previo.getCurrentResult()
  assert.equal(fin.isPlaceholderData, false)
  assert.deepEqual((fin.data as ReturnType<typeof mes>).periodos[0].id, 'Octubre')
  desuscribir()
})

test('una petición colgada se vuelve un error visible y reintentable', async () => {
  const qc = new QueryClient()
  const obs = observador(qc, 'Septiembre', colgada)
  const desuscribir = obs.subscribe(() => {})
  await esperar(250)   // 60 ms de límite + 10 de espera + 60 del segundo intento
  const r = obs.getCurrentResult()
  assert.equal(r.isError, true, 'no queda cargando para siempre')
  assert.match((r.error as Error).message, /sin respuesta/)
  desuscribir()
})

test('reintentar tras un fallo se recupera sin recargar la página', async () => {
  const qc = new QueryClient()
  let intento = 0
  const obs = observador(qc, 'Agosto', async () => { intento++; if (intento <= 2) throw new Error('red'); return mes('Agosto') })
  const desuscribir = obs.subscribe(() => {})
  await esperar(100)
  assert.equal(obs.getCurrentResult().isError, true)
  await obs.refetch()
  const r = obs.getCurrentResult()
  assert.equal(r.isError, false)
  assert.deepEqual((r.data as ReturnType<typeof mes>).periodos[0].id, 'Agosto')
  desuscribir()
})

test('un mes pedido de antemano se ve al instante, sin pasar por «cargando»', async () => {
  const qc = new QueryClient()
  await qc.prefetchQuery({ queryKey: ['informes-mes', 'Julio'], queryFn: async () => mes('Julio'), staleTime: 300_000 })
  const obs = observador(qc, 'Julio', async () => { throw new Error('no debería pedirse: está fresco') }, { staleTime: 300_000 })
  const r = obs.getCurrentResult()
  assert.equal(r.isLoading, false)
  assert.equal(r.isFetching, false, 'está fresco: no hay petición')
  assert.deepEqual((r.data as ReturnType<typeof mes>).periodos[0].id, 'Julio')
})
