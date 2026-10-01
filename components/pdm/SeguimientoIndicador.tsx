'use client'

/**
 * Lo que va debajo de las cifras en la ficha de un indicador: la trazabilidad de sus reportes,
 * el formulario para reportar y los comentarios.
 *
 * ── Trazabilidad ─────────────────────────────────────────────────────────
 *
 * Cada versión de cada reporte, de la más reciente a la más antigua: corte, autor, fecha, valor
 * anterior y nuevo, lo que se hizo, las evidencias, y qué dijo la secretaría. Nada se sobrescribe:
 * corregir añade una versión y la anterior queda marcada como tal. Lo que ve cada quien lo decide
 * la base (un responsable ve lo de sus indicadores, una secretaría lo de su dependencia).
 *
 * ── Quién hace qué ───────────────────────────────────────────────────────
 *
 *   · Reportar: quien tiene el indicador a su cargo, en el corte abierto. Ni el administrador ni
 *     Control Interno reportan por otro.
 *   · Validar (aprobar o devolver): el administrador y la secretaría de la dependencia, nunca sobre
 *     un reporte propio. El servidor dice a cada reporte si quien mira puede validarlo.
 *   · Comentar: cualquiera con acceso al módulo.
 */

import { useCallback, useEffect, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt, type Indicador } from '@/lib/pdm/plan'
import { SITUACIONES, type Corte } from '@/lib/pdm/seguimiento'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import type { NivelPdm } from '@/lib/pdm/niveles'
import {
  MAX_COMENTARIO_VALIDACION, describirTamano, errorEnValidacion,
  type AccionesSeguimiento, type DetalleIndicador, type EvidenciaVista, type ReporteDetalle,
} from '@/lib/pdm/seguimiento-acciones'
import FormularioReporte from './FormularioReporte'
import ComentariosIndicador from './ComentariosIndicador'

/** Lo que la ficha necesita saber del seguimiento. Sin esto, la ficha no muestra esta parte. */
export interface ContextoSeguimiento {
  nivel: NivelPdm
  yoId: string
  /** El corte donde hoy se reporta, si hay uno. */
  corteAbierto: Corte | null
  acciones: AccionesSeguimiento
}

/** Quien reporta es quien tiene el indicador a su cargo y no es el administrador ni Control Interno. */
const reportaPorSuCuenta = (nivel: NivelPdm) => nivel === 'responsable' || nivel === 'coordinador'

function abrirVentana(): Window | null {
  const w = window.open('about:blank', '_blank')
  if (w) w.opener = null
  return w
}

function Evidencias({ lista, acciones }: { lista: EvidenciaVista[]; acciones: AccionesSeguimiento }) {
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function abrir(id: string) {
    setError(null)
    setAbriendo(id)
    // La ventana se abre YA, en el clic: si se abriera después de esperar al servidor, el navegador la bloquearía.
    const ventana = abrirVentana()
    const r = await acciones.urlEvidencia(id)
    setAbriendo(null)
    if (!r.ok) { ventana?.close(); setError(r.error); return }
    if (ventana) ventana.location.assign(r.datos.url)
    else window.location.assign(r.datos.url)
  }

  if (lista.length === 0) return null
  return (
    <div className="mt-1.5">
      <ul className="flex flex-wrap gap-1.5">
        {lista.map(e => (
          <li key={e.id}>
            <button
              onClick={() => abrir(e.id)}
              disabled={abriendo !== null}
              className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
            >
              <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="shrink-0 text-gray-500" />
              <span className="truncate">{e.nombre}</span>
              <span className="shrink-0 tabular-nums text-gray-400">{describirTamano(e.bytes)}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  )
}

function Validar({ reporte, acciones, onHecho }: {
  reporte: ReporteDetalle
  acciones: AccionesSeguimiento
  onHecho: () => void
}) {
  const [devolviendo, setDevolviendo] = useState(false)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState<'aprobado' | 'devuelto' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function enviar(estado: 'aprobado' | 'devuelto') {
    if (enviando) return
    const mal = errorEnValidacion(estado, comentario)
    if (mal) { setError(mal); return }
    setEnviando(estado)
    setError(null)
    const r = await acciones.validarReporte({ reporte: reporte.id, estado, comentario: estado === 'devuelto' ? comentario : undefined })
    setEnviando(null)
    if (!r.ok) { setError(r.error); return }
    setDevolviendo(false)
    setComentario('')
    onHecho()
  }

  if (reporte.estado === 'devuelto') return null

  return (
    <div className="mt-2.5">
      {!devolviendo ? (
        <div className="flex flex-wrap gap-2">
          {reporte.estado === 'pendiente' && (
            <button
              id="pdm-aprobar"
              onClick={() => enviar('aprobado')}
              disabled={enviando !== null}
              className="rounded-lg bg-[#192031] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#242F45] disabled:opacity-50"
            >
              {enviando === 'aprobado' ? 'Aprobando…' : 'Aprobar'}
            </button>
          )}
          <button
            id="pdm-devolver"
            onClick={() => { setDevolviendo(true); setError(null) }}
            disabled={enviando !== null}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Devolver…
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">¿Qué falta o qué está mal?</span>
            <textarea
              id="pdm-devolver-comentario"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={2}
              maxLength={MAX_COMENTARIO_VALIDACION}
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { setDevolviendo(false); setComentario(''); setError(null) }}
              disabled={enviando !== null}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              id="pdm-devolver-confirmar"
              onClick={() => enviar('devuelto')}
              disabled={enviando !== null || comentario.trim().length < 10}
              className="rounded-lg bg-red-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando === 'devuelto' ? 'Devolviendo…' : 'Devolver el reporte'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">{error}</p>}
    </div>
  )
}

function Version({ r, acciones, onHecho }: { r: ReporteDetalle; acciones: AccionesSeguimiento; onHecho: () => void }) {
  return (
    <li className={`relative border-l-2 border-gray-200 pb-5 pl-5 last:pb-1 ${r.vigente ? '' : 'opacity-70'}`}>
      <span className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ${r.vigente ? 'bg-[#192031]' : 'bg-gray-300'}`} />
      <p className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{r.corteNombre}</span> · {fechaHoraBogota(r.creado)} · {r.autorNombre}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm font-semibold text-gray-900">
          {fmt(r.valorAnterior)} <span className="text-gray-400">→</span> {fmt(r.valor)}
        </p>
        {r.vigente
          ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SITUACIONES[r.estado].chip}`}>{SITUACIONES[r.estado].rotulo}</span>
          : <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">Versión anterior</span>}
        {r.corrigeA && <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600">Corrección</span>}
      </div>
      {r.motivoCorreccion && <p className="mt-1 text-xs italic text-gray-500">«{r.motivoCorreccion}»</p>}
      <p className="mt-1 whitespace-pre-line text-sm leading-snug text-gray-700">{r.texto}</p>
      <Evidencias lista={r.evidencias} acciones={acciones} />
      {r.validaciones.map((v, k) => (
        <p
          key={k}
          className={`mt-1.5 text-xs leading-snug ${v.estado === 'aprobado' ? 'text-emerald-800' : 'text-red-700'} ${k < r.validaciones.length - 1 ? 'opacity-70' : ''}`}
        >
          <b>{v.estado === 'aprobado' ? 'Aprobado' : 'Devuelto'}</b> por {v.validadorNombre} · {fechaHoraBogota(v.creado)}
          {v.comentario ? `: «${v.comentario}»` : ''}
        </p>
      ))}
      {r.puedeValidar && <Validar reporte={r} acciones={acciones} onHecho={onHecho} />}
    </li>
  )
}

export default function SeguimientoIndicador({ indicador, ctx }: { indicador: Indicador; ctx: ContextoSeguimiento }) {
  const { acciones, corteAbierto, nivel, yoId } = ctx
  const [detalle, setDetalle] = useState<DetalleIndicador | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)

  // Lo que cambia en el servidor (alguien valida, o se reporta) llega aquí como una firma distinta: se vuelve a leer.
  const enCorte = indicador.enCorte
  const firma = `${enCorte?.situacion ?? '-'}:${enCorte?.reporte?.reporteId ?? '-'}:${enCorte?.reporte?.estado ?? '-'}:${indicador.avance ?? '-'}`

  useEffect(() => {
    let cancelado = false
    acciones.detalleIndicador(indicador.uuid).then(r => {
      if (cancelado) return
      if (r.ok) { setDetalle(r.datos); setErrorCarga(null) } else setErrorCarga(r.error)
    }).catch(() => { if (!cancelado) setErrorCarga('No se pudo leer el seguimiento. Intenta de nuevo.') })
    return () => { cancelado = true }
  }, [acciones, indicador.uuid, version, firma])

  const recargar = useCallback((mensaje?: string) => {
    setAviso(mensaje ?? null)
    setVersion(v => v + 1)
  }, [])

  const esDeQuienMira = indicador.asignados.some(a => a.usuarioId === yoId)
  const vigenteEnCorte = corteAbierto && detalle
    ? detalle.reportes.find(r => r.vigente && r.corteId === corteAbierto.id) ?? null
    : null
  const puedeReportar = !!corteAbierto && esDeQuienMira && reportaPorSuCuenta(nivel)

  return (
    <>
      <section>
        <h3 className="text-sm font-bold text-gray-900">Trazabilidad</h3>
        {aviso && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">{aviso}</p>}
        {errorCarga ? (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2.5">
            <p role="alert" className="text-xs font-medium text-red-800">{errorCarga}</p>
            <button
              onClick={() => { setErrorCarga(null); recargar() }}
              className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-800 hover:bg-red-50"
            >
              Reintentar
            </button>
          </div>
        ) : detalle === null ? (
          <p className="mt-2 text-xs text-gray-500">Cargando el seguimiento…</p>
        ) : detalle.reportes.length === 0 ? (
          <ol className="mt-3">
            <li className="relative border-l-2 border-transparent pl-5">
              <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-gray-300" />
              <p className="text-sm font-semibold text-gray-900">Sin seguimiento todavía</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                El primer reporte quedará aquí, con su autor, su fecha y su evidencia.
              </p>
            </li>
          </ol>
        ) : (
          <ol className="mt-3 space-y-0">
            {detalle.reportes.map(r => <Version key={r.id} r={r} acciones={acciones} onHecho={() => recargar()} />)}
          </ol>
        )}
      </section>

      {puedeReportar && corteAbierto && detalle && (
        <FormularioReporte
          // Cada estado del reporte abre un formulario nuevo: el de «responder» no arrastra lo del de «corregir».
          key={`${corteAbierto.id}:${vigenteEnCorte?.id ?? 'nuevo'}:${vigenteEnCorte?.estado ?? ''}`}
          indicador={indicador}
          corte={corteAbierto}
          vigente={vigenteEnCorte}
          acciones={acciones}
          onHecho={recargar}
        />
      )}

      {detalle && (
        <ComentariosIndicador
          indicadorUuid={indicador.uuid}
          comentarios={detalle.comentarios}
          acciones={acciones}
          onHecho={() => recargar()}
        />
      )}
    </>
  )
}
