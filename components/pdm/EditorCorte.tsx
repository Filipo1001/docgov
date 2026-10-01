'use client'

/**
 * Crear o editar un corte. Lo mínimo: una fecha y, si se quiere, un nombre (sin nombre se propone
 * «Corte a 31 de octubre de 2026»). «Abrir ahora» deja el corte listo para que empiecen a reportar;
 * solo puede haber uno abierto a la vez, y si ya hay otro, la casilla lo dice y no se puede marcar.
 */

import { useState } from 'react'
import { esFechaValida, sugerirNombreCorte, type Corte } from '@/lib/pdm/seguimiento'
import { MAX_NOMBRE_CORTE, type AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import Dialogo from './Dialogo'

export default function EditorCorte({ corte, otroAbierto, conReportes, acciones, onCerrar, onHecho }: {
  /** Sin él, se crea uno nuevo. */
  corte?: Corte
  /** El nombre del corte abierto, si lo hay y no es éste. */
  otroAbierto: string | null
  /** El corte ya tiene reportes: cambiar su fecha puede cambiar cuál avance se toma como el más reciente. */
  conReportes: boolean
  acciones: AccionesSeguimiento
  onCerrar: () => void
  onHecho: (mensaje: string) => void
}) {
  const [nombre, setNombre] = useState(corte?.nombre ?? '')
  const [fecha, setFecha] = useState(corte?.fecha ?? '')
  const [abrir, setAbrir] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fechaOk = esFechaValida(fecha)
  const sugerido = fechaOk ? sugerirNombreCorte(fecha) : 'Corte a la fecha elegida'
  const puedeAbrir = !corte?.abierto

  async function guardar() {
    if (enviando || !fechaOk) return
    setEnviando(true)
    setError(null)
    const r = await acciones.guardarCorte({ corte: corte?.id, nombre, fecha, abrir: abrir && otroAbierto === null })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    onHecho(corte ? 'Corte actualizado.' : abrir ? 'Corte creado y abierto: ya se puede reportar.' : 'Corte creado.')
  }

  return (
    <Dialogo
      titulo={corte ? 'Editar corte' : 'Nuevo corte'}
      subtitulo={corte ? undefined : 'Un corte es el momento en que se reporta el avance.'}
      onCerrar={onCerrar}
      ancho="sm:max-w-md"
      pie={
        <div className="flex justify-end gap-2">
          <button
            onClick={onCerrar}
            disabled={enviando}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            id="pdm-corte-guardar"
            onClick={guardar}
            disabled={enviando || !fechaOk}
            className="rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      }
    >
      <label className="block">
        <span className="text-xs font-semibold text-gray-600">Fecha del corte</span>
        <input
          id="pdm-corte-fecha"
          type="date"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          disabled={enviando}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-gray-600">Nombre <span className="font-normal text-gray-500">(opcional)</span></span>
        <input
          id="pdm-corte-nombre"
          type="text"
          value={nombre}
          maxLength={MAX_NOMBRE_CORTE}
          placeholder={sugerido}
          onChange={e => setNombre(e.target.value)}
          disabled={enviando}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />
      </label>

      {puedeAbrir && (
        <label className={`flex items-start gap-2.5 text-sm ${otroAbierto ? 'text-gray-400' : 'text-gray-700'}`}>
          <input
            id="pdm-corte-abrir"
            type="checkbox"
            checked={abrir && otroAbierto === null}
            disabled={enviando || otroAbierto !== null}
            onChange={e => setAbrir(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-700 focus:ring-teal-600"
          />
          <span>
            Abrir ahora para que empiecen a reportar
            {otroAbierto && <span className="mt-0.5 block text-xs text-gray-500">Ya hay un corte abierto («{otroAbierto}»). Ciérralo para abrir éste.</span>}
          </span>
        </label>
      )}

      {corte && conReportes && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          Este corte ya tiene reportes. Cambiar su fecha puede cambiar cuál avance se toma como el más reciente.
        </p>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p>}
    </Dialogo>
  )
}
