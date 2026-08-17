'use client'

/**
 * Animación del envío a revisión: el expediente que se arma.
 *
 * POR QUÉ ASÍ. El logotipo de Contratista Digital es una carpeta —así lo
 * documenta components/Logo.tsx: «el objeto que este producto sustituye»—, de
 * modo que la animación no decora, representa literalmente lo que ocurre: el
 * papeleo del contratista entrando a la carpeta digital que reemplaza a la
 * física. La metáfora no hay que explicarla.
 *
 * PROTAGONISTA, NO INVASIVA. Es una tarjeta centrada sobre un velo tenue, no
 * una capa opaca a pantalla completa: la aplicación sigue visible alrededor,
 * así que el envío se lee como algo que ocurre DENTRO del expediente que el
 * contratista está mirando, y no como una pantalla aparte que lo secuestra.
 *
 * QUÉ SE MUESTRA, Y POR QUÉ NO ES UNA BARRA DE PROGRESO. Las tarjetas son un
 * INVENTARIO de lo que se está radicando —las actividades, las evidencias, la
 * planilla, el informe—, no una lista de pasos del servidor. Es una distinción
 * deliberada: el envío es UNA sola operación en el servidor, así que fingir
 * etapas con temporizadores sería inventar un progreso que nadie está midiendo.
 * Lo que sí está atado a la realidad es el final: la carpeta solo se cierra y
 * aparece el sello cuando el envío terminó DE VERDAD. Si falla, la animación no
 * llega nunca a ese estado.
 *
 * SOBRE EL COLOR. Toda la secuencia es monocroma salvo el sello final, en
 * esmeralda. lib/iconos.ts es explícito: el color solo aparece cuando significa
 * estado, nunca como adorno. Aquí significa «esto terminó bien», que es
 * exactamente el caso permitido.
 */

import { useEffect, useRef, useState } from 'react'
import { LogoCD } from '@/components/Logo'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'

export interface PiezaExpediente {
  icono: LucideIcon
  etiqueta: string
}

/** Cadencia de entrada de cada tarjeta. */
const MS_POR_PIEZA = 420
/** Tiempo mínimo en pantalla: un destello se percibe peor que no mostrar nada. */
const MS_MINIMO = 1200
/**
 * A partir de aquí se avisa de que va lento.
 *
 * Ocho segundos y no cinco: en móvil con señal irregular —y en el último
 * periodo, donde además se generó el PDF del acta de terminación— pasar de
 * cinco segundos es normal, y el aviso salía en envíos que iban bien.
 */
const MS_AVISO_LENTITUD = 8000

export default function EnvioExpediente({
  abierto,
  piezas,
  completado,
  error,
  onCerrar,
}: {
  abierto: boolean
  piezas: PiezaExpediente[]
  /** true cuando el envío terminó bien de verdad. */
  completado: boolean
  /** Mensaje de fallo; si llega, la animación se detiene sin sellar. */
  error?: string | null
  onCerrar: () => void
}) {
  const [archivadas, setArchivadas] = useState(0)
  const [sellado, setSellado] = useState(false)
  const [lento, setLento] = useState(false)
  const abiertoDesde = useRef<number>(0)

  // `onCerrar` llega como función anónima desde el padre, así que cambia de
  // identidad en cada render. Tenerla como dependencia del efecto de cierre lo
  // reiniciaba sin parar: los temporizadores se cancelaban y volvían a crearse,
  // y el cierre podía no llegar nunca. Guardada en una referencia, el efecto
  // depende solo de lo que de verdad importa.
  const cerrarRef = useRef(onCerrar)
  useEffect(() => { cerrarRef.current = onCerrar }, [onCerrar])

  // Entrada escalonada de las tarjetas mientras el envío está en vuelo.
  useEffect(() => {
    if (!abierto) {
      setArchivadas(0)
      setSellado(false)
      setLento(false)
      return
    }

    abiertoDesde.current = Date.now()
    const temporizadores: ReturnType<typeof setTimeout>[] = []

    // La última tarjeta se retiene: entra solo cuando el servidor confirma.
    // Así la carpeta nunca se ve «llena» antes de que el envío exista.
    const hastaAnimar = Math.max(piezas.length - 1, 0)
    for (let i = 0; i < hastaAnimar; i++) {
      temporizadores.push(setTimeout(() => setArchivadas(i + 1), MS_POR_PIEZA * (i + 1)))
    }
    temporizadores.push(setTimeout(() => setLento(true), MS_AVISO_LENTITUD))

    return () => temporizadores.forEach(clearTimeout)
  }, [abierto, piezas.length])

  // Cierre: solo con éxito real, y respetando el tiempo mínimo en pantalla.
  useEffect(() => {
    if (!abierto || !completado || error) return

    // Los tres temporizadores se declaran fuera para que la limpieza del efecto
    // los alcance. Antes los dos últimos se creaban DENTRO de la callback del
    // primero y su `return` no limpiaba nada —era el retorno de la callback, no
    // del efecto—, así que quedaban sueltos.
    const espera = Math.max(0, MS_MINIMO - (Date.now() - abiertoDesde.current))
    let tSello: ReturnType<typeof setTimeout>
    let tCierre: ReturnType<typeof setTimeout>

    const tLlenado = setTimeout(() => {
      setArchivadas(piezas.length)
      setLento(false)
      tSello = setTimeout(() => setSellado(true), 320)
      tCierre = setTimeout(() => cerrarRef.current(), 1400)
    }, espera)

    return () => {
      clearTimeout(tLlenado)
      clearTimeout(tSello)
      clearTimeout(tCierre)
    }
  }, [abierto, completado, error, piezas.length])

  if (!abierto) return null

  const total = piezas.length || 1
  // La carpeta se «llena»: del 25% al 100% conforme entran las piezas. Es el
  // indicador de avance — no hace falta ninguna barra encima.
  const opacidadCarpeta = 0.25 + (archivadas / total) * 0.75
  const enCurso = piezas[Math.min(archivadas, piezas.length - 1)]

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-6 upload-overlay-enter"
      // Velo tenue: la aplicación se sigue viendo alrededor. El envío ocurre
      // dentro del expediente que el contratista ya está mirando.
      style={{ backgroundColor: 'rgba(25, 32, 49, 0.45)' }}
      role="status"
      aria-live="polite"
      // Sin cierre al tocar fuera: alguien podría creer que canceló el envío.
      aria-label={error ? 'Error al enviar el informe' : 'Enviando el informe a revisión'}
    >
      <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 w-full max-w-xs flex flex-col items-center upload-card-enter">

        {/* ── Zona de la carpeta ───────────────────────────────── */}
        <div className="relative h-24 flex items-end justify-center mb-4">

          {/* Tarjetas: entran por arriba y se archivan tras el borde superior.
              El logo es una silueta rellena, sin boca, así que «meterse detrás»
              es lo que lee como archivar sin tener que redibujarlo. */}
          {piezas.map((pieza, i) => {
            const dentro = i < archivadas
            const visible = i <= archivadas && !sellado
            if (!visible) return null
            return (
              <div
                key={pieza.etiqueta}
                className={`absolute left-1/2 transition-all duration-300 ease-out ${
                  dentro
                    ? 'opacity-0 -translate-x-1/2 translate-y-3 scale-[0.7]'
                    : 'opacity-100 -translate-x-1/2 -translate-y-1 scale-100'
                } motion-reduce:transition-opacity motion-reduce:translate-y-0 motion-reduce:scale-100`}
                style={{ bottom: '2.5rem' }}
              >
                <div className="w-11 h-11 rounded-lg bg-white border border-gray-200 shadow-md flex items-center justify-center">
                  <Icono glifo={pieza.icono} tamano="md" className="text-gray-500" />
                </div>
              </div>
            )
          })}

          {/* La carpeta */}
          <div
            className={`transition-all duration-300 ${sellado ? 'scale-[1.04]' : 'scale-100'} motion-reduce:transition-opacity`}
            style={{ opacity: opacidadCarpeta }}
          >
            <LogoCD size={64} color={MARCA} />
          </div>

          {/* Sello final — el único color de toda la secuencia */}
          {sellado && (
            <div className="absolute bottom-0 right-1/2 translate-x-8 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-md upload-card-enter">
              <Icono glifo={Iconos.estado.ok} tamano="sm" className="text-white" />
            </div>
          )}
        </div>

        {/* ── Texto ────────────────────────────────────────────── */}
        {error ? (
          <>
            <p className="text-gray-900 text-sm font-semibold text-center">No se pudo enviar</p>
            <p className="text-gray-500 text-xs text-center mt-1.5 leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={onCerrar}
              className="mt-5 px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Cerrar
            </button>
          </>
        ) : sellado ? (
          <p className="text-gray-900 text-sm font-semibold text-center">Informe enviado a revisión</p>
        ) : (
          <>
            <p className="text-gray-900 text-sm font-semibold text-center">Archivando tu informe</p>
            <p className="text-gray-500 text-xs text-center mt-1.5 h-4">
              {enCurso?.etiqueta ?? ''}
            </p>
            {lento && (
              <p className="text-gray-400 text-[11px] text-center mt-3 leading-relaxed">
                Sigue en curso. No cierres esta página.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
