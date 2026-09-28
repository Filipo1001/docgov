'use client'

/**
 * Cuántas veces se hizo la actividad.
 *
 * ── El fallo que lo origina ──────────────────────────────────────────────
 *
 * El campo era un `<input type="number">` cuyo onChange hacía
 * `Math.max(1, parseInt(e.target.value) || 1)`. Al borrar el contenido, el
 * valor es '' → parseInt da NaN → `|| 1` lo devuelve a 1 en la misma
 * pulsación. En un computador no se nota: seleccionas el «1» y escribes
 * encima, o usas las flechas del control. En un teléfono no hay flechas y el
 * único camino es borrar, que era justo lo bloqueado — quien quería poner 6
 * terminaba con «16» o «61».
 *
 * La lección es que un campo numérico necesita un estado intermedio vacío.
 * Mientras alguien escribe, «» es legal; solo al salir hay que normalizar.
 *
 * ── Por qué este control y no otro ───────────────────────────────────────
 *
 * Medido sobre las 4.600 actividades que hay en producción:
 *
 *   · 93,1 % valen 1 — el valor por defecto, que nadie toca.
 *   ·  4,7 % están entre 2 y 10.
 *   ·  2,2 % pasan de 10, y llegan hasta 287. Son reales: hay actividades que
 *     dicen «se registran 32 contratos» o «realicé 30 intervenciones».
 *
 * Eso descarta los dos extremos. Un selector de fichas (1·2·3·4·5) dejaría
 * fuera a quien tiene que reportar 287. Un campo de texto pelado castiga al
 * 93 % que solo necesita el valor que ya está puesto.
 *
 * La respuesta es un contador: los botones resuelven el tramo corto de un
 * toque —y devuelven al teléfono lo que el computador siempre tuvo—, y la
 * cifra del medio se escribe a mano para la cola larga.
 *
 * ── Detalles que no son adorno ───────────────────────────────────────────
 *
 *   · `type="text"` con `inputMode="numeric"`, no `type="number"`. Saca el
 *     teclado numérico en el teléfono, y de paso quita dos molestias del
 *     control nativo en escritorio: que la rueda del ratón cambie la cifra sin
 *     querer al desplazar la página, y que acepte «e», «+» y «−».
 *   · Al enfocar se selecciona todo, así que tocar y teclear reemplaza en un
 *     gesto en vez de dos.
 *   · El sustantivo se pluraliza al lado de la cifra. Era una etiqueta que
 *     decía «Cantidad:» sin decir de qué; ahora el propio control se lee como
 *     lo que va a salir impreso en el informe.
 */

import { useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

const MINIMO = 1
/** El máximo real en producción es 287; 999 ataja un dedazo sin estorbar. */
const MAXIMO = 999

export default function ContadorAcciones({
  valor,
  onCambio,
  autoFocus,
}: {
  valor: number
  onCambio: (n: number) => void
  autoFocus?: boolean
}) {
  // El texto es lo que se ve mientras se escribe; `valor` es lo que vale.
  // Se separan justamente para que «» pueda existir un momento.
  const [texto, setTexto] = useState(String(valor))
  const campo = useRef<HTMLInputElement>(null)

  // `texto` se siembra al montar y desde ahí manda el control, sin sincronizarse
  // con la prop. No es un descuido: los dos formularios que lo usan se
  // desmontan al guardar y al cancelar —`setFormActivo(null)` en el de alta, el
  // cambio de `editandoId` en el de edición—, así que cada apertura trae un
  // contador nuevo con el valor correcto. Sincronizarlo exigía un efecto o leer
  // el foco en render, y ambos son peores que el problema que resuelven.
  //
  // Si algún día hace falta reutilizarlo sin desmontarlo, la salida no es
  // añadir aquí un efecto: es pasarle `key={algoQueCambie}` desde arriba.

  function escribir(entrada: string) {
    const limpio = entrada.replace(/\D/g, '').slice(0, 3)
    setTexto(limpio)
    if (limpio === '') return            // estado intermedio: aún no se decide
    onCambio(Math.min(MAXIMO, Math.max(MINIMO, Number(limpio))))
  }

  // Al salir se normaliza: vacío o cero vuelven al mínimo.
  function alSalir() {
    const n = Number(texto)
    const final = !texto || !Number.isFinite(n) || n < MINIMO ? MINIMO : Math.min(MAXIMO, n)
    setTexto(String(final))
    onCambio(final)
  }

  function mover(paso: number) {
    const base = Number(texto) || valor || MINIMO
    const final = Math.min(MAXIMO, Math.max(MINIMO, base + paso))
    setTexto(String(final))
    onCambio(final)
  }

  const actual = Number(texto) || valor
  const enMinimo = actual <= MINIMO
  const enMaximo = actual >= MAXIMO

  // 44 px en el teléfono —el mínimo táctil recomendado— y 36 en escritorio,
  // donde el puntero apunta fino y un botón grande solo ocupa sitio.
  const boton =
    'w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-gray-600 ' +
    'hover:bg-white hover:text-gray-900 active:bg-gray-100 disabled:opacity-30 ' +
    'disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors ' +
    'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none'

  return (
    <div className="flex items-center gap-2.5">
      <div className="inline-flex items-center gap-0.5 rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => mover(-1)}
          disabled={enMinimo}
          aria-label="Una acción menos"
          className={boton}
        >
          <Icono glifo={Iconos.accion.quitar} tamano="sm" />
        </button>

        <input
          ref={campo}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus={autoFocus}
          value={texto}
          onChange={e => escribir(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          onBlur={alSalir}
          aria-label="Número de acciones"
          className="w-12 bg-transparent text-center text-sm font-semibold text-gray-900 tabular-nums outline-none"
        />

        <button
          type="button"
          onClick={() => mover(1)}
          disabled={enMaximo}
          aria-label="Una acción más"
          className={boton}
        >
          <Icono glifo={Iconos.accion.agregar} tamano="sm" />
        </button>
      </div>

      {/* La palabra del informe, no una etiqueta que haya que interpretar. La
          columna del PDF se titula «NÚMERO DE ACCIONES» y la tarjeta ya guardada
          dice «N acciones»: el formulario tenía que hablar el mismo idioma. */}
      <span className="text-xs text-gray-500">
        {actual === 1 ? 'acción' : 'acciones'}
      </span>
    </div>
  )
}
