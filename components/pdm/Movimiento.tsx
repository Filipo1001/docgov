'use client'

/**
 * Los gestos del módulo: el anillo de espera, el visto que se dibuja y el botón que cuenta lo que pasa.
 *
 * ── Qué reemplaza ────────────────────────────────────────────────────────
 *
 * El botón que decía «Enviar», luego «Enviando…» y volvía a «Enviar». Eran tres textos de anchos distintos
 * que se cambiaban de golpe: el botón se encogía y se estiraba, y al terminar no decía nada: volvía a ser el
 * de antes, como si no hubiera pasado nada.
 *
 * Ahora el botón tiene tres caras que SE CRUZAN en el mismo sitio (una encima de otra, en una celda de
 * rejilla), así que su tamaño es el de la más ancha y nunca cambia:
 *
 *   reposo      → la acción («Enviar reporte»)
 *   trabajando  → el anillo de las subidas y qué se está haciendo («Subiendo 2 de 3»)
 *   hecho       → el visto que se dibuja y lo que pasó («Enviado»)
 *
 * Quien lo usa solo dice en qué fase está; los tiempos de la fase `hecho` (cuánto se deja ver antes de
 * seguir) los maneja `useConfirmar`, para que ninguna pantalla se equivoque con los temporizadores.
 *
 * Mismo anillo y mismo visto que el resto de la aplicación (`SubiendoArchivo`, `EnvioInforme`): que esperar
 * un envío se parezca a esperar un archivo es lo que hace que sea una sola aplicación. Sin porcentaje, a
 * propósito, por la misma razón que allí: casi nunca se sabe cuánto falta.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { T } from './tema'

/** El anillo de espera. Hereda el color del texto. */
export function Anillo({ tamano = 16 }: { tamano?: number }) {
  const r = 8
  const c = 2 * Math.PI * r
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 20 20" aria-hidden="true" className="animate-spin" style={{ animationDuration: '1.1s', animationTimingFunction: 'linear' }}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${c * 0.28} ${c}`} />
    </svg>
  )
}

/** El visto, dibujado trazo a trazo (ver la nota de `.check-trazo` en globals.css). Hereda el color del texto. */
export function CheckDibujado({ tamano = 16 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 L10 17.5 L19 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="34" className="check-trazo" />
    </svg>
  )
}

/**
 * Un texto que puede cambiar («Quitar» → «Quitando…») sin que su caja cambie de ancho: reserva, invisible, el del más
 * largo. Para los botones sencillos de texto que no justifican las tres caras de `BotonAccion`.
 */
export function TextoEstable({ texto, reserva }: { texto: ReactNode; reserva: ReactNode }) {
  return (
    <span className="inline-grid">
      <span className="col-start-1 row-start-1">{texto}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">{reserva}</span>
    </span>
  )
}

/**
 * Un bloque que se DESPLIEGA al aparecer y se pliega al irse, en vez de empujar de golpe lo que tiene debajo.
 *
 * Para los avisos y mensajes que aparecen según lo que se elige o lo que sale mal (una nota, un error, una pregunta
 * de «¿qué hacemos con el responsable anterior?»): son contenido legítimo, pero un cartel que aparece de golpe mueve
 * 70 o 170 px lo que la persona estaba a punto de pulsar. Aquí solo cambia la altura de un contenedor, con una curva
 * corta, y el contenido se cruza con ella.
 *
 * Mientras se pliega conserva el último contenido (si no, se vaciaría antes de cerrarse). Con «reducir movimiento»
 * cambia sin animar. Pasa el espacio de separación por dentro (`pb-3`) para no dejar un hueco cuando está plegado.
 */
export function Despliegue({ abierto, children, separacion = 'pb-3' }: { abierto: boolean; children: ReactNode; separacion?: string }) {
  const [congelado, setCongelado] = useState<ReactNode>(children)
  if (abierto && congelado !== children) setCongelado(children)
  return (
    <div
      aria-hidden={!abierto || undefined}
      inert={!abierto || undefined}
      className={`my-0 grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={separacion}>{congelado}</div>
      </div>
    </div>
  )
}

export type FaseBoton = 'reposo' | 'trabajando' | 'hecho'

export interface EtiquetasBoton {
  reposo: ReactNode
  trabajando: ReactNode
  hecho: ReactNode
}

export default function BotonAccion({
  fase, etiquetas, onClick, inhabilitado = false, variante = 'primaria', chico = false, id, className = '',
}: {
  fase: FaseBoton
  etiquetas: EtiquetasBoton
  onClick: () => void
  /** Apagado de verdad (falta algo por llenar): solo vale en reposo. */
  inhabilitado?: boolean
  variante?: 'primaria' | 'secundaria'
  chico?: boolean
  id?: string
  className?: string
}) {
  const clase = variante === 'primaria'
    ? (chico ? T.accionPrimariaChica : T.accionPrimaria)
    : (chico ? T.accionSecundariaChica : T.accionSecundaria)
  const ocupado = fase !== 'reposo'

  return (
    <button
      id={id}
      type="button"
      disabled={inhabilitado && !ocupado}
      aria-disabled={ocupado || undefined}
      aria-busy={fase === 'trabajando' || undefined}
      onClick={() => { if (!ocupado && !inhabilitado) onClick() }}
      className={`${clase} max-w-full ${className}`}
    >
      {/* Las tres caras ocupan la MISMA celda: el botón mide lo que la más ancha y no se mueve al cambiar. */}
      <span className="grid min-w-0 max-w-full place-items-center [grid-template-columns:minmax(0,1fr)]">
        {(['reposo', 'trabajando', 'hecho'] as const).map(f => {
          const activa = fase === f
          return (
            <span
              key={f}
              aria-hidden={!activa}
              className={`col-start-1 row-start-1 inline-flex min-w-0 max-w-full items-center justify-center gap-2 whitespace-nowrap transition-[opacity,transform] duration-200 ease-out ${
                activa ? 'translate-y-0 opacity-100' : `pointer-events-none opacity-0 ${f === 'reposo' ? '-translate-y-1.5' : 'translate-y-1.5'}`
              }`}
            >
              {/* El anillo y el visto están SIEMPRE (ocupan su sitio): si se montaran al activarse, la cara cambiaría de ancho y su
                  texto se correría. `key` hace que el visto se vuelva a dibujar cada vez que la cara se activa. */}
              {f === 'trabajando' && <Anillo tamano={chico ? 13 : 16} />}
              {f === 'hecho' && <CheckDibujado key={String(activa)} tamano={chico ? 13 : 16} />}
              {etiquetas[f]}
            </span>
          )
        })}
      </span>
    </button>
  )
}

/**
 * Lleva la fase de una acción que se espera y se confirma.
 *
 *   const { fase, correr } = useConfirmar()
 *   await correr(() => acciones.guardar(...), { alTerminar: resultado => ... })
 *
 * `correr` pone la fase en `trabajando` mientras dura la acción. Si sale bien, pasa a `hecho` y la deja ver
 * `ms` milisegundos (lo bastante para que el visto se dibuje y se lea) antes de llamar a `alTerminar`; si sale
 * mal, vuelve a `reposo` y llama a `alFallar` al instante: un error no se hace esperar.
 *
 * El tiempo de `hecho` no se acumula con la espera: si la acción tardó, el visto no se retrasa más.
 * `alTerminar` se llama SIEMPRE que la acción salió bien, aunque la pantalla ya no esté (cerraron la ventana mientras
 * guardaba, o la pantalla se recargó sola con los datos nuevos): si no, algo se hacía y nadie se enteraba. En ese caso
 * no se espera el medio segundo del visto, se avisa de inmediato.
 * Lo que sigue en pantalla tras terminar (un formulario) vuelve a `reposo`; lo que se cierra (un diálogo) usa
 * `quedarseHecho` para no mostrar su texto de antes mientras se despide.
 */
export const MS_CONFIRMACION = 650

export function useConfirmar(ms = MS_CONFIRMACION) {
  const [fase, setFase] = useState<FaseBoton>('reposo')
  const viva = useRef(true)
  const enCurso = useRef(false)
  // Si la pantalla desaparece mientras se deja ver el «hecho», la espera se corta: lo que sigue ocurre de inmediato.
  const cortarEspera = useRef<(() => void) | null>(null)
  useEffect(() => {
    viva.current = true
    return () => { viva.current = false; cortarEspera.current?.() }
  }, [])

  const correr = useCallback(async <T,>(
    accion: () => Promise<{ ok: true; datos: T } | { ok: false; error: string }>,
    { alTerminar, alFallar, quedarseHecho = false }: {
      alTerminar: (datos: T) => void
      alFallar?: (error: string) => void
      /** Para lo que se cierra al terminar (un diálogo): el botón se queda en «hecho» hasta desaparecer, sin volver a su texto de antes. */
      quedarseHecho?: boolean
    },
  ) => {
    if (enCurso.current) return
    enCurso.current = true
    setFase('trabajando')
    let r: Awaited<ReturnType<typeof accion>>
    try {
      r = await accion()
    } catch {
      r = { ok: false, error: 'No se pudo completar. Revisa tu conexión e intenta de nuevo.' }
    }
    if (!r.ok) {
      if (viva.current) setFase('reposo')
      enCurso.current = false
      alFallar?.(r.error)
      return
    }
    if (viva.current) {
      setFase('hecho')
      await new Promise<void>(res => {
        const t = setTimeout(res, ms)
        cortarEspera.current = () => { clearTimeout(t); res() }
      })
      cortarEspera.current = null
    }
    enCurso.current = false
    // Se avisa SIEMPRE, también si la pantalla ya no está: la acción se hizo, y quien la pidió tiene que enterarse (por
    // ejemplo, si cerró la ventana mientras se guardaba, o si la pantalla se recargó sola con los datos nuevos).
    alTerminar(r.datos)
    if (!viva.current) return
    if (!quedarseHecho) { setFase('reposo'); return }
    // Salvaguarda: si lo que debía reemplazar este botón nunca llega, no se queda «hecho» para siempre.
    setTimeout(() => { if (viva.current) setFase('reposo') }, 6000)
  }, [ms])

  return { fase, correr, ocupado: fase !== 'reposo' }
}

/**
 * Qué elementos de una lista acaban de llegar (después de la primera lectura), para iluminarlos un momento con
 * `pdm-nuevo`: quien acaba de comentar o de reportar ve DÓNDE quedó lo suyo, sin cartel.
 *
 * `ids` es `null` mientras la lista no se ha leído: la primera lista que llega es la base, no «lo nuevo».
 */
export function useNuevos(ids: string[] | null): ReadonlySet<string> {
  const [conocidos, setConocidos] = useState<ReadonlySet<string> | null>(null)
  const [nuevos, setNuevos] = useState<ReadonlySet<string>>(() => new Set())
  const firma = ids === null ? null : ids.join('|')
  useEffect(() => {
    if (ids === null) return
    if (conocidos !== null) {
      const frescos = ids.filter(id => !conocidos.has(id))
      if (frescos.length > 0) setNuevos(prev => new Set([...prev, ...frescos]))
    }
    setConocidos(new Set(ids))
    // `firma` resume el contenido de `ids`: depender de la lista misma volvería a correr el efecto en cada pintado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])
  return nuevos
}
