'use client'

/**
 * Donde se adjuntan las evidencias de un reporte: una zona para soltar o elegir archivos, y debajo cada archivo con su
 * estado.
 *
 * ── Qué hace bien ────────────────────────────────────────────────────────
 *
 *   · SE PUEDE SOLTAR en cualquier parte de la ventana, no solo dentro del recuadro: soltar un archivo un poco fuera
 *     hace que el navegador lo ABRA y se pierda el formulario entero. Mientras esto esté en pantalla, ningún archivo se
 *     abre por accidente.
 *   · Varios archivos de distintos tipos a la vez, en cualquier mezcla. Los que sirven se adjuntan; de cada uno que no
 *     sirve se dice cuál es y por qué, sin tumbar a los demás.
 *   · Cada archivo cuenta su historia: su vista previa (o el icono de su clase), peso, y mientras sube, su barra. Si uno
 *     falla, es ese y solo ese el que lo dice.
 *   · En el teléfono el recuadro dice «Elegir archivos» (no hay nada que arrastrar) y aparece «Tomar foto».
 *   · Teclado y lector de pantalla: el recuadro ES la entrada de archivos (se llega con Tab, se activa con Enter o
 *     espacio) y los cambios se anuncian.
 *
 * No sabe subir nada: solo pinta lo que le dan y avisa de lo que la persona hace.
 */

import { useEffect, useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { categoriaDeMime, ETIQUETA_CATEGORIA } from '@/lib/pdm/evidencias-armar'
import type { ArchivoEnCola, Rechazo } from '@/lib/pdm/evidencias-cola'
import { MAX_EVIDENCIAS, describirTamano, tipoDeArchivo } from '@/lib/pdm/seguimiento-acciones'
import { CheckDibujado, Despliegue } from './Movimiento'
import { GLIFO_DE_CATEGORIA } from './iconos-tipo'

const ACEPTA = 'image/*,.pdf,.doc,.docx,.xls,.xlsx'

// ─── Soltar archivos ─────────────────────────────────────────────────────────

/** ¿Lo que se arrastra son archivos (y no un texto o un enlace)? */
const traeArchivos = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

/** Los archivos de un arrastre, y las carpetas aparte: una carpeta no es un archivo y no se puede adjuntar. */
function leerSoltado(dt: DataTransfer): { archivos: File[]; carpetas: string[] } {
  const archivos: File[] = []
  const carpetas: string[] = []
  const items = Array.from(dt.items ?? [])
  if (items.length > 0 && items.every(i => i.kind === 'file')) {
    for (const it of items) {
      const entrada = typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null
      if (entrada?.isDirectory) { carpetas.push(entrada.name); continue }
      const f = it.getAsFile()
      if (f) archivos.push(f)
    }
  } else {
    archivos.push(...Array.from(dt.files))
  }
  return { archivos, carpetas }
}

/**
 * Escucha arrastres en TODA la ventana mientras la zona está en pantalla. Hace dos cosas: marca `arrastrando` para
 * iluminar el recuadro, y recibe lo soltado en cualquier lugar (y siempre cancela la acción por defecto, que sería abrir
 * el archivo y perder el formulario).
 */
function useSoltar(activo: boolean, alSoltar: (archivos: File[], carpetas: string[]) => void) {
  const [arrastrando, setArrastrando] = useState(false)
  const fn = useRef(alSoltar)
  useEffect(() => { fn.current = alSoltar })

  useEffect(() => {
    let dentro = 0
    const entra = (e: DragEvent) => { if (!traeArchivos(e)) return; e.preventDefault(); dentro++; if (activo) setArrastrando(true) }
    const sobre = (e: DragEvent) => {
      if (!traeArchivos(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = activo ? 'copy' : 'none'
    }
    const sale = (e: DragEvent) => { if (!traeArchivos(e)) return; dentro = Math.max(0, dentro - 1); if (dentro === 0) setArrastrando(false) }
    const suelta = (e: DragEvent) => {
      if (!traeArchivos(e)) return
      e.preventDefault()
      dentro = 0
      setArrastrando(false)
      if (!activo || !e.dataTransfer) return
      const { archivos, carpetas } = leerSoltado(e.dataTransfer)
      fn.current(archivos, carpetas)
    }
    window.addEventListener('dragenter', entra)
    window.addEventListener('dragover', sobre)
    window.addEventListener('dragleave', sale)
    window.addEventListener('drop', suelta)
    return () => {
      window.removeEventListener('dragenter', entra)
      window.removeEventListener('dragover', sobre)
      window.removeEventListener('dragleave', sale)
      window.removeEventListener('drop', suelta)
    }
  }, [activo])

  return activo && arrastrando
}

// ─── Un archivo ──────────────────────────────────────────────────────────────

/** La vista previa de una foto (ya creada por quien tiene la cola); para lo demás, o si la foto no se puede dibujar, el icono de su clase. */
function Miniatura({ archivo, vista }: { archivo: File; vista?: string }) {
  const categoria = categoriaDeMime(tipoDeArchivo(archivo.name, archivo.type)?.mime ?? '')
  const [fallo, setFallo] = useState(false)
  if (vista && !fallo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={vista} alt="" decoding="async" onError={() => setFallo(true)} className="h-9 w-9 shrink-0 rounded-md border border-[#DCE0E8] object-cover" />
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#EEF0F4] text-[#556072]">
      <Icono glifo={categoria ? GLIFO_DE_CATEGORIA[categoria] : Iconos.documentos.adjunto} tamano="sm" />
    </span>
  )
}

function Fila({ e, bloqueada, onQuitar }: { e: ArchivoEnCola<File>; bloqueada: boolean; onQuitar: () => void }) {
  const categoria = categoriaDeMime(tipoDeArchivo(e.archivo.name, e.archivo.type)?.mime ?? '')
  const pct = Math.round(e.progreso * 100)
  const subiendo = e.estado === 'subiendo'
  return (
    <li className="pdm-entra relative flex items-center gap-3 overflow-hidden rounded-lg border border-[#DCE0E8] bg-white py-2 pl-2.5 pr-2">
      <Miniatura archivo={e.archivo} vista={e.vista} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[#192031]">{e.archivo.name}</span>
        <span className="mt-0.5 block text-xs tabular-nums text-[#667085]">
          {e.estado === 'error' ? (
            <span className="font-medium text-[#B42318]">{e.error ?? 'No se pudo subir.'}</span>
          ) : e.estado === 'subido' ? (
            <span className="inline-flex items-center gap-1 font-medium text-[#1F5D43]"><CheckDibujado tamano={13} />Subido</span>
          ) : subiendo ? (
            <>Subiendo · {pct} %</>
          ) : (
            <>{categoria ? ETIQUETA_CATEGORIA[categoria] : 'Archivo'} · {describirTamano(e.archivo.size)}</>
          )}
        </span>
      </span>
      {/* Se queda en su sitio mientras se envía (inactivo): si desapareciera, la fila cambiaría de ancho. */}
      <button
        type="button"
        onClick={onQuitar}
        disabled={bloqueada}
        className="shrink-0 rounded-md p-2.5 text-[#667085] transition-colors hover:bg-[#F4F5F8] hover:text-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] disabled:pointer-events-none disabled:opacity-30"
      >
        <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta={`Quitar ${e.archivo.name}`} />
      </button>
      {/* La barra ocupa su lugar siempre (invisible en reposo): así la fila no cambia de alto al empezar a subir. */}
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[3px] bg-[#192031]/10 transition-opacity duration-200 ${subiendo ? 'opacity-100' : 'opacity-0'}`}>
        <span className="block h-full bg-[#192031] transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
      </span>
    </li>
  )
}

// ─── La zona ─────────────────────────────────────────────────────────────────

export default function ZonaEvidencias({ cola, conservadas, bloqueada, error, avisos, onAgregar, onQuitar, onLimpiarAvisos }: {
  cola: ArchivoEnCola<File>[]
  /** Archivos de la versión anterior que pasan a esta: cuentan para el tope de cinco. */
  conservadas: number
  /** Mientras se envía: no se agrega ni se quita nada. */
  bloqueada: boolean
  /** Lo que falta, si se intentó enviar sin evidencia. */
  error: string | null
  /** Archivos que se rechazaron al elegir, cada uno con su motivo. */
  avisos: Rechazo[]
  onAgregar: (archivos: File[], carpetas?: string[]) => void
  onQuitar: (clave: string) => void
  onLimpiarAvisos: () => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const total = conservadas + cola.length
  const llena = total >= MAX_EVIDENCIAS

  const arrastrando = useSoltar(!bloqueada && !llena, (archivos, carpetas) => onAgregar(archivos, carpetas))

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (lista.length > 0) onAgregar(lista)
  }

  return (
    <div>
      {cola.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {cola.map(e => <Fila key={e.clave} e={e} bloqueada={bloqueada} onQuitar={() => onQuitar(e.clave)} />)}
        </ul>
      )}

      <Despliegue abierto={avisos.length > 0} separacion="pb-2">
        <div role="group" aria-label="Archivos que no se pudieron adjuntar" className="rounded-lg border border-[#F1C0BB] bg-[#FDF3F2] text-[#912018]">
          <div className="flex items-center gap-2 py-2 pl-3 pr-1.5">
            <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="shrink-0" />
            <p className="min-w-0 flex-1 text-xs font-semibold">
              {avisos.length === 1 ? 'No se pudo adjuntar 1 archivo' : `No se pudieron adjuntar ${avisos.length} archivos`}
            </p>
            <button type="button" onClick={onLimpiarAvisos} className="-my-1 shrink-0 rounded-md p-1.5 hover:bg-[#FBE4E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#912018]">
              <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta="Descartar el aviso" />
            </button>
          </div>
          <ul className="divide-y divide-[#F1C0BB] border-t border-[#F1C0BB]">
            {avisos.map((a, k) => (
              <li key={`${a.nombre}:${k}`} className="[overflow-wrap:anywhere] px-3 py-2 text-xs leading-relaxed">
                <b className="font-semibold">{a.nombre}</b> — {a.motivo}
              </li>
            ))}
          </ul>
        </div>
      </Despliegue>

      {/* El anillo de foco (2 px + 2 de separación) sale del recuadro y el pliegue recorta lo que sobresale: se le da 4 px de aire por
          dentro y se compensa por fuera, así el anillo cabe entero y el resto de la pantalla no se mueve. */}
      <div className="-m-1">
      <Despliegue abierto={!llena} separacion="p-1">
        <div className="flex gap-2">
          <label
            // `relative`: el campo de archivos está escondido con `sr-only` (posición absoluta). Sin esto su bloque contenedor era la VENTANA y el
            // campo quedaba a ~1.800 px de altura; al cerrarse el selector de archivos (cancelar o elegir) el navegador le devuelve el foco y
            // desplaza la ventana hasta él: el contenido sube fuera de la vista y la ventana queda en blanco.
            className={`group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-[#192031] focus-within:ring-offset-2 ${
              bloqueada ? 'cursor-not-allowed border-[#C5CBD6] opacity-60'
                : arrastrando ? 'cursor-copy border-[#192031] bg-[#EEF0F4]'
                  : error ? 'cursor-pointer border-[#B42318] bg-[#FDF3F2] hover:border-[#912018]'
                    : 'cursor-pointer border-[#AEB6C4] bg-white hover:border-[#192031] hover:bg-[#F8F9FB]'
            }`}
          >
            <Icono glifo={Iconos.documentos.subir} tamano="md" className={arrastrando ? 'text-[#192031]' : 'text-[#667085] group-hover:text-[#192031]'} />
            <span className="text-sm font-semibold text-[#192031]">
              {arrastrando ? 'Suelta para adjuntar' : (
                <>
                  <span className="[@media(pointer:coarse)]:hidden">{total === 0 ? 'Arrastra tus archivos aquí' : 'Añadir más archivos'}</span>
                  <span className="hidden [@media(pointer:coarse)]:inline">{total === 0 ? 'Elegir archivos' : 'Añadir más archivos'}</span>
                </>
              )}
            </span>
            <span className="text-xs text-[#556072] [@media(pointer:coarse)]:hidden">o <span className="font-semibold underline decoration-[#9AA3B5] underline-offset-2 group-hover:decoration-[#192031]">elígelos desde tu equipo</span></span>
            <span className="text-[11px] text-[#667085]">PDF, fotos, Word o Excel · hasta 10 MB cada uno</span>
            <input
              ref={entrada}
              id="pdm-evidencia"
              type="file"
              multiple
              disabled={bloqueada}
              accept={ACEPTA}
              aria-describedby={error ? 'pdm-evidencia-error' : undefined}
              aria-invalid={error ? true : undefined}
              className="sr-only"
              onChange={alElegir}
            />
          </label>

          {/* Solo en pantallas táctiles: abrir la cámara directamente. */}
          <label className={`relative hidden shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-[#C5CBD6] bg-white px-4 text-xs font-semibold text-[#192031] transition-colors focus-within:ring-2 focus-within:ring-[#192031] focus-within:ring-offset-2 [@media(pointer:coarse)]:flex ${bloqueada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer active:bg-[#F4F5F8]'}`}>
            <Icono glifo={Iconos.dominio.evidencia} tamano="md" />
            Tomar foto
            <input type="file" accept="image/*" capture="environment" disabled={bloqueada} className="sr-only" onChange={alElegir} />
          </label>
        </div>
      </Despliegue>
      </div>

      {llena && <p className="text-xs text-[#667085]">Llegaste al máximo de {MAX_EVIDENCIAS} archivos. Quita uno si necesitas cambiarlo.</p>}

      <Despliegue abierto={!!error} separacion="pt-1.5">
        {error ? <p id="pdm-evidencia-error" role="alert" className="text-xs font-medium text-[#B42318]">{error}</p> : null}
      </Despliegue>

      <p className="sr-only" role="status" aria-live="polite">
        {total === 0 ? 'Ningún archivo adjunto.' : `${total} de ${MAX_EVIDENCIAS} archivos adjuntos.`}
      </p>
    </div>
  )
}
