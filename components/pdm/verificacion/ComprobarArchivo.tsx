'use client'

/**
 * «Comprobar un archivo»: la persona suelta (o elige) un archivo y su propio navegador calcula la huella SHA-256 ahí mismo; se
 * compara con las que el servidor anotó al subir cada archivo del reporte. El archivo NO se sube a ninguna parte.
 *
 * Es lo que da valor a la huella: quien recibe un archivo por correo o en una memoria puede saber, sin confiar en nadie, si es
 * exactamente el que se subió al reporte o si cambió (aunque sea un solo bit).
 */

import { useId, useRef, useState, type DragEvent } from 'react'
import { archivoQueCoincide, etiquetaDeTipo, type ArchivoDeConstancia } from '@/lib/pdm/constancia'
import { huellaDeArchivo } from '@/lib/pdm/sha256-navegador'
import { describirTamano } from '@/lib/pdm/seguimiento-acciones'

type Estado =
  | { fase: 'quieto' }
  | { fase: 'calculando'; nombre: string; avance: number }
  | { fase: 'listo'; nombre: string; sha256: string; bytes: number; coincide: ArchivoDeConstancia | null }
  | { fase: 'error' }

export default function ComprobarArchivo({ archivos }: { archivos: ArchivoDeConstancia[] }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'quieto' })
  const [encima, setEncima] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const control = useRef<AbortController | null>(null)
  const id = useId()
  const conHuella = archivos.some(a => a.sha256 !== null)

  async function comprobar(archivo: File) {
    control.current?.abort()
    const c = new AbortController()
    control.current = c
    setEstado({ fase: 'calculando', nombre: archivo.name, avance: 0 })
    try {
      const { sha256, bytes } = await huellaDeArchivo(archivo, {
        senal: c.signal,
        alAvanzar: f => setEstado(e => (e.fase === 'calculando' ? { ...e, avance: f } : e)),
      })
      if (c.signal.aborted) return
      setEstado({ fase: 'listo', nombre: archivo.name, sha256, bytes, coincide: archivoQueCoincide(archivos, sha256, bytes) })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setEstado({ fase: 'error' })
    }
  }

  function alSoltar(e: DragEvent) {
    e.preventDefault()
    setEncima(false)
    const archivo = e.dataTransfer.files?.[0]
    if (archivo) void comprobar(archivo)
  }

  return (
    <section aria-labelledby={`${id}-t`} className="mt-5 border-t border-slate-100 pt-4">
      <h2 id={`${id}-t`} className="text-sm font-semibold text-slate-900">Comprobar un archivo</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        ¿Recibió un archivo de este reporte? Suéltelo aquí para saber si es idéntico al que se registró. Su archivo no sale de este
        dispositivo: la huella se calcula en su navegador.
      </p>

      {!conHuella ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Los archivos de esta versión no tienen huella registrada, así que no se pueden comprobar.
        </p>
      ) : (
        <>
          <label
            htmlFor={`${id}-f`}
            onDragOver={e => { e.preventDefault(); setEncima(true) }}
            onDragLeave={() => setEncima(false)}
            onDrop={alSoltar}
            className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-slate-400 ${
              encima ? 'border-slate-500 bg-slate-100' : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            }`}
          >
            <span className="text-sm font-medium text-slate-800">Suelte un archivo aquí o toque para elegirlo</span>
            <span className="text-xs text-slate-500">PDF, imagen, Word, Excel, presentación, video…</span>
            <input
              id={`${id}-f`} ref={entrada} type="file" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void comprobar(f) }}
            />
          </label>

          <div aria-live="polite" className="mt-3">
            {estado.fase === 'calculando' && (
              <div role="status">
                <p className="truncate text-xs text-slate-600">Calculando la huella de «{estado.nombre}»…</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-slate-700 transition-[width] duration-200" style={{ width: `${Math.round(estado.avance * 100)}%` }} />
                </div>
                <button type="button" onClick={() => { control.current?.abort(); setEstado({ fase: 'quieto' }) }} className="mt-2 text-xs font-medium text-slate-500 underline">
                  Cancelar
                </button>
              </div>
            )}
            {estado.fase === 'error' && (
              <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                No se pudo leer el archivo. Inténtelo de nuevo; si persiste, pruebe desde un computador.
              </p>
            )}
            {estado.fase === 'listo' && (
              <div className={`rounded-lg border px-3 py-3 ${estado.coincide ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <p className={`text-sm font-semibold ${estado.coincide ? 'text-emerald-800' : 'text-red-800'}`}>
                  {estado.coincide ? 'Idéntico al archivo registrado' : 'No coincide con ningún archivo de este reporte'}
                </p>
                <p className={`mt-1 text-xs leading-relaxed ${estado.coincide ? 'text-emerald-800' : 'text-red-800'}`}>
                  {estado.coincide
                    ? `Es el mismo ${etiquetaDeTipo(estado.coincide.tipo)} de ${describirTamano(estado.coincide.bytes)} que se subió a esta versión del reporte: ni un solo byte cambió.`
                    : 'Puede ser un archivo de otra versión del reporte, o puede haber sido modificado después de subirse. Compare con el reporte vigente o pida el original.'}
                </p>
                <p className="mt-2 truncate text-[11px] text-slate-600" title={estado.nombre}>«{estado.nombre}» · {describirTamano(estado.bytes)}</p>
                <p className="mt-0.5 break-all font-mono text-[11px] leading-snug text-slate-600">{estado.sha256}</p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
