'use client'

/**
 * El interruptor de tema: tres opciones (claro, oscuro, automático) en una fila. Va en la barra lateral, a la vista, porque es
 * algo que se cambia de un vistazo y no merece un menú.
 *
 * Guarda en este dispositivo y aplica al instante. Mientras no se haya leído lo guardado (el primer pintado) no marca ninguna: así
 * no destella una opción equivocada.
 */

import { useEffect, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { PREFERENCIAS_TEMA, ROTULO_TEMA, type PreferenciaTema } from '@/lib/tema'
import { aplicarTema, guardarPreferencia, preferenciaGuardada } from '@/lib/tema-cliente'

export default function SelectorTema() {
  const [pref, setPref] = useState<PreferenciaTema | null>(null)

  useEffect(() => {
    // Se lee lo guardado después del primer pintado (el servidor no lo sabe): hasta entonces, ninguna opción marcada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(preferenciaGuardada())
  }, [])

  function elegir(p: PreferenciaTema) {
    guardarPreferencia(p)
    setPref(p)
    aplicarTema(p)
  }

  return (
    <div className="mb-3">
      <p id="cd-tema-rotulo" className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Apariencia</p>
      <div role="radiogroup" aria-labelledby="cd-tema-rotulo" className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
        {PREFERENCIAS_TEMA.map(p => {
          const activa = pref === p
          return (
            <button
              key={p}
              id={`cd-tema-${p}`}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => elegir(p)}
              title={p === 'sistema' ? 'Sigue al sistema: oscuro o claro según tu dispositivo' : ROTULO_TEMA[p]}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 ${
                activa ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icono glifo={Iconos.tema[p]} tamano="sm" />
              <span className="sr-only sm:not-sr-only">{ROTULO_TEMA[p]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
