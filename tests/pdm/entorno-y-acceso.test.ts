/**
 * El interruptor del módulo y quién ve qué pestaña.
 *
 * Es la batería más importante de todas: protege a Contratista Digital. Si `entornoPermiteModulo` dijera «sí» donde no debe,
 * el módulo aparecería en producción frente a usuarios reales de una alcaldía.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entornoPermiteModulo, PDM_ENCENDIDO, produccionAbierta } from '@/lib/pdm/entorno'
import {
  esRutaPdm, insertarDebajoDeInicio, ITEM_PLAN_DESARROLLO, seccionActiva, seccionesPara,
  HREF_EVIDENCIAS, HREF_INDICADORES, HREF_REPORTES, HREF_RESPONSABLES,
} from '@/lib/pdm/menu'
import { esNivelHabilitable, gestiona, veDirectorio } from '@/lib/pdm/niveles'
import type { ItemMenu } from '@/lib/constants'

test('el módulo existe en vista previa y en desarrollo local', () => {
  assert.equal(entornoPermiteModulo('preview', 'production'), true)
  assert.equal(entornoPermiteModulo(undefined, 'development'), true)
  assert.equal(entornoPermiteModulo('', 'development'), true)
})

test('en producción NO existe si nadie lo enciende', () => {
  assert.equal(entornoPermiteModulo('production', 'production'), false)
  assert.equal(entornoPermiteModulo('production', 'production', undefined), false)
  assert.equal(entornoPermiteModulo('production', 'production', ''), false)
})

test('el interruptor solo enciende con el valor exacto', () => {
  assert.equal(PDM_ENCENDIDO, 'si')
  assert.equal(entornoPermiteModulo('production', 'production', 'si'), true)
  for (const casi of ['Si', 'SI', 'sí', ' si', 'si ', 'true', '1', 'yes', 'activo']) {
    assert.equal(entornoPermiteModulo('production', 'production', casi), false, `«${casi}» no debe encenderlo`)
  }
})

test('lo desconocido falla hacia lo cerrado', () => {
  assert.equal(entornoPermiteModulo(undefined, undefined), false)
  assert.equal(entornoPermiteModulo(undefined, 'production'), false)
  assert.equal(entornoPermiteModulo('staging', 'production', 'si'), false)
  assert.equal(entornoPermiteModulo('', '', 'si'), false)
})

test('«producción abierta» solo en producción con el interruptor (la vista previa nunca lo es)', () => {
  assert.equal(produccionAbierta('production', 'si'), true)
  assert.equal(produccionAbierta('production', undefined), false)
  assert.equal(produccionAbierta('preview', 'si'), false)
  assert.equal(produccionAbierta(undefined, 'si'), false)
})

test('qué rutas son del módulo (por segmento, no por prefijo suelto)', () => {
  const base = ITEM_PLAN_DESARROLLO.href
  assert.equal(esRutaPdm(base), true)
  assert.equal(esRutaPdm(`${base}/indicadores`), true)
  assert.equal(esRutaPdm(`${base}-x`), false)
  assert.equal(esRutaPdm('/dashboard'), false)
  assert.equal(esRutaPdm(null), false)
  assert.equal(esRutaPdm(undefined), false)
})

test('el botón va justo debajo de «Inicio», una sola vez, sin tocar la lista original', () => {
  const items: ItemMenu[] = [{ href: '/dashboard', label: 'Inicio', icono: 'inicio' } as ItemMenu, { href: '/dashboard/contratos', label: 'Contratos', icono: 'contratos' } as ItemMenu]
  const copia = [...items]
  const con = insertarDebajoDeInicio(items, ITEM_PLAN_DESARROLLO)
  assert.deepEqual(con.map(i => i.href), ['/dashboard', ITEM_PLAN_DESARROLLO.href, '/dashboard/contratos'])
  assert.deepEqual(items, copia)
  assert.deepEqual(insertarDebajoDeInicio(con, ITEM_PLAN_DESARROLLO), con)
  assert.equal(insertarDebajoDeInicio([items[1]], ITEM_PLAN_DESARROLLO)[0].href, ITEM_PLAN_DESARROLLO.href)
})

test('las pestañas de cada nivel', () => {
  const de = (n: Parameters<typeof seccionesPara>[0]) => seccionesPara(n).map(s => s.rotulo)
  assert.deepEqual(de('admin'), ['Resumen', 'Indicadores', 'Reportes', 'Evidencias', 'Responsables'])
  assert.deepEqual(de('coordinador'), ['Resumen', 'Indicadores', 'Reportes', 'Evidencias', 'Responsables'])
  assert.deepEqual(de('consulta'), ['Resumen', 'Indicadores', 'Reportes', 'Evidencias', 'Responsables'])
  assert.deepEqual(de('responsable'), ['Mi trabajo', 'Indicadores', 'Evidencias'])
  assert.deepEqual(de(null), ['Resumen', 'Indicadores', 'Evidencias'])
})

test('la pestaña activa', () => {
  const base = ITEM_PLAN_DESARROLLO.href
  assert.equal(seccionActiva(base), base)
  assert.equal(seccionActiva(`${base}/`), base)
  assert.equal(seccionActiva(`${HREF_INDICADORES}?abrir=5`.split('?')[0]), HREF_INDICADORES)
  assert.equal(seccionActiva(`${HREF_REPORTES}/algo`), HREF_REPORTES)
  assert.equal(seccionActiva(HREF_EVIDENCIAS), HREF_EVIDENCIAS)
  assert.equal(seccionActiva(HREF_RESPONSABLES), HREF_RESPONSABLES)
  assert.equal(seccionActiva('/dashboard/contratos'), null)
  assert.equal(seccionActiva(null), null)
})

test('niveles: quién gestiona y quién ve el directorio', () => {
  assert.deepEqual(['admin', 'coordinador', 'consulta', 'responsable', null].map(n => gestiona(n as never)), [true, true, false, false, false])
  assert.deepEqual(['admin', 'coordinador', 'consulta', 'responsable', null].map(n => veDirectorio(n as never)), [true, true, true, false, false])
  assert.equal(esNivelHabilitable('admin'), false)
  assert.equal(esNivelHabilitable('consulta'), true)
  assert.equal(esNivelHabilitable('Coordinador'), false)
})
