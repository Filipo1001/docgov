'use client'

/**
 * El formulario con que quien tiene un indicador reporta su avance en un año. Nadie tiene que abrir nada: el
 * año ya empezó y se reporta cuando haya algo que reportar, las veces que haga falta.
 *
 * Cuatro situaciones, según lo último que haya en el año:
 *
 *   nuevo       nadie ha reportado: se reporta.
 *   corregir    el último está esperando validación: se puede corregir (el formulario arranca
 *               cerrado: es la excepción), y la corrección dice qué se corrige.
 *   responder   la secretaría lo devolvió: se responde con un reporte nuevo que dice qué cambió.
 *   aprobado    ya lo validaron: ese avance cuenta. Si el responsable lleva más, reporta un avance
 *               nuevo (el formulario arranca cerrado); no se corrige lo aprobado.
 *
 * Un reporte nunca se reescribe: corregir crea una versión nueva y la anterior queda en el historial.
 * La evidencia es obligatoria, como en la base: sin al menos un archivo el botón no se activa.
 *
 * ── Al corregir, nada de lo que estaba bien se vuelve a subir ────────────
 *
 * El formulario muestra los archivos de la versión anterior. Los que la secretaría no objetó pasan solos a la
 * nueva (se pueden quitar uno a uno); los que devolvió NO se conservan: se reemplazan con uno nuevo o se dejan
 * fuera, y cada uno trae la nota de quien lo devolvió. Entre lo conservado y lo nuevo hay de uno a cinco archivos.
 */

import { useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt, type Indicador } from '@/lib/pdm/plan'
import {
  MAX_EVIDENCIAS, MAX_MOTIVO_CORRECCION, MAX_TEXTO_REPORTE, MIN_TEXTO, TEXTO_TIPOS_EVIDENCIA,
  describirTamano, errorEnArchivos, errorEnReporte, leerNumero,
  type AccionesSeguimiento, type ReporteDetalle,
} from '@/lib/pdm/seguimiento-acciones'
import { ErrorDeSubida, subirArchivo } from '@/lib/pdm/subir'
import { Seccion } from './ui'
import { T } from './tema'

type Fase = 'subiendo' | 'registrando' | null

export default function FormularioReporte({ indicador, vigente, acciones, onHecho }: {
  /** El indicador visto en el año en que se reporta (`indicador.anio`). */
  indicador: Indicador
  /** Lo último que se reportó de este indicador en este año, si ya hay algo. */
  vigente: ReporteDetalle | null
  acciones: AccionesSeguimiento
  /** Se llama con el aviso de lo que pasó, para que quien lo monta recargue. */
  onHecho: (mensaje: string) => void
}) {
  const modo = !vigente ? 'nuevo' : vigente.estado === 'aprobado' ? 'aprobado' : vigente.estado === 'devuelto' ? 'responder' : 'corregir'
  const correccion = modo === 'corregir' || modo === 'responder'
  const anio = indicador.anio

  const [abierto, setAbierto] = useState(modo === 'nuevo' || modo === 'responder')
  const [valor, setValor] = useState(correccion && vigente ? String(vigente.valor).replace('.', ',') : '')
  const [texto, setTexto] = useState(correccion && vigente ? vigente.texto : '')
  const [motivo, setMotivo] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  // Lo de la versión anterior que pasa a esta: por defecto todo lo que la secretaría no devolvió.
  const anteriores = correccion && vigente ? vigente.evidencias : []
  const [conservar, setConservar] = useState<ReadonlySet<string>>(() => new Set(anteriores.filter(a => !a.observacion).map(a => a.id)))
  const [fase, setFase] = useState<Fase>(null)
  const [error, setError] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  if (!abierto) {
    return (
      <Seccion rotulo={`Reporte de ${anio}`}>
        {modo === 'aprobado' && vigente ? (
          <div className={`flex flex-wrap items-center justify-between gap-3 ${T.avisoBien}`}>
            <div>
              <p className="text-sm font-semibold">Último reporte aprobado: {fmt(vigente.valor)}</p>
              <p className="mt-1 text-xs leading-relaxed">Ya cuenta en el cumplimiento. Si llevas más, reporta el nuevo avance.</p>
            </div>
            <button id="pdm-nuevo-avance" onClick={() => setAbierto(true)} className={T.botonSecChico}>Reportar nuevo avance</button>
          </div>
        ) : (
          <div className={`flex flex-wrap items-center justify-between gap-3 ${T.avisoNota}`}>
            <p>¿Hay que corregir lo que reportaste en {anio}?</p>
            <button id="pdm-corregir" onClick={() => setAbierto(true)} className={T.botonSecChico}>Corregir el reporte</button>
          </div>
        )}
      </Seccion>
    )
  }

  const numero = leerNumero(valor)
  const enviando = fase !== null
  const motivoOk = !correccion || motivo.trim().length >= MIN_TEXTO
  // Lo conservado y lo nuevo comparten el tope de cinco y el mínimo de uno.
  const total = conservar.size + archivos.length
  const listo = numero !== null && texto.trim().length >= MIN_TEXTO && total > 0 && motivoOk

  function alternarConservado(id: string) {
    setConservar(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  function agregar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    setError(null)
    const nuevos = [...archivos]
    for (const f of Array.from(lista)) {
      if (conservar.size + nuevos.length >= MAX_EVIDENCIAS) { setError(`Una evidencia admite hasta ${MAX_EVIDENCIAS} archivos, contando los que conservas.`); break }
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
      ?? errorEnArchivos(archivos.map(f => ({ nombre: f.name, tipo: f.type, bytes: f.size })), conservar.size)
    if (mal || numero === null) { setError(mal ?? 'Escribe el valor del avance.'); return }

    // Si todo lo que se envía es lo conservado de la versión anterior, no hay nada que subir.
    let rutas: { ruta: string; tipo: string }[] = []
    if (archivos.length > 0) {
      setFase('subiendo')
      const prep = await acciones.prepararEvidencias({
        indicador: indicador.uuid,
        anio,
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
      rutas = prep.datos
    }

    setFase('registrando')
    const r = await acciones.reportar({
      indicador: indicador.uuid,
      anio,
      valor: numero,
      texto,
      evidencias: archivos.map((f, k) => ({ ruta: rutas[k].ruta, nombre: f.name, tipo: rutas[k].tipo, bytes: f.size })),
      conservar: correccion ? [...conservar] : undefined,
      motivo: correccion ? motivo : undefined,
    })
    setFase(null)
    if (!r.ok) { setError(r.error); setArchivos([]); return }
    setArchivos([])
    setMotivo('')
    onHecho(r.datos.correccion ? 'Corrección enviada. La secretaría la revisará.' : 'Reporte enviado. La secretaría lo revisará.')
  }

  const titulo = modo === 'nuevo' ? `Reportar avance · ${anio}` : modo === 'aprobado' ? `Nuevo avance · ${anio}` : modo === 'responder' ? 'Responder a la devolución' : 'Corregir el reporte'

  return (
    <Seccion rotulo={titulo}>
      {modo === 'responder' && vigente && (
        <p className={`mb-3 text-xs leading-relaxed ${T.avisoMal}`}>
          <b>La secretaría lo devolvió{vigente.validaciones.at(-1)?.validadorNombre ? ` (${vigente.validaciones.at(-1)!.validadorNombre})` : ''}:</b>{' '}
          {vigente.validaciones.at(-1)?.comentario ?? 'sin comentario'}
        </p>
      )}

      <div className="space-y-4">
        <label className="block">
          <span className={T.rotulo}>Valor del avance <span className="font-normal normal-case tracking-normal">({indicador.unidad.toLowerCase()})</span></span>
          <input
            id="pdm-valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={valor}
            disabled={enviando}
            onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, '').slice(0, 14))}
            className={`${T.campo} mt-1.5 tabular-nums`}
          />
          {valor.trim() !== '' && (
            <span className={`mt-1 block text-[11px] ${numero === null ? 'text-[#B42318]' : 'text-[#667085]'}`}>
              {numero === null ? 'No se entiende ese número.' : `Se registrará ${fmt(numero)}`}
            </span>
          )}
          <span className="mt-1 block text-[11px] text-[#667085]">
            Es el avance de {anio}, medido contra su meta{indicador.meta !== null ? ` (${fmt(indicador.meta)})` : ''}.
          </span>
        </label>

        <label className="block">
          <span className={T.rotulo}>¿Qué se hizo?</span>
          <textarea
            id="pdm-texto"
            value={texto}
            disabled={enviando}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            maxLength={MAX_TEXTO_REPORTE}
            className={`${T.campo} mt-1.5 resize-none`}
          />
        </label>

        {correccion && (
          <label className="block">
            <span className={T.rotulo}>{modo === 'responder' ? '¿Cómo respondes a la devolución?' : '¿Qué corriges?'}</span>
            <textarea
              id="pdm-motivo"
              value={motivo}
              disabled={enviando}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              maxLength={MAX_MOTIVO_CORRECCION}
              className={`${T.campo} mt-1.5 resize-none`}
            />
          </label>
        )}

        <div>
          <span className={T.rotulo}>
            Evidencia <span className="font-normal normal-case tracking-normal">· obligatoria · {total} de {MAX_EVIDENCIAS} archivos · {TEXTO_TIPOS_EVIDENCIA}</span>
          </span>

          {anteriores.length > 0 && (
            <div className="mt-1.5">
              <p className="text-xs leading-relaxed text-[#667085]">
                Archivos de la versión anterior: los que estaban bien pasan solos; no hace falta subirlos otra vez.
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {anteriores.map(a => a.observacion ? (
                  <li key={a.id} className="rounded-lg border border-[#F1C0BB] bg-[#FDF3F2] px-3 py-2 text-sm">
                    <p className="flex items-center gap-2">
                      <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="shrink-0 text-[#B42318]" />
                      <span className="min-w-0 flex-1 truncate font-medium text-[#192031]">{a.nombre}</span>
                      <span className="shrink-0 text-xs text-[#912018]">No se conserva</span>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#912018]">
                      Devuelto por {a.observacion.por}: «{a.observacion.motivo}». Reemplázalo con uno nuevo o déjalo fuera.
                    </p>
                  </li>
                ) : (
                  <li key={a.id}>
                    <label className={`flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2 text-sm ${enviando ? 'opacity-60' : 'cursor-pointer'} ${conservar.has(a.id) ? 'border-[#DCE0E8]' : 'border-dashed border-[#C5CBD6]'}`}>
                      <input
                        type="checkbox"
                        checked={conservar.has(a.id)}
                        disabled={enviando}
                        onChange={() => alternarConservado(a.id)}
                        className="h-4 w-4 shrink-0 accent-[#192031]"
                      />
                      <span className={`min-w-0 flex-1 truncate ${conservar.has(a.id) ? 'text-[#192031]' : 'text-[#98A2B3] line-through'}`}>{a.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-[#667085]">{describirTamano(a.bytes)}</span>
                      <span className="shrink-0 text-xs font-medium text-[#556072]">{conservar.has(a.id) ? 'Se conserva' : 'Se quita'}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {archivos.length > 0 && (
            <ul className="mt-1.5 space-y-1.5">
              {archivos.map(f => (
                <li key={`${f.name}:${f.size}:${f.lastModified}`} className="flex items-center gap-2 rounded-lg border border-[#DCE0E8] bg-white px-3 py-2 text-sm">
                  <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="shrink-0 text-[#667085]" />
                  <span className="min-w-0 flex-1 truncate text-[#192031]">{f.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-[#667085]">{describirTamano(f.size)}</span>
                  {!enviando && (
                    <button
                      onClick={() => setArchivos(a => a.filter(x => x !== f))}
                      className="shrink-0 rounded p-1 text-[#667085] transition-colors hover:bg-[#F4F5F8] hover:text-[#192031]"
                    >
                      <Icono glifo={Iconos.accion.cerrar} tamano="sm" etiqueta={`Quitar ${f.name}`} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {total < MAX_EVIDENCIAS && (
            <label className={`mt-1.5 flex items-center gap-3 rounded-lg border border-dashed border-[#AEB6C4] bg-white px-3 py-3 text-sm text-[#556072] transition-colors ${enviando ? 'opacity-60' : 'cursor-pointer hover:border-[#192031] hover:text-[#192031]'}`}>
              <Icono glifo={Iconos.documentos.subir} tamano="sm" className="shrink-0" />
              <span className="min-w-0 truncate">{total === 0 ? 'Adjuntar foto, acta o documento' : 'Adjuntar otro archivo'}</span>
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

        {error && <p role="alert" className={`text-xs font-medium ${T.avisoMal}`}>{error}</p>}

        <div className="flex gap-2">
          {(modo === 'corregir' || modo === 'aprobado') && !enviando && (
            <button onClick={() => { setAbierto(false); setError(null) }} className={T.botonSec}>Cancelar</button>
          )}
          <button id="pdm-enviar" onClick={enviar} disabled={!listo || enviando} className={`${T.boton} flex-1`}>
            {fase === 'subiendo' ? 'Subiendo archivos…' : fase === 'registrando' ? 'Enviando…' : correccion ? 'Enviar corrección' : 'Enviar reporte'}
          </button>
        </div>
        <p className="text-center text-xs text-[#667085]">
          Tu reporte cuenta en el cumplimiento cuando la secretaría lo apruebe.
        </p>
      </div>
    </Seccion>
  )
}
