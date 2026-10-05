/**
 * El mapa del plan: secretarías en las filas, líneas estratégicas en las columnas. En cada cruce, cuántos indicadores
 * con meta tiene el año y cuánto llevan de avance (ver `lib/pdm/graficos.ts`).
 *
 * Responde dos preguntas que los paneles por secretaría y por línea no pueden responder juntos: dónde se concentra el
 * plan (el sombreado sigue a la cantidad de indicadores) y qué cruces están vacíos (un guion, sin relleno). El sombreado
 * es de la tinta y apenas se nota a propósito: dice «aquí hay más», no «aquí va mejor o peor»; el color queda para los
 * estados, y esto no es un estado.
 *
 * Es de presentación pura, y una tabla de verdad (con encabezados de fila y de columna) para que el lector de pantalla
 * la recorra celda por celda. Las celdas no llevan a ningún sitio: no hay una lista que filtre por cruce.
 */

import { pctLegible, type CuentaDeAnio, type MapaDeGrupos } from '@/lib/pdm/graficos'
import { Panel } from './ui'
import { T } from './tema'

/** «Línea 3 - Hábitat Sostenible» → { corto: «Línea 3», nombre: «Hábitat Sostenible» }; un nombre que no sigue esa forma, entero. */
function partirLinea(nombre: string): { corto: string; nombre: string } {
  const m = /^(Línea\s+\d+)\s*[-–]\s*(.+)$/.exec(nombre)
  return m ? { corto: m[1], nombre: m[2] } : { corto: nombre, nombre: '' }
}

/** El sombreado: de casi nada a un gris azulado suave. Con más, el texto de apoyo (#556072) bajaría de 4,5:1. */
const sombra = (n: number, maximo: number) => `rgba(25, 32, 49, ${(0.04 + 0.1 * (maximo > 0 ? n / maximo : 0)).toFixed(3)})`

function Celda({ c, maximo }: { c: CuentaDeAnio; maximo: number }) {
  if (c.conMeta === 0) {
    return (
      <div className="flex min-h-14 items-center justify-center rounded-md border border-dashed border-[#DCE0E8] text-sm text-[#667085]">
        <span aria-hidden>—</span>
        <span className="sr-only">Sin indicadores con meta</span>
      </div>
    )
  }
  return (
    <div className="flex min-h-14 flex-col items-center justify-center rounded-md px-1 py-1.5 text-center" style={{ backgroundColor: sombra(c.conMeta, maximo) }}>
      <span className="text-sm font-semibold leading-5 tabular-nums text-[#192031]">
        {c.conMeta}
        <span className="sr-only"> indicadores con meta</span>
      </span>
      <span className="text-[11px] leading-4 tabular-nums text-[#556072]">
        {pctLegible(c.avancePromedio)}
        <span className="sr-only"> de avance promedio</span>
      </span>
    </div>
  )
}

export default function MapaDeGrupos({ mapa, anio, titulo, rotuloFilas }: {
  mapa: MapaDeGrupos
  anio: number
  titulo: string
  /** Qué hay en las filas, para el resumen del lector de pantalla. */
  rotuloFilas: string
}) {
  if (mapa.filas.length === 0 || mapa.columnas.length === 0) return null
  const lineas = mapa.columnas.map(partirLinea)
  const conNombres = lineas.some(l => l.nombre !== '')

  return (
    <Panel titulo={titulo} nota={anio}>
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">
          Indicadores con meta en {anio} y su avance promedio, por {rotuloFilas} y línea estratégica
        </caption>
        <colgroup>
          <col className="w-[5.75rem] sm:w-[26%]" />
        </colgroup>
        <thead>
          <tr>
            <td />
            {lineas.map((l, k) => (
              <th key={mapa.columnas[k]} scope="col" className="px-1 pb-1 text-left align-top font-normal" title={mapa.columnas[k]}>
                <span className={`${T.rotulo} block text-center sm:text-left`}>
                  {/* En el teléfono no cabe «Línea 3»: va «L3», y los nombres completos, en la leyenda de abajo. */}
                  <span className="sm:hidden">{l.corto.replace('Línea ', 'L')}</span>
                  <span className="hidden sm:inline">{l.corto}</span>
                </span>
                {l.nombre && <span className="mt-0.5 hidden text-xs font-medium leading-4 text-[#556072] sm:block">{l.nombre}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mapa.filas.map((fila, f) => (
            <tr key={fila}>
              <th scope="row" className="pr-2 text-left align-middle text-xs font-semibold leading-snug text-[#192031] [overflow-wrap:anywhere]">
                {fila}
              </th>
              {mapa.celdas[f].map((c, k) => (
                <td key={mapa.columnas[k]} className="p-0 align-middle"><Celda c={c} maximo={mapa.maximo} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {conNombres && (
        <ul className="mt-3 space-y-0.5 text-xs leading-4 text-[#556072] sm:hidden">
          {lineas.map((l, k) => <li key={mapa.columnas[k]}><b className="font-semibold text-[#192031]">{l.corto.replace('Línea ', 'L')}</b> · {l.nombre || mapa.columnas[k]}</li>)}
        </ul>
      )}
      <p className={`mt-3 text-xs leading-relaxed ${T.suave}`}>
        En cada cruce: indicadores con meta en {anio} y, debajo, su avance promedio. Más sombreado, más indicadores.
      </p>
    </Panel>
  )
}
