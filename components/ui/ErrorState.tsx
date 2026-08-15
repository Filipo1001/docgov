'use client'

import Icono from './Icono'
import { Iconos } from '@/lib/iconos'

/**
 * Estado de «no se pudo cargar», con reintento.
 *
 * Existe para cerrar un patrón que se repetía en todo el panel: las pantallas
 * distinguían solo entre «tengo datos» y «no tengo datos», y ante un fallo
 * seguían mostrando el esqueleto. Para quien lo usa, un esqueleto que no
 * termina nunca es indistinguible de un cuelgue: no dice qué pasó y no ofrece
 * salida, así que la única opción era recargar a ciegas.
 *
 * Un fallo de carga es un estado legítimo de la pantalla y merece decirse.
 */
export default function ErrorState({
  mensaje,
  onReintentar,
  reintentando = false,
}: {
  mensaje: string
  onReintentar: () => void
  reintentando?: boolean
}) {
  return (
    <div className="text-center py-16" role="alert">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 mb-4">
        <Icono glifo={Iconos.estado.advertencia} tamano="lg" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No se pudieron cargar los datos</h3>
      <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        disabled={reintentando}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Icono
          glifo={Iconos.accion.recargar}
          tamano="sm"
          className={reintentando ? 'animate-spin' : undefined}
        />
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  )
}
