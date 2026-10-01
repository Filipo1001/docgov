'use client'

/**
 * Los comentarios de un indicador. Los escribe cualquiera con acceso al módulo y se ven por
 * todos los que ven el indicador; es donde Control Interno deja sus observaciones sin cambiar nada.
 * Un comentario no se edita ni se borra: lo escrito queda con su autor y su fecha.
 */

import { useState } from 'react'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import { ETIQUETA_NIVEL } from '@/lib/pdm/niveles'
import { MAX_COMENTARIO, errorEnComentario, type AccionesSeguimiento, type ComentarioVista } from '@/lib/pdm/seguimiento-acciones'

export default function ComentariosIndicador({ indicadorUuid, comentarios, acciones, onHecho }: {
  indicadorUuid: string
  comentarios: ComentarioVista[]
  acciones: AccionesSeguimiento
  onHecho: () => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (enviando) return
    const mal = errorEnComentario(texto)
    if (mal) { setError(mal); return }
    setEnviando(true)
    setError(null)
    const r = await acciones.comentar({ indicador: indicadorUuid, texto })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    setTexto('')
    onHecho()
  }

  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900">Comentarios</h3>
      {comentarios.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500">Nadie ha comentado este indicador.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comentarios.map(c => (
            <li key={c.id} className="rounded-xl bg-gray-50 px-3.5 py-2.5">
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{c.autorNombre}</span> · {ETIQUETA_NIVEL[c.autorNivel]} · {fechaHoraBogota(c.creado)}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-snug text-gray-800">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="sr-only">Escribir un comentario</span>
          <textarea
            id="pdm-comentario"
            value={texto}
            disabled={enviando}
            onChange={e => setTexto(e.target.value)}
            rows={2}
            maxLength={MAX_COMENTARIO}
            placeholder="Escribe un comentario"
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
          />
        </label>
        {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
        <div className="flex justify-end">
          <button
            id="pdm-comentar"
            onClick={enviar}
            disabled={enviando || texto.trim() === ''}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? 'Comentando…' : 'Comentar'}
          </button>
        </div>
      </div>
    </section>
  )
}
