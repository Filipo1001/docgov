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
 * A PANTALLA COMPLETA, Y A PROPÓSITO. Se probó una versión más contenida
 * —tarjeta centrada sobre velo tenue— y se descartó: enviar el informe es el
 * acto más importante que hace un contratista en todo el mes, y merece que la
 * pantalla se detenga a contarlo. La capa opaca además resuelve por sí sola
 * que no se vea nada cambiando por detrás mientras la carpeta se arma.
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
      style={{ backgroundColor: 'rgba(25, 32, 49, 0.88)' }}
      role="status"
      aria-live="polite"
      // Sin cierre al tocar fuera: alguien podría creer que canceló el envío.
      aria-label={error ? 'Error al enviar el informe' : 'Enviando el informe a revisión'}
    >
      <div className="flex flex-col items-center max-w-sm w-full">

        {/* ── Zona de la carpeta ───────────────────────────────── */}
        <div className="relative h-32 sm:h-36 flex items-end justify-center mb-6">

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
                    ? 'opacity-0 -translate-x-1/2 translate-y-4 scale-[0.7]'
                    : 'opacity-100 -translate-x-1/2 -translate-y-2 scale-100'
                } motion-reduce:transition-opacity motion-reduce:translate-y-0 motion-reduce:scale-100`}
                style={{ bottom: '3.5rem' }}
              >
                <div className="w-14 h-14 rounded-xl bg-white shadow-lg flex items-center justify-center">
                  <Icono glifo={pieza.icono} tamano="lg" className="text-gray-500" />
                </div>
              </div>
            )
          })}

          {/* La carpeta */}
          <div
            className={`transition-all duration-300 ${sellado ? 'scale-[1.04]' : 'scale-100'} motion-reduce:transition-opacity`}
            style={{ opacity: opacidadCarpeta }}
          >
            <LogoCD size={88} color="#FFFFFF" />
          </div>

          {/* Sello final — el único color de toda la secuencia */}
          {sellado && (
            <div className="absolute bottom-2 right-1/2 translate-x-10 w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg upload-card-enter">
              <Icono glifo={Iconos.estado.ok} tamano="md" className="text-white" />
            </div>
          )}
        </div>

        {/* ── Texto ────────────────────────────────────────────── */}
        {error ? (
          <>
            <p className="text-white text-sm font-medium text-center">No se pudo enviar</p>
            <p className="text-white/60 text-xs text-center mt-1.5 leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={onCerrar}
              className="mt-5 px-5 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
            >
              Cerrar
            </button>
          </>
        ) : sellado ? (
          <p className="text-white text-sm font-medium text-center">Informe enviado a revisión</p>
        ) : (
          <>
            <p className="text-white text-sm font-medium text-center">Archivando tu informe</p>
            <p className="text-white/60 text-xs text-center mt-1.5 h-4">
              {enCurso?.etiqueta ?? ''}
            </p>
            {lento && (
              <p className="text-white/50 text-[11px] text-center mt-4 leading-relaxed">
                Sigue en curso. No cierres esta página.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
