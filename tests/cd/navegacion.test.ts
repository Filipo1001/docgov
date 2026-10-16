import assert from 'node:assert/strict'
import { test } from 'node:test'
import { debeIrAlLogin, esNavegacionDeDocumento } from '../../lib/navegacion'

const cab = (o: Record<string, string>) => new Headers(o)

test('navegar a una dirección es un documento, venga o no el Accept', () => {
  assert.equal(esNavegacionDeDocumento(cab({ 'sec-fetch-dest': 'document' })), true)
  assert.equal(esNavegacionDeDocumento(cab({ 'sec-fetch-dest': 'document', accept: '*/*' })), true)
})

test('una imagen, un fetch o un script no son navegación, aunque acepten HTML', () => {
  for (const destino of ['image', 'empty', 'script', 'style', 'iframe', 'font']) {
    assert.equal(esNavegacionDeDocumento(cab({ 'sec-fetch-dest': destino, accept: 'text/html,*/*' })), false, destino)
  }
})

test('sin Sec-Fetch-Dest se decide por Accept: solo HTML explícito cuenta', () => {
  assert.equal(esNavegacionDeDocumento(cab({ accept: 'text/html,application/xhtml+xml,*/*;q=0.8' })), true)
  assert.equal(esNavegacionDeDocumento(cab({ accept: '*/*' })), false)
  assert.equal(esNavegacionDeDocumento(cab({ accept: 'application/json' })), false)
  assert.equal(esNavegacionDeDocumento(cab({ accept: 'image/avif,image/webp,*/*' })), false)
  assert.equal(esNavegacionDeDocumento(cab({})), false)
})

test('solo /api (menos /api/cron) lleva al login', () => {
  const nav = cab({ 'sec-fetch-dest': 'document' })
  assert.equal(debeIrAlLogin('/api/avatar/abc/foto.jpg', nav), true)
  assert.equal(debeIrAlLogin('/api/pdf/123/paquete', nav), true)
  assert.equal(debeIrAlLogin('/api/contratos/export', nav), true)
  assert.equal(debeIrAlLogin('/api/cron/recordatorios', nav), false)
  assert.equal(debeIrAlLogin('/api/cron/reporte-mensual', nav), false)
})

test('lo que no es /api nunca se toca, y /verificar menos que nada', () => {
  const nav = cab({ 'sec-fetch-dest': 'document' })
  for (const ruta of ['/verificar/CD-PFGS-R4MX', '/dashboard', '/login', '/', '/apix', '/api']) {
    assert.equal(debeIrAlLogin(ruta, nav), false, ruta)
  }
})

test('la misma ruta de la API pedida por una imagen o un fetch sigue recibiendo el 401 en JSON', () => {
  assert.equal(debeIrAlLogin('/api/avatar/abc/foto.jpg', cab({ 'sec-fetch-dest': 'image', accept: 'image/*' })), false)
  assert.equal(debeIrAlLogin('/api/supervisor/colaboradores', cab({ 'sec-fetch-dest': 'empty', accept: '*/*' })), false)
})
