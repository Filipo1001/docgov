'use client'

/**
 * DictarActividad — dictado por voz para la descripción de una actividad.
 *
 * Pensado para quien está en campo, con el teléfono en una mano y sin ganas
 * de escribir un párrafo con el pulgar. De ahí las decisiones de la interfaz:
 *
 *  · UN SOLO BOTÓN grande que alterna entre dictar y detener. Dos botones
 *    —uno de iniciar y otro de parar— obligan a pensar cuál toca ahora.
 *  · LO QUE AÚN NO ESTÁ CONFIRMADO SE VE, en gris y aparte del texto real.
 *    Sin eso, la persona habla contra una pantalla quieta y no sabe si la
 *    está oyendo; es lo que hace que un dictado se sienta roto aunque
 *    funcione.
 *  · EL TEXTO SE VA GUARDANDO EN EL CAMPO a medida que se confirma, no al
 *    final. Si el navegador corta la sesión —pasa—, lo dicho hasta ahí ya
 *    está escrito.
 *  · ERRORES EN CASTELLANO LLANO. «No diste permiso al micrófono» dice qué
 *    hacer; «not-allowed» no.
 *
 * El texto se limpia mientras se dicta (`lib/dictado-limpieza.ts`): eso es
 * tipográfico y no toca el significado, así que se aplica solo. La corrección
 * gramatical sigue siendo el botón «Mejorar redacción» de al lado, que
 * propone y deja decidir — la regla de la casa para un documento que se firma.
 */

import { useEffect, useRef, useState } from 'react'
import { hayDictado, iniciarDictado, type MotivoFin } from '@/lib/dictado'
import { limpiarDictado, unirDictado } from '@/lib/dictado-limpieza'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

/**
 * Ni «usuario» ni «silencio» ni «limite» son errores: son cierres normales.
 * Avisar en rojo de que el dictado terminó porque la persona lo detuvo sería
 * ruido; de que se cerró solo, en cambio, hay que avisar — si no, vuelve del
 * bolsillo y no entiende por qué dejó de escuchar.
 */
const MENSAJES: Record<MotivoFin, string | null> = {
  usuario: null,
  silencio: 'Se detuvo el dictado: no se escuchó nada durante un rato.',
  limite: 'Se detuvo el dictado tras varios minutos. Puedes continuar cuando quieras.',
  'sin-permiso': 'No diste permiso al micrófono. Habilítalo en los ajustes del navegador.',
  'sin-microfono': 'No se encontró micrófono en este dispositivo.',
  'sin-red': 'El dictado necesita conexión a internet.',
  'sin-resultados': 'El micrófono se abrió pero no se transcribió nada. Prueba de nuevo.',
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
  const [provisional, setProvisional] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [normal, setNormal] = useState(false)
  // Diagnóstico temporal: esta API se comporta distinto en cada navegador y
  // sin ver los eventos crudos cualquier arreglo sería adivinanza. Se quita
  // cuando el dictado esté validado en los dispositivos reales.
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
   * sin confirmar, esto es lo único que queda de lo que la persona dijo, y
   * perderlo es perder el dictado entero. Se vacía en cuanto llega el
   * definitivo correspondiente, para no escribir lo mismo dos veces.
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
    setEscuchando(true)

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
      onFin: (motivo) => {
        volcarProvisional()
        setEscuchando(false)
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

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {escuchando ? (
          <span className="inline-flex items-center gap-2 text-xs text-red-600">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            Escuchando… habla con normalidad
          </span>
        ) : (
          <span className="text-[11px] text-gray-400">
            Di «punto» o «punto y aparte» para puntuar
          </span>
        )}

        <button
          type="button"
          onClick={alternar}
          disabled={disabled}
          // 44 px de alto: el mínimo táctil que ya usa el resto del formulario.
          className={`inline-flex items-center gap-2 text-sm font-medium min-h-[44px] px-4 rounded-xl
                      transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            escuchando
              ? 'text-white bg-red-600 hover:bg-red-700 active:bg-red-800'
              : 'text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100'
          }`}
        >
          <Icono glifo={escuchando ? Iconos.dominio.dictadoInactivo : Iconos.dominio.dictado} tamano="sm" />
          {escuchando ? 'Detener' : 'Dictar'}
        </button>
      </div>

      {/* Lo provisional se muestra aparte y en gris: todavía puede cambiar, y
          mezclarlo con el texto confirmado haría que la pantalla parpadeara. */}
      {escuchando && provisional && (
        <p className="mt-2 text-sm text-gray-400 italic leading-snug break-words">{provisional}</p>
      )}

      {error && (
        <p className={`mt-2 text-[11px] ${normal ? 'text-gray-500' : 'text-red-600'}`}>{error}</p>
      )}

      {/* Diagnóstico temporal */}
      {traza.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setVerTraza(v => !v)}
            className="text-[11px] text-gray-400 underline underline-offset-2"
          >
            {verTraza ? 'Ocultar diagnóstico' : `Ver diagnóstico (${traza.length})`}
          </button>
          {verTraza && (
            <pre className="mt-1.5 max-h-48 overflow-auto bg-gray-900 text-gray-100 text-[10px] leading-relaxed rounded-lg p-2.5 whitespace-pre-wrap break-words">
{traza.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
