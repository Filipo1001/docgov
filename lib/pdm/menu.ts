import type { ItemMenu } from '@/lib/constants'
import { entornoPermiteModulo } from '@/lib/pdm/entorno'
import { veDirectorio, type NivelPdm } from '@/lib/pdm/niveles'

/**
 * El botón del módulo en la barra lateral del administrador.
 *
 * `destacado` hace que la barra lo pinte con su propio estilo y no con el de un
 * elemento de menú corriente: es el único botón de la barra que no pertenece a
 * la gestión contractual, y tiene que leerse como algo distinto.
 */
export const ITEM_PLAN_DESARROLLO: ItemMenu = {
  href: '/dashboard/plan-desarrollo',
  label: 'Plan de Desarrollo',
  icono: 'planDesarrollo',
  destacado: true,
}

/**
 * Coloca `extra` justo debajo de «Inicio».
 *
 * Es idempotente —si ya está, no lo duplica— y, si por algún cambio futuro
 * «Inicio» dejara de existir, el botón va primero y no se pierde. Nunca muta la
 * lista que recibe: `getMenuPorRol` la construye de nuevo en cada llamada, pero
 * eso es un detalle suyo del que este código no debe depender.
 */
export function insertarDebajoDeInicio(items: ItemMenu[], extra: ItemMenu): ItemMenu[] {
  if (items.some(i => i.href === extra.href)) return items
  const posInicio = items.findIndex(i => i.href === '/dashboard')
  const corte = posInicio === -1 ? 0 : posInicio + 1
  return [...items.slice(0, corte), extra, ...items.slice(corte)]
}

/**
 * ¿Existe el módulo en este entorno, visto desde el navegador?
 *
 * Es la misma pregunta que `pdmHabilitado()` responde en el servidor, con la
 * misma regla (`entornoPermiteModulo`). `VERCEL_ENV` solo existe en el servidor;
 * `next.config.ts` la copia a `NEXT_PUBLIC_ENTORNO_VERCEL` al compilar para que
 * el layout —que es un componente de cliente— pueda preguntarlo; lo mismo con el
 * interruptor de producción (`PDM_PRODUCCION` → `NEXT_PUBLIC_PDM_PRODUCCION`). Han de
 * escribirse literales, sin desestructurar: solo así Next las sustituye.
 */
export const MARCO_PDM_DISPONIBLE = entornoPermiteModulo(
  process.env.NEXT_PUBLIC_ENTORNO_VERCEL,
  process.env.NODE_ENV,
  process.env.NEXT_PUBLIC_PDM_PRODUCCION,
)

/**
 * ¿Debe el layout del panel pintar el marco del módulo en esta ruta?
 *
 * Exige las dos cosas: que la ruta sea del módulo Y que el entorno lo admita.
 * Con solo la primera, en producción cualquiera que abriera esa dirección vería
 * la cabecera del módulo encima de un 404.
 */
export function usaMarcoPdm(pathname: string | null | undefined): boolean {
  return MARCO_PDM_DISPONIBLE && esRutaPdm(pathname)
}

/**
 * ¿La ruta pertenece al módulo? Decide qué marco pinta el panel: en el módulo
 * no va la barra lateral de contratos, que ahí solo sería ruido.
 *
 * Compara por segmento, no por prefijo suelto: `/dashboard/plan-desarrollo-x`
 * no es del módulo. Ante una ruta ausente o desconocida responde `false`, que es
 * el marco de siempre — el error nunca deja al panel sin su barra.
 */
export function esRutaPdm(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const base = ITEM_PLAN_DESARROLLO.href
  return pathname === base || pathname.startsWith(`${base}/`)
}

// ─── Secciones del módulo ─────────────────────────────────────────────────────

export interface SeccionPdm {
  href: string
  rotulo: string
  /** Solo es la activa en esa ruta exacta (el resumen es la raíz y no puede tragarse a las demás). */
  exacta?: boolean
}

/**
 * Las pestañas del módulo, en el orden en que se leen. Una pestaña solo existe
 * cuando funciona.
 */
const BASE = ITEM_PLAN_DESARROLLO.href
export const HREF_INDICADORES = `${BASE}/indicadores`
export const HREF_REPORTES = `${BASE}/reportes`
export const HREF_EVIDENCIAS = `${BASE}/evidencias`
export const HREF_RESPONSABLES = `${BASE}/responsables`
export const SECCIONES_PDM: SeccionPdm[] = [
  { href: BASE, rotulo: 'Resumen', exacta: true },
  { href: HREF_INDICADORES, rotulo: 'Indicadores' },
  { href: HREF_REPORTES, rotulo: 'Reportes' },
  { href: HREF_EVIDENCIAS, rotulo: 'Evidencias' },
  { href: HREF_RESPONSABLES, rotulo: 'Responsables' },
]

/**
 * Las pestañas que le corresponden a un nivel. Una pestaña a la que no se puede entrar no se pinta:
 *
 *   · «Responsables» (el directorio de personas) y «Reportes» (cómo va cada secretaría en el año):
 *     quienes gestionan y Control Interno. Quien solo responde por indicadores ve el estado de los
 *     suyos en «Indicadores».
 *   · «Evidencias» es para todos: cada quien recorre los archivos que la base le deja ver (un responsable
 *     los suyos, una secretaría los de su dependencia, Control Interno y el administrador todos).
 *   · La primera pestaña es «Resumen» (el tablero del plan) salvo para quien solo responde por indicadores:
 *     para él es «Mi trabajo», la misma ruta con otra pantalla.
 */
export function seccionesPara(nivel: NivelPdm | null | undefined): SeccionPdm[] {
  return SECCIONES_PDM
    .filter(s => {
      if (s.href === HREF_RESPONSABLES || s.href === HREF_REPORTES) return veDirectorio(nivel)
      return true
    })
    // Para quien solo responde por indicadores, la primera pestaña no es el tablero del plan sino «Mi trabajo».
    .map(s => (s.href === BASE && nivel === 'responsable' ? { ...s, rotulo: 'Mi trabajo' } : s))
}

/** ¿Cuál pestaña corresponde a esta ruta? `null` si ninguna (no se marca ninguna). */
export function seccionActiva(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const hallada = SECCIONES_PDM.find(s =>
    s.exacta ? ruta === s.href : ruta === s.href || ruta.startsWith(`${s.href}/`),
  )
  return hallada?.href ?? null
}
