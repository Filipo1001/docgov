'use client'

/**
 * Lo que implica dejar una obligación en cero, dicho antes de guardar.
 *
 * ── Por qué el tono es el que es ─────────────────────────────────────────
 *
 * El riesgo de este aviso no es que nadie lo lea: es que asuste. Si suena a
 * sanción, quien no ejecutó una obligación pondrá «1» y se inventará una
 * actividad — y el informe quedará peor que si hubiera declarado el cero, con
 * la diferencia de que además nadie se entera. Un contratista que reporta
 * honestamente que algo no se requirió está haciendo lo correcto, y el mensaje
 * tiene que decírselo: «es válido» va antes que «debes justificarlo».
 *
 * Por eso tampoco cita reglamentos ni artículos. Quien llena esto desde el
 * teléfono, un martes, entre dos diligencias, necesita saber tres cosas: qué
 * va a decir el informe, que está permitido, y qué tiene que escribir. Todo lo
 * demás es ruido que se salta.
 *
 * ── Por qué no es un modal ───────────────────────────────────────────────
 *
 * Interrumpir con una ventana obligaría a descartarla para volver a escribir
 * justo donde el aviso pide escribir. Aparece pegado al campo de descripción,
 * que es donde va la respuesta, y se queda a la vista mientras se redacta.
 *
 * ── Por qué no lleva contador de caracteres ──────────────────────────────
 *
 * Lo llevó y se quitó. Un «faltan 12 caracteres» debajo de un aviso que ya
 * pide explicar convierte el recuadro en una lista de reclamos, y el listón de
 * veinte caracteres es tan bajo que cualquier frase de verdad lo pasa sin
 * enterarse: quien escribe un motivo real nunca ve el contador, y el único que
 * lo veía era quien despachaba el campo con «no aplica». Para ese caso ya está
 * el botón, que se enciende solo en cuanto la explicación existe.
 */

import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

// La regla vive en lib/validar-actividad.ts, compartida con las acciones del
// servidor: lo que este aviso cuenta y lo que el servidor exige tienen que ser
// el mismo número, o el contratista ve un botón habilitado que devuelve error.
export { faltanParaMotivo, MOTIVO_MINIMO } from '@/lib/validar-actividad'

export default function AvisoSinAcciones() {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Icono
          glifo={Iconos.estado.advertencia}
          tamano="sm"
          className="mt-0.5 shrink-0 text-amber-600"
        />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-amber-900 leading-snug">
            En el informe dirá que no ejecutaste esta obligación
          </p>
          <p className="text-[13px] text-amber-800 leading-relaxed mt-1">
            Es válido: hay meses en que no se requiere. Solo tienes que explicar
            arriba por qué no fue necesaria, para que la supervisión pueda
            aprobarla.
          </p>
        </div>
      </div>
    </div>
  )
}
