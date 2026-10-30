'use client'

/**
 * Los archivos de la versión que certifica una constancia, en la verificación pública: su tipo, su tamaño y su huella (los nombres no
 * se publican). Con muchos, la lista se compacta (`ListaCompacta`): si no, «Comprobar un archivo», que va debajo, quedaría a metros.
 *
 * Es de cliente solo por eso: la página que la monta es del servidor y no puede pasarle a la lista cómo pintar cada archivo.
 */

import { etiquetaDeTipo, type ArchivoDeConstancia } from '@/lib/pdm/constancia'
import { describirTamano } from '@/lib/pdm/seguimiento-acciones'
import ListaCompacta from '../ListaCompacta'

export default function ArchivosDeConstancia({ archivos }: { archivos: ArchivoDeConstancia[] }) {
  return (
    <ListaCompacta
      // Sin nombre ni identificador públicos: cada archivo se distingue por su lugar en la lista.
      lista={archivos.map((a, orden) => ({ ...a, orden }))}
      clave={a => String(a.orden)}
      className="space-y-2"
      separacion="pt-2"
      tono="publico"
    >
      {a => (
        <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
          <p className="m-0 text-[13px] font-medium text-slate-800">
            {etiquetaDeTipo(a.tipo)} <span className="font-normal text-slate-500">· {describirTamano(a.bytes)}</span>
          </p>
          {a.sha256 ? (
            <>
              <p className="m-0 mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Huella digital (SHA-256)</p>
              <p className="m-0 break-all font-mono text-[11px] leading-snug text-slate-600">{a.sha256}</p>
            </>
          ) : (
            <p className="m-0 mt-1 text-[11px] text-slate-500">Sin huella registrada para este archivo.</p>
          )}
        </li>
      )}
    </ListaCompacta>
  )
}
