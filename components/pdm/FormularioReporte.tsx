'use client'

/**
 * El formulario con que quien tiene un indicador reporta su avance en el corte abierto.
 *
 * Tres situaciones, según lo que ya haya en el corte:
 *
 *   nuevo       nadie ha reportado: se reporta.
 *   corregir    ya hay un reporte esperando validación: se puede corregir (el formulario arranca
 *               cerrado: es la excepción), y la corrección dice qué se corrige.
 *   responder   la secretaría lo devolvió: se responde con un reporte nuevo que dice qué cambió.
 *   aprobado    ya lo validaron: no hay formulario. Para cambiarlo la secretaría tiene que devolverlo.
 *
 * Un reporte nunca se reescribe: corregir crea una versión nueva y la anterior queda en el historial.
 * La evidencia es obligatoria, como en la base: sin al menos un archivo el botón no se activa.
 */

import { useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt, type Indicador } from '@/lib/pdm/plan'
import type { Corte } from '@/lib/pdm/seguimiento'
import {
  MAX_EVIDENCIAS, MAX_MOTIVO_CORRECCION, MAX_TEXTO_REPORTE, MIN_TEXTO, TEXTO_TIPOS_EVIDENCIA,
  describirTamano, errorEnArchivos, errorEnReporte, leerNumero,
  type AccionesSeguimiento, type ReporteDetalle,
} from '@/lib/pdm/seguimiento-acciones'
import { ErrorDeSubida, subirArchivo } from '@/lib/pdm/subir'

type Fase = 'subiendo' | 'registrando' | null

export default function FormularioReporte({ indicador, corte, vigente, acciones, onHecho }: {
  indicador: Indicador
  corte: Corte
  /** La versión vigente del reporte de este indicador en este corte, si ya hay una. */
  vigente: ReporteDetalle | null
  acciones: AccionesSeguimiento
  /** Se llama con el aviso de lo que pasó, para que quien lo monta recargue. */
  onHecho: (mensaje: string) => void
}) {
  const modo = !vigente ? 'nuevo' : vigente.estado === 'aprobado' ? 'aprobado' : vigente.estado === 'devuelto' ? 'responder' : 'corregir'
  const correccion = vigente !== null && modo !== 'aprobado'

  const [abierto, setAbierto] = useState(modo !== 'corregir')
  const [valor, setValor] = useState(vigente ? String(vigente.valor).replace('.', ',') : '')
  const [texto, setTexto] = useState(vigente?.texto ?? '')
  const [motivo, setMotivo] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [fase, setFase] = useState<Fase>(null)
  const [error, setError] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  if (modo === 'aprobado') {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-emerald-900">Reporte aprobado</h3>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
          La secretaría aprobó el reporte de «{corte.nombre}». Si hay que cambiarlo, tiene que devolverlo antes.
        </p>
      </section>
    )
  }

  if (!abierto) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700">¿Hay que corregir lo que reportaste en «{corte.nombre}»?</p>
          <button
            id="pdm-corregir"
            onClick={() => setAbierto(true)}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50"
          >
            Corregir el reporte
          </button>
        </div>
      </section>
    )
  }

  const numero = leerNumero(valor)
  const enviando = fase !== null
  const motivoOk = !correccion || motivo.trim().length >= MIN_TEXTO
  const listo = numero !== null && texto.trim().length >= MIN_TEXTO && archivos.length > 0 && motivoOk

  function agregar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    setError(null)
    const nuevos = [...archivos]
    for (const f of Array.from(lista)) {
      if (nuevos.length >= MAX_EVIDENCIAS) { setError(`Una evidencia admite hasta ${MAX_EVIDENCIAS} archivos.`); break }
      const mal = errorEnArchivos([{ nombre: f.name, tipo: f.type, bytes: f.size }])
      if (mal) { setError(mal); continue }
      if (nuevos.some(x => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) continue
      nuevos.push(f)
    }
    setArchivos(nuevos)
    if (entrada.current) entrada.current.value = ''
  }

  async function enviar() {
    if (enviando) return
    setError(null)
    const mal = errorEnReporte({ valor: numero, texto, motivo }, correccion)
      ?? errorEnArchivos(archivos.map(f => ({ nombre: f.name, tipo: f.type, bytes: f.size })))
    if (mal || numero === null) { setError(mal ?? 'Escribe el valor del avance.'); return }

    setFase('subiendo')
    const prep = await acciones.prepararEvidencias({
      indicador: indicador.uuid,
      archivos: archivos.map(f => ({ nombre: f.name, tipo: f.type, bytes: f.size })),
    })
    if (!prep.ok) { setFase(null); setError(prep.error); return }
    if (prep.datos.length !== archivos.length) { setFase(null); setError('No se pudo preparar la subida. Intenta de nuevo.'); return }

    try {
      await Promise.all(archivos.map((f, k) => subirArchivo(prep.datos[k].urlSubida, f, prep.datos[k].tipo)))
    } catch (e) {
      setFase(null)
      setError(e instanceof ErrorDeSubida ? e.message : 'No se pudo subir un archivo. Revisa tu conexión e intenta de nuevo.')
      return
    }

    setFase('registrando')
    const r = await acciones.reportar({
      indicador: indicador.uuid,
      valor: numero,
      texto,
      evidencias: archivos.map((f, k) => ({ ruta: prep.datos[k].ruta, nombre: f.name, tipo: prep.datos[k].tipo, bytes: f.size })),
      motivo: correccion ? motivo : undefined,
    })
    setFase(null)
    if (!r.ok) { setError(r.error); setArchivos([]); return }
    setArchivos([])
    setMotivo('')
    onHecho(r.datos.correccion ? 'Corrección enviada. La secretaría la revisará.' : 'Reporte enviado. La secretaría lo revisará.')
  }

  const titulo = modo === 'nuevo' ? `Reportar avance · ${corte.nombre}` : modo === 'responder' ? 'Responder a la devolución' : 'Corregir el reporte'

  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
      <h3 className="text-sm font-bold text-gray-900">{titulo}</h3>

      {modo === 'responder' && vigente && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">
          <b>La secretaría lo devolvió{vigente.validaciones.at(-1)?.validadorNombre ? ` (${vigente.validaciones.at(-1)!.validadorNombre})` : ''}:</b>{' '}
          {vigente.validaciones.at(-1)?.comentario ?? 'sin comentario'}
        </p>
      )}

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Valor del avance ({indicador.unidad.toLowerCase()})</span>
          <input
            id="pdm-valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={valor}
            disabled={enviando}
            onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, '').slice(0, 14))}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm tabular-nums text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
          />
          {valor.trim() !== '' && (
            <span className={`mt-1 block text-[11px] ${numero === null ? 'text-red-700' : 'text-gray-500'}`}>
              {numero === null ? 'No se entiende ese número.' : `Se registrará ${fmt(numero)}`}
            </span>
          )}
          {indicador.criterio === null && (
            <span className="mt-1 block text-[11px] text-gray-500">
              La Alcaldía aún define si el avance es del año o acumulado: el valor queda guardado tal como lo reportas.
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-gray-600">¿Qué se hizo?</span>
          <textarea
            id="pdm-texto"
            value={texto}
            disabled={enviando}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            maxLength={MAX_TEXTO_REPORTE}
            className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
          />
        </label>

        {correccion && (
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">{modo === 'responder' ? '¿Cómo respondes a la devolución?' : '¿Qué corriges?'}</span>
            <textarea
              id="pdm-motivo"
              value={motivo}
              disabled={enviando}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              maxLength={MAX_MOTIVO_CORRECCION}
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
            />
          </label>
        )}

        <div>
          <span className="text-xs font-semibold text-gray-600">
            Evidencia <span className="font-normal text-gray-500">(obligatoria · hasta {MAX_EVIDENCIAS} archivos · {TEXTO_TIPOS_EVIDENCIA})</span>
          </span>
          {archivos.length > 0 && (
            <ul className="mt-1.5 space-y-1.5">
              {archivos.map(f => (
                <li key={`${f.name}:${f.size}:${f.lastModified}`} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
                  <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="shrink-0 text-gray-500" />
                  <span className="min-w-0 flex-1 truncate text-gray-800">{f.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-500">{describirTamano(f.size)}</span>
                  {!enviando && (
                    <button
                      onClick={() => setArchivos(a => a.filter(x => x !== f))}
                      className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    >
                      <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta={`Quitar ${f.name}`} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {archivos.length < MAX_EVIDENCIAS && (
            <label className={`mt-1.5 flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-600 transition-colors ${enviando ? 'opacity-60' : 'cursor-pointer hover:border-gray-400'}`}>
              <Icono glifo={Iconos.documentos.subir} tamano="sm" className="shrink-0 text-gray-500" />
              <span className="min-w-0 truncate">{archivos.length === 0 ? 'Adjuntar foto, acta o documento' : 'Adjuntar otro archivo'}</span>
              <input
                ref={entrada}
                id="pdm-evidencia"
                type="file"
                multiple
                disabled={enviando}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="sr-only"
                onChange={e => agregar(e.target.files)}
              />
            </label>
          )}
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p>}

        <div className="flex gap-2">
          {modo === 'corregir' && !enviando && (
            <button
              onClick={() => { setAbierto(false); setError(null) }}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          <button
            id="pdm-enviar"
            onClick={enviar}
            disabled={!listo || enviando}
            className="flex-1 rounded-xl bg-[#192031] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#242F45] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {fase === 'subiendo' ? 'Subiendo archivos…' : fase === 'registrando' ? 'Enviando…' : correccion ? 'Enviar corrección' : 'Enviar reporte'}
          </button>
        </div>
        <p className="text-center text-xs text-gray-500">
          Tu reporte cuenta en el cumplimiento cuando la secretaría lo apruebe.
        </p>
      </div>
    </section>
  )
}
