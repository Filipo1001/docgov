import { T } from './tema'

/**
 * Los esqueletos del módulo: lo que se ve mientras llega una pantalla.
 *
 * ── Dos reglas ───────────────────────────────────────────────────────────
 *
 *   1. TIENEN LA FORMA DE LA PANTALLA. Mismo ancho, mismo encabezado, mismas franjas con la altura que
 *      tendrán. Cuando llega el contenido no hay nada que se corra: lo que era una caja gris pasa a ser lo que
 *      va en ella. (Antes, mientras cargaba cualquier pantalla del módulo se veía el esqueleto genérico del
 *      panel de contratos —cuatro cajas y un bloque grande, con otra tipografía y otras esquinas— y al llegar
 *      el contenido todo saltaba.)
 *   2. ESTÁN QUIETOS SI SE PIDE. Con «reducir movimiento» la luz que pasa se apaga y queda el gris.
 *
 * De presentación pura, sin estado: se usan desde `loading.tsx` (servidor).
 */

export function Bloque({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`pdm-esq rounded-md ${className}`} />
}

/**
 * Un texto invisible que fija la altura (y casi el ancho) de lo que irá, con la luz del esqueleto encima. Así el
 * esqueleto mide EXACTAMENTE lo que la pantalla real, sin estimar píxeles: la misma tipografía, el mismo
 * interlineado y por tanto la misma altura de caja.
 */
function Texto({ children, className = '' }: { children: string; className?: string }) {
  return (
    <span className={`relative inline-block align-top ${className}`}>
      <span aria-hidden className="invisible">{children}</span>
      <Bloque className="absolute inset-x-0 inset-y-[0.14em]" />
    </span>
  )
}

function Encabezado({ detalle = true, celdas = 2 }: { detalle?: boolean; celdas?: number }) {
  // La misma estructura y las mismas clases que `EncabezadoSeccion` y `FichaDatos`: el título, su línea de apoyo y el cuadro de datos.
  return (
    <div className={`flex flex-col gap-4 border-b ${T.reglaFuerte} pb-5 lg:flex-row lg:items-end lg:justify-between`}>
      <div className="min-w-0">
        <div className="text-[26px] font-semibold leading-tight tracking-tight"><Texto>Responsables</Texto></div>
        {detalle && <div className="mt-1 text-sm"><Texto>Detalle de la sección en una línea</Texto></div>}
      </div>
      <div className={`flex flex-wrap gap-px overflow-hidden rounded-lg border ${T.reglaFuerte} bg-[#DCE0E8] lg:shrink-0`}>
        {Array.from({ length: celdas }, (_, i) => (
          <div key={i} className="min-w-[6.5rem] flex-auto bg-white px-3.5 py-2">
            <div className={T.rotulo}><Texto>Rótulo</Texto></div>
            <div className="mt-0.5 whitespace-nowrap text-sm font-semibold"><Texto>0000</Texto></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Fila({ ancho = 'w-2/3' }: { ancho?: string }) {
  // La misma anatomía que las filas de verdad: el medio (36 px) arriba, mide lo que miden las dos líneas (20 + 16 px), y lo
  // que va a la derecha parte de la línea del título.
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <Bloque className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center"><Bloque className={`h-3.5 ${ancho} max-w-full`} /></div>
        <div className="flex h-4 items-center"><Bloque className="h-3 w-1/3" /></div>
      </div>
      <div className="hidden h-5 items-center sm:flex"><Bloque className="h-3.5 w-24" /></div>
    </div>
  )
}

function Lista({ filas = 7 }: { filas?: number }) {
  const anchos = ['w-2/3', 'w-3/5', 'w-3/4', 'w-1/2', 'w-2/3', 'w-4/5', 'w-3/5']
  return (
    <div className={`overflow-hidden ${T.panel} divide-y ${T.divide}`}>
      {Array.from({ length: filas }, (_, i) => <Fila key={i} ancho={anchos[i % anchos.length]} />)}
    </div>
  )
}

function Cifras() {
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border ${T.reglaFuerte} bg-[#DCE0E8] lg:grid-cols-4`}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="space-y-3 bg-white px-4 py-4 sm:px-5">
          <Bloque className="h-3 w-20" />
          <Bloque className="h-7 w-16" />
          <Bloque className="h-3 w-28 max-w-full" />
        </div>
      ))}
    </div>
  )
}

export type VarianteEsqueleto = 'tablero' | 'lista' | 'evidencias' | 'generica'

export default function EsqueletoPagina({ variante = 'generica' }: { variante?: VarianteEsqueleto }) {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-7xl space-y-5">
      <span className="sr-only">Cargando…</span>
      <Encabezado detalle={variante !== 'lista'} />

      {variante === 'tablero' && (
        <>
          <Cifras />
          <div className={`${T.panel} space-y-4 px-4 py-4 sm:px-5`}>
            <Bloque className="h-3 w-40" />
            <Bloque className="h-2 w-full" />
            <Bloque className="h-3 w-2/3" />
          </div>
          <Lista filas={5} />
        </>
      )}

      {variante === 'lista' && (
        <>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map(i => <Bloque key={i} className="h-[50px] w-[5.25rem]" />)}
          </div>
          <Bloque className="h-[42px] w-full" />
          <Lista filas={8} />
        </>
      )}

      {variante === 'evidencias' && (
        <>
          <Bloque className="h-[42px] w-full" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <Bloque key={i} className="h-[62px]" />)}
          </div>
          <Lista filas={6} />
        </>
      )}

      {variante === 'generica' && (
        <>
          <Cifras />
          <Lista filas={6} />
        </>
      )}
    </div>
  )
}
