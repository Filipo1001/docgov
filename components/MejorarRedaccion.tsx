'use client'

/**
 * MejorarRedaccion — asistente de redacción discreto para textareas.
 *
 * Flujo: el usuario escribe normal → pulsa "Mejorar redacción" → ve la
 * versión sugerida con los cambios resaltados → decide "Usar esta versión"
 * o "Mantener la mía". NUNCA reemplaza el texto automáticamente.
 *
 * Motor: LanguageTool API pública (lib/redaccion.ts) — corrige ortografía,
 * tildes, mayúsculas, puntuación y concordancia. No inventa contenido.
 */

import { useEffect, useRef, useState } from 'react'
import { corregirRedaccion, type ResultadoCorreccion } from '@/lib/redaccion'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

const MIN_CARACTERES = 15

type Estado =
  | { fase: 'idle' }
  | { fase: 'cargando' }
  | { fase: 'sugerencia'; resultado: ResultadoCorreccion; original: string }
  | { fase: 'sin_cambios' }
  | { fase: 'error'; mensaje: string }

export default function MejorarRedaccion({
  texto,
  onAceptar,
  disabled = false,
}: {
  /** Texto actual del textarea asociado */
  texto: string
  /** Aplica la versión corregida al textarea del padre */
  onAceptar: (textoCorregido: string) => void
  disabled?: boolean
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' })
  // Si el usuario sigue editando, la sugerencia previa queda obsoleta
  const textoRef = useRef(texto)
  useEffect(() => {
    if (texto !== textoRef.current) {
      textoRef.current = texto
      setEstado(prev => (prev.fase === 'sugerencia' || prev.fase === 'sin_cambios' ? { fase: 'idle' } : prev))
    }
  }, [texto])

  const habilitado = !disabled && texto.trim().length >= MIN_CARACTERES

  async function corregir() {
    setEstado({ fase: 'cargando' })
    try {
      const resultado = await corregirRedaccion(texto)
      if (resultado.cambios === 0) {
        setEstado({ fase: 'sin_cambios' })
      } else {
        setEstado({ fase: 'sugerencia', resultado, original: texto })
      }
    } catch (e) {
      setEstado({ fase: 'error', mensaje: e instanceof Error ? e.message : 'Error al corregir' })
    }
  }

  return (
    <div className="mt-1.5">
      {/* Botón discreto */}
      {(estado.fase === 'idle' || estado.fase === 'error' || estado.fase === 'cargando') && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {estado.fase === 'error' && (
            <span className="text-[11px] text-red-500">{estado.mensaje}</span>
          )}
          <button
            type="button"
            onClick={corregir}
            disabled={!habilitado || estado.fase === 'cargando'}
            title={habilitado ? 'Revisa ortografía, tildes y puntuación' : `Escribe al menos ${MIN_CARACTERES} caracteres`}
            className="inline-flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {estado.fase === 'cargando' ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Revisando…
              </>
            ) : (
              <><Icono glifo={Iconos.dominio.ia} tamano="sm" /> Mejorar redacción</>
            )}
          </button>
        </div>
      )}

      {/* Texto ya correcto */}
      {estado.fase === 'sin_cambios' && (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <Icono glifo={Iconos.estado.ok} tamano="sm" className="inline-block align-[-2px] mr-1" />
            Tu redacción está bien — sin correcciones
          </span>
        </div>
      )}

      {/* Panel de sugerencia */}
      {estado.fase === 'sugerencia' && (
        <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-3 space-y-2.5">
          <p className="text-[11px] font-semibold text-purple-700">
            Versión sugerida · {estado.resultado.cambios} corrección{estado.resultado.cambios === 1 ? '' : 'es'}
          </p>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {estado.resultado.segmentos.map((s, i) =>
              s.cambiado ? (
                <mark key={i} className="bg-purple-200/70 text-purple-900 rounded px-0.5">
                  {s.texto}
                </mark>
              ) : (
                <span key={i}>{s.texto}</span>
              ),
            )}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                onAceptar(estado.resultado.textoCorregido)
                setEstado({ fase: 'idle' })
              }}
              className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Usar esta versión
            </button>
            <button
              type="button"
              onClick={() => setEstado({ fase: 'idle' })}
              className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-white transition-colors"
            >
              Mantener la mía
            </button>
            <span className="text-[10px] text-gray-400 ml-auto">Corrección: LanguageTool</span>
          </div>
        </div>
      )}
    </div>
  )
}
