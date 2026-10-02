import type { ReactNode } from 'react'
import { FichaDatos } from './ui'
import { T } from './tema'

/**
 * El encabezado de cada sección: el título a la izquierda y, a la derecha, un cuadro con los datos
 * de referencia (de qué año y de qué alcance se habla), al estilo del cuadro de código, versión y
 * fecha de un formato oficial. Una sola forma, para que todas las secciones se lean como hermanas.
 *
 * `detalle` es una línea de apoyo bajo el título; `datos` son las celdas del cuadro.
 */
export default function EncabezadoSeccion({ titulo, detalle, datos }: {
  titulo: string
  detalle?: string
  datos?: { rotulo: string; valor: ReactNode }[]
}) {
  return (
    <header className={`flex flex-col gap-4 border-b ${T.reglaFuerte} pb-5 lg:flex-row lg:items-end lg:justify-between`}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#192031]">{titulo}</h1>
        {detalle && <p className={`mt-1 text-sm ${T.suave}`}>{detalle}</p>}
      </div>
      {datos && datos.length > 0 && <FichaDatos datos={datos} className="lg:shrink-0" />}
    </header>
  )
}
