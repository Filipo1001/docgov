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

import { useEffect, useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt, type Indicador } from '@/lib/pdm/plan'
import {
  MAX_EVIDENCIAS, MAX_MOTIVO_CORRECCION, MAX_TEXTO_REPORTE, MIN_TEXTO,
  describirTamano, errorEnArchivos, errorEnReporte, leerNumero,
  type AccionesSeguimiento, type ReporteDetalle,
} from '@/lib/pdm/seguimiento-acciones'
import { clasificarSeleccion, entradaNueva, esImagenDibujable, mensajeDeFallos, resumenDeSubida, type ArchivoEnCola, type Rechazo } from '@/lib/pdm/evidencias-cola'
import { subirArchivo } from '@/lib/pdm/subir'
import { subirCola } from '@/lib/pdm/subir-cola'
import { Seccion } from './ui'
import BotonAccion, { Despliegue, useConfirmar } from './Movimiento'
import ZonaEvidencias from './ZonaEvidencias'
import { T } from './tema'

/** El borde rojo de un campo al que le falta algo. `!` porque el campo ya trae su borde gris. */
const CAMPO_MAL = '!border-[#B42318] focus:!ring-[#B42318]'

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
  // Lo que se va a subir: cada archivo con su estado y su avance. Se conserva aunque falle algo, para no volver a elegirlos.
  const [cola, setCola] = useState<ArchivoEnCola<File>[]>([])
  const [avisos, setAvisos] = useState<Rechazo[]>([])
  // Dónde quedó en el almacenamiento cada archivo ya subido (por su clave): lo que se registra y lo que no se repite al reintentar.
  const subidas = useRef(new Map<string, { ruta: string; tipo: string }>())
  // Lo que se conserva de la versión anterior: por defecto todo lo que la secretaría no devolvió.
  const anteriores = correccion && vigente ? vigente.evidencias : []
  const [conservar, setConservar] = useState<ReadonlySet<string>>(() => new Set(anteriores.filter(a => !a.observacion).map(a => a.id)))
  // El botón cuenta lo que pasa: subiendo (con cuántos archivos y qué tanto) → registrando → enviado.
  const { fase, correr, ocupado: enviando } = useConfirmar()
  const [etapa, setEtapa] = useState<'subiendo' | 'registrando'>('subiendo')
  const [error, setError] = useState<string | null>(null)
  // Tras el primer intento de enviar con algo incompleto, cada campo dice lo que le falta (antes no: no se riñe a quien aún escribe).
  const [intento, setIntento] = useState(false)

  // Las direcciones temporales de las vistas previas de las fotos: se crean al elegir y se liberan al quitar o al cerrar.
  const vistas = useRef(new Set<string>())
  useEffect(() => {
    const creadas = vistas.current
    return () => { creadas.forEach(u => URL.revokeObjectURL(u)); creadas.clear() }
  }, [])

  // Mientras se sube, cerrar la pestaña perdería el envío: el navegador pregunta antes.
  useEffect(() => {
    if (!enviando) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [enviando])

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
  // Lo conservado y lo nuevo comparten el tope de cinco y el mínimo de uno.
  const total = conservar.size + cola.length
  const resumen = resumenDeSubida(cola)

  // Lo que falta, campo por campo. Se calcula siempre; se MUESTRA después del primer intento de enviar.
  const faltas = {
    valor: numero !== null ? null : valor.trim() === '' ? 'Escribe el valor del avance.' : 'No se entiende ese número.',
    texto: texto.trim().length >= MIN_TEXTO ? null : `Cuenta qué se hizo (al menos ${MIN_TEXTO} caracteres).`,
    motivo: !correccion || motivo.trim().length >= MIN_TEXTO ? null : `${modo === 'responder' ? 'Di cómo respondes' : 'Di qué corriges'} (al menos ${MIN_TEXTO} caracteres).`,
    evidencia: total > 0 ? null : 'Adjunta al menos una evidencia.',
  }
  const ver = (k: keyof typeof faltas) => (intento ? faltas[k] : null)
  const primeraFalta = (['valor', 'texto', 'motivo', 'evidencia'] as const).find(k => faltas[k])

  function alternarConservado(id: string) {
    setConservar(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  function agregar(lista: File[], carpetas: string[] = []) {
    if (enviando) return
    setError(null)
    const sel = clasificarSeleccion(cola.map(c => c.archivo), conservar.size, lista)
    // De cada archivo que no sirve se dice cuál es y por qué; los que sí sirven se adjuntan igual.
    setAvisos([...carpetas.map(nombre => ({ nombre, motivo: 'Es una carpeta: adjunta los archivos que contiene, no la carpeta.' })), ...sel.rechazados])
    if (sel.aceptados.length > 0) {
      const entradas = sel.aceptados.map(f => {
        const e = entradaNueva(f)
        if (esImagenDibujable(f)) { e.vista = URL.createObjectURL(f); vistas.current.add(e.vista) }
        return e
      })
      setCola(a => [...a, ...entradas])
    }
  }

  function quitar(clave: string) {
    if (enviando) return
    subidas.current.delete(clave)
    const vista = cola.find(c => c.clave === clave)?.vista
    if (vista) { URL.revokeObjectURL(vista); vistas.current.delete(vista) }
    setCola(a => a.filter(c => c.clave !== clave))
  }

  async function enviar() {
    if (enviando) return
    setError(null)
    if (primeraFalta) {
      // Se dice qué falta en su propio campo y se lleva el cursor a él; el botón nunca está «apagado» sin explicar por qué.
      setIntento(true)
      document.getElementById({ valor: 'pdm-valor', texto: 'pdm-texto', motivo: 'pdm-motivo', evidencia: 'pdm-evidencia' }[primeraFalta])?.focus()
      return
    }
    const mal = errorEnReporte({ valor: numero, texto, motivo }, correccion)
      ?? errorEnArchivos(cola.map(c => ({ nombre: c.archivo.name, tipo: c.archivo.type, bytes: c.archivo.size })), conservar.size)
    if (mal || numero === null) { setError(mal ?? 'Escribe el valor del avance.'); return }

    await correr(async () => {
      // Solo se sube lo que no está ya subido: tras un fallo parcial, se reintentan únicamente los que fallaron.
      const pendientes = cola.filter(c => !subidas.current.has(c.clave))
      if (pendientes.length > 0) {
        setEtapa('subiendo')
        const prep = await acciones.prepararEvidencias({
          indicador: indicador.uuid,
          anio,
          archivos: pendientes.map(c => ({ nombre: c.archivo.name, tipo: c.archivo.type, bytes: c.archivo.size })),
        })
        if (!prep.ok) return prep
        if (prep.datos.length !== pendientes.length) return { ok: false as const, error: 'No se pudo preparar la subida. Intenta de nuevo.' }
        const destino = new Map(pendientes.map((c, k) => [c.clave, prep.datos[k]]))

        // Hasta tres a la vez, cada uno por su cuenta: un archivo que falla no tumba a los demás.
        const resultados = await subirCola(
          pendientes,
          async (c, alProgreso) => {
            const d = destino.get(c.clave)!
            await subirArchivo(d.urlSubida, c.archivo, d.tipo, { alProgreso })
            subidas.current.set(c.clave, { ruta: d.ruta, tipo: d.tipo })
          },
          {
            alCambio: (clave, cambio) => setCola(actual => actual.map(c => {
              if (c.clave !== clave) return c
              if (cambio.estado === 'error') return { ...c, estado: 'error', error: cambio.error }
              return { ...c, estado: cambio.estado, progreso: cambio.progreso, error: undefined }
            })),
          },
        )
        const fallidos = pendientes.flatMap(c => {
          const r = resultados.get(c.clave)
          return r && !r.ok ? [{ ...c, estado: 'error' as const, error: r.error }] : []
        })
        if (fallidos.length > 0) return { ok: false as const, error: mensajeDeFallos(fallidos) }
      }

      setEtapa('registrando')
      const r = await acciones.reportar({
        indicador: indicador.uuid,
        anio,
        valor: numero,
        texto,
        evidencias: cola.map(c => {
          const s = subidas.current.get(c.clave)!
          return { ruta: s.ruta, nombre: c.archivo.name, tipo: s.tipo, bytes: c.archivo.size }
        }),
        conservar: correccion ? [...conservar] : undefined,
        motivo: correccion ? motivo : undefined,
      })
      if (!r.ok) {
        // El servidor puede haber retirado lo recién subido: la próxima vez se vuelve a subir, pero NO hay que volver a
        // elegir los archivos (antes se vaciaba la lista y se perdía todo el trabajo).
        subidas.current.clear()
        setCola(a => a.map(c => ({ ...c, estado: 'listo', progreso: 0, error: undefined })))
      }
      return r
    }, {
      alTerminar: datos => {
        vistas.current.forEach(u => URL.revokeObjectURL(u))
        vistas.current.clear()
        setCola([])
        subidas.current.clear()
        setMotivo('')
        onHecho(datos.correccion ? 'Corrección enviada. La secretaría la revisará.' : 'Reporte enviado. La secretaría lo revisará.')
      },
      alFallar: setError,
      // El formulario lo reemplaza la pantalla al recargar el detalle: hasta entonces no vuelve a decir «Enviar».
      quedarseHecho: true,
    })
  }

  const titulo = modo === 'nuevo' ? `Reportar avance · ${anio}` : modo === 'aprobado' ? `Nuevo avance · ${anio}` : modo === 'responder' ? 'Responder a la devolución' : 'Corregir el reporte'
  const hayFallidos = cola.some(c => c.estado === 'error')

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
            aria-invalid={ver('valor') ? true : undefined}
            aria-describedby={ver('valor') ? 'pdm-valor-error' : undefined}
            onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, '').slice(0, 14))}
            className={`${T.campo} mt-1.5 tabular-nums ${ver('valor') ? CAMPO_MAL : ''}`}
          />
          {ver('valor') ? (
            <span id="pdm-valor-error" role="alert" className="mt-1 block text-[11px] font-medium text-[#B42318]">{ver('valor')}</span>
          ) : valor.trim() !== '' && (
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
            aria-invalid={ver('texto') ? true : undefined}
            aria-describedby={ver('texto') ? 'pdm-texto-error' : undefined}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            maxLength={MAX_TEXTO_REPORTE}
            className={`${T.campo} mt-1.5 resize-none ${ver('texto') ? CAMPO_MAL : ''}`}
          />
          {ver('texto') && <span id="pdm-texto-error" role="alert" className="mt-1 block text-[11px] font-medium text-[#B42318]">{ver('texto')}</span>}
        </label>

        {correccion && (
          <label className="block">
            <span className={T.rotulo}>{modo === 'responder' ? '¿Cómo respondes a la devolución?' : '¿Qué corriges?'}</span>
            <textarea
              id="pdm-motivo"
              value={motivo}
              disabled={enviando}
              aria-invalid={ver('motivo') ? true : undefined}
              aria-describedby={ver('motivo') ? 'pdm-motivo-error' : undefined}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              maxLength={MAX_MOTIVO_CORRECCION}
              className={`${T.campo} mt-1.5 resize-none ${ver('motivo') ? CAMPO_MAL : ''}`}
            />
            {ver('motivo') && <span id="pdm-motivo-error" role="alert" className="mt-1 block text-[11px] font-medium text-[#B42318]">{ver('motivo')}</span>}
          </label>
        )}

        <div>
          <span className={`${T.rotulo} mb-1.5 block`}>
            Evidencia <span className="font-normal normal-case tracking-normal">· obligatoria · {total} de {MAX_EVIDENCIAS} archivos</span>
          </span>

          {anteriores.length > 0 && (
            <div className="mb-3">
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

          <ZonaEvidencias
            cola={cola}
            conservadas={conservar.size}
            bloqueada={enviando}
            error={ver('evidencia')}
            avisos={avisos}
            onAgregar={agregar}
            onQuitar={quitar}
            onLimpiarAvisos={() => setAvisos([])}
          />
        </div>

        <Despliegue abierto={!!error} separacion="">
          {error ? <p role="alert" className={`[overflow-wrap:anywhere] text-xs font-medium ${T.avisoMal}`}>{error}</p> : null}
        </Despliegue>

        <div className="flex gap-2">
          {(modo === 'corregir' || modo === 'aprobado') && (
            <button onClick={() => { setAbierto(false); setError(null) }} disabled={enviando} className={T.accionSecundaria}>Cancelar</button>
          )}
          <BotonAccion
            id="pdm-enviar"
            fase={fase}
            onClick={enviar}
            className="flex-1"
            etiquetas={{
              reposo: hayFallidos ? 'Reintentar' : correccion ? 'Enviar corrección' : 'Enviar reporte',
              trabajando: (
                <span key={etapa} className="pdm-velo-entra tabular-nums">
                  {etapa === 'subiendo'
                    ? `${resumen.total === 1 ? 'Subiendo el archivo' : `Subiendo ${Math.min(resumen.total, resumen.subidos + 1)} de ${resumen.total}`} · ${resumen.porcentaje} %`
                    : 'Registrando'}
                </span>
              ),
              hecho: correccion ? 'Corrección enviada' : 'Reporte enviado',
            }}
          />
        </div>
        <p className="text-center text-xs text-[#667085]">
          Tu reporte cuenta en el cumplimiento cuando la secretaría lo apruebe.
        </p>
      </div>
    </Seccion>
  )
}
