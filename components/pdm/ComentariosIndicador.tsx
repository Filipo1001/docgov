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
import { Seccion } from './ui'
import BotonAccion, { Despliegue, useConfirmar, useNuevos } from './Movimiento'
import { T } from './tema'
import { nombrePropio } from '@/lib/pdm/personas'

export default function ComentariosIndicador({ indicadorUuid, comentarios, acciones, onHecho }: {
  indicadorUuid: string
  comentarios: ComentarioVista[]
  acciones: AccionesSeguimiento
  onHecho: () => void
}) {
  const [texto, setTexto] = useState('')
  const { fase, correr, ocupado: enviando } = useConfirmar()
  const [error, setError] = useState<string | null>(null)
  // El comentario recién escrito se ilumina un momento al llegar a la lista: se ve dónde quedó.
  const nuevos = useNuevos(comentarios.map(c => c.id))

  async function enviar() {
    if (enviando) return
    const mal = errorEnComentario(texto)
    if (mal) { setError(mal); return }
    setError(null)
    await correr(
      () => acciones.comentar({ indicador: indicadorUuid, texto }),
      { alTerminar: () => { setTexto(''); onHecho() }, alFallar: setError },
    )
  }

  return (
    <Seccion rotulo="Comentarios">
      {comentarios.length === 0 ? (
        <p className="text-xs text-[#667085]">Nadie ha comentado este indicador.</p>
      ) : (
        <ul className="space-y-2.5">
          {comentarios.map(c => (
            <li key={c.id} className={`rounded-lg border border-[#E6E9EF] bg-[#F7F8FA] px-3.5 py-2.5 ${nuevos.has(c.id) ? 'pdm-nuevo' : ''}`}>
              <p className="text-xs text-[#667085]">
                <span className="font-semibold text-[#192031]">{nombrePropio(c.autorNombre)}</span> · {ETIQUETA_NIVEL[c.autorNivel]} · {fechaHoraBogota(c.creado)}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm leading-snug text-[#2D3648]">{c.texto}</p>
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
            className={`${T.campo} resize-none`}
          />
        </label>
        <Despliegue abierto={!!error} separacion="">
          {error ? <p role="alert" className="text-xs font-medium text-[#B42318]">{error}</p> : null}
        </Despliegue>
        <div className="flex justify-end">
          <BotonAccion
            id="pdm-comentar"
            chico
            variante="secundaria"
            fase={fase}
            inhabilitado={texto.trim() === ''}
            onClick={enviar}
            etiquetas={{ reposo: 'Comentar', trabajando: 'Comentando', hecho: 'Comentado' }}
          />
        </div>
      </div>
    </Seccion>
  )
}
