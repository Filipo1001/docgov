'use client'

/**
 * DictarActividad — dictado por voz para la descripción de una actividad.
 *
 * Pensado para quien está en campo, con el teléfono en una mano y sin ganas
 * de escribir un párrafo con el pulgar.
 *
 * ── Cómo convive con lo que ya había ─────────────────────────────────────
 *
 * Va justo encima de «Mejorar redacción» y los dos tienen que leerse como
 * una familia, no como dos añadidos sueltos. De ahí que comparta con él la
 * forma —`text-xs`, `px-3 py-1.5`, `rounded-lg`, alineado a la derecha— y no
 * el color: aquel usa el morado de la corrección asistida y este va neutro
 * en reposo y rojo grabando, que es lo que todo el mundo entiende.
 *
 * EL COLOR NEUTRO NO ES ESTÉTICA, ES NECESIDAD. El formulario de actividad
 * nueva vive dentro de un contenedor `bg-blue-50` y el de edición dentro de
 * uno `bg-gray-50`. Un botón azul claro desaparecía sobre el primero. Blanco
 * con borde gris se lee sobre los dos.
 *
 * ── Decisiones de interacción ────────────────────────────────────────────
 *
 *  · UN SOLO BOTÓN que alterna. Dos —iniciar y parar— obligan a pensar cuál
 *    toca ahora.
 *  · «Preparando el micrófono…» antes de «Escuchando». Entre pulsar y que el
 *    navegador entregue el micrófono pasan hasta dos segundos; decir que ya
 *    se escucha hace que la persona hable contra un micrófono cerrado.
 *  · LO PROVISIONAL SE VE, en su propia burbuja. Sin eso se habla contra una
 *    pantalla quieta sin saber si está oyendo.
 *  · En el móvil el botón ocupa el ancho completo y crece a 44 px de alto —el
 *    mínimo táctil—; a partir de `sm` se recoge al tamaño de su hermano.
 */

import { useEffect, useRef, useState } from 'react'
import { hayDictado, iniciarDictado, type MotivoFin } from '@/lib/dictado'
import { limpiarDictado, unirDictado } from '@/lib/dictado-limpieza'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

/**
 * Ni «usuario» ni «silencio» ni «limite» son errores: son cierres normales.
 * Avisar en rojo de que el dictado acabó porque la persona lo detuvo sería
 * ruido; de que se cerró solo, en cambio, hay que avisar — si no, vuelve del
 * bolsillo y no entiende por qué dejó de escuchar.
 */
const MENSAJES: Record<MotivoFin, string | null> = {
  usuario: null,
  silencio: 'Se detuvo: no se escuchó nada durante un rato.',
  limite: 'Se detuvo tras varios minutos. Puedes continuar cuando quieras.',
  'sin-permiso': 'No diste permiso al micrófono. Habilítalo en los ajustes del navegador.',
  'sin-microfono': 'No se encontró micrófono en este dispositivo.',
  'sin-red': 'El dictado necesita conexión a internet.',
  'sin-resultados': 'El micrófono se abrió pero no se transcribió nada. Intenta de nuevo.',
  error: 'El dictado se interrumpió. Intenta de nuevo.',
}

/** Cierres que no son fallo: se informan en gris, no en rojo. */
const CIERRES_NORMALES: MotivoFin[] = ['usuario', 'silencio', 'limite']

export default function DictarActividad({
  texto,
  onTexto,
  disabled = false,
}: {
  /** Texto actual del textarea asociado */
  texto: string
  /** Escribe el texto con lo dictado ya incorporado */
  onTexto: (nuevo: string) => void
  disabled?: boolean
}) {
  const [soportado, setSoportado] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  /** Micrófono realmente abierto, no solo botón pulsado. */
  const [listo, setListo] = useState(false)
  const [provisional, setProvisional] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [normal, setNormal] = useState(false)
  const [traza, setTraza] = useState<string[]>([])
  const [verTraza, setVerTraza] = useState(false)

  const detenerRef = useRef<(() => void) | null>(null)
  // El motor vive fuera de React y sus callbacks se crean una sola vez, así
  // que leerían el `texto` del primer render. Con la referencia siempre
  // escriben sobre lo último que hay en el campo.
  const textoRef = useRef(texto)
  useEffect(() => { textoRef.current = texto }, [texto])

  /**
   * Último tramo provisional aún sin confirmar.
   *
   * En WebKit —todos los navegadores de iOS— los resultados llegan como
   * provisionales y solo se confirman al cerrar la sesión. Si el motor cierra
   * sin confirmar, esto es lo único que queda de lo que la persona dijo.
   */
  const provisionalRef = useRef('')

  /** Vuelca lo provisional pendiente al campo, si queda algo sin confirmar. */
  function volcarProvisional() {
    if (!provisionalRef.current) return
    incorporar(provisionalRef.current)
    provisionalRef.current = ''
    setProvisional('')
  }

  /** Escribe un tramo en el campo, ya limpio y unido a lo que hubiera. */
  function incorporar(trozo: string) {
    const limpio = limpiarDictado(trozo)
    if (!limpio) return
    const nuevo = unirDictado(textoRef.current, limpio)
    textoRef.current = nuevo
    onTexto(nuevo)
  }

  // La detección va en un efecto: en el servidor no existe `window`, y
  // decidirlo durante el render dejaría el botón oculto tras la hidratación.
  useEffect(() => { setSoportado(hayDictado()) }, [])

  // Si el componente se desmonta con el micrófono abierto —el usuario cancela
  // el formulario a media frase—, hay que cerrarlo o el navegador se queda
  // grabando con el indicador encendido.
  useEffect(() => () => { detenerRef.current?.() }, [])

  if (!soportado) return null

  function alternar() {
    if (escuchando) {
      detenerRef.current?.()
      return
    }

    setError(null)
    setNormal(false)
    setProvisional('')
    provisionalRef.current = ''
    setTraza([])
    setVerTraza(false)
    setEscuchando(true)
    setListo(false)

    detenerRef.current = iniciarDictado({
      onTrozo: ({ texto: trozo, definitivo }) => {
        if (!definitivo) {
          provisionalRef.current = trozo
          setProvisional(trozo)
          return
        }
        // Llegó el definitivo: lo provisional ya está representado en él.
        provisionalRef.current = ''
        incorporar(trozo)
        setProvisional('')
      },
      // Cada corte de sesión —la API se cierra sola con cada silencio— vuelca
      // lo provisional. En WebKit es lo único que hay: sin esto, cada
      // reinicio se llevaría por delante la última frase dictada.
      onCorte: volcarProvisional,
      onListo: () => setListo(true),
      onFin: (motivo) => {
        volcarProvisional()
        setEscuchando(false)
        setListo(false)
        setProvisional('')
        detenerRef.current = null
        setError(MENSAJES[motivo])
        setNormal(CIERRES_NORMALES.includes(motivo))
      },
      onEvento: (linea) => {
        const hora = new Date().toLocaleTimeString('es-CO', { hour12: false })
        setTraza(t => [...t.slice(-40), `${hora}  ${linea}`])
      },
    })
  }

  const etiquetaEstado = !escuchando
    ? null
    : listo ? 'Escuchando…' : 'Preparando el micrófono…'

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* Fila de acción. En móvil el estado va arriba y el botón ocupa todo
          el ancho; desde sm comparten línea, con el botón a la derecha para
          alinearse con «Mejorar redacción». */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-1.5 sm:gap-2">
        {etiquetaEstado ? (
          <span
            className={`inline-flex items-center gap-1.5 text-xs sm:mr-auto ${
              listo ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {listo && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${listo ? 'bg-red-500' : 'bg-gray-300'}`} />
            </span>
            {etiquetaEstado}
          </span>
        ) : (
          // La pista solo tiene sentido antes de empezar, y en pantallas
          // estrechas compite con el botón: ahí se calla.
          <span className="hidden sm:inline text-[11px] text-gray-400 sm:mr-auto">
            Puedes decir «punto» o «punto y aparte» para puntuar
          </span>
        )}

        <button
          type="button"
          onClick={alternar}
          disabled={disabled}
          aria-pressed={escuchando}
          title={escuchando ? 'Detener el dictado' : 'Dictar la actividad en voz alta'}
          className={`inline-flex items-center justify-center gap-1.5 text-xs font-medium
                      rounded-lg px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 w-full sm:w-auto shrink-0
                      transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            escuchando
              ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100'
          }`}
        >
          <Icono glifo={escuchando ? Iconos.dominio.dictadoInactivo : Iconos.dominio.dictado} tamano="sm" />
          {escuchando ? 'Detener dictado' : 'Dictar'}
        </button>
      </div>

      {/* Lo provisional, en su propia burbuja: todavía puede cambiar, y
          mezclarlo con el texto confirmado haría parpadear la pantalla. */}
      {escuchando && provisional && (
        <p className="bg-white/70 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 italic leading-snug break-words max-h-24 overflow-y-auto">
          {provisional}
        </p>
      )}

      {error && (
        <p className={`text-[11px] leading-snug ${normal ? 'text-gray-500' : 'text-red-600'}`}>
          {error}
        </p>
      )}

      {/* Diagnóstico: solo si el dictado terminó mal. En uso normal no
          aparece, y cuando algo falla evita tener que pedirle a un
          contratista que abra la consola del navegador. */}
      {error && !normal && traza.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerTraza(v => !v)}
            className="text-[11px] text-gray-400 underline underline-offset-2"
          >
            {verTraza ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}
          </button>
          {verTraza && (
            <pre className="mt-1.5 max-h-40 overflow-auto bg-gray-900 text-gray-100 text-[10px] leading-relaxed rounded-lg p-2.5 whitespace-pre-wrap break-words">
{traza.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
