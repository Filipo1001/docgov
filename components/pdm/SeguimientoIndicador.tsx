'use client'

/**
 * Lo que va debajo de las cifras en la ficha de un indicador: la trazabilidad de sus reportes,
 * el formulario para reportar y los comentarios.
 *
 * ── Trazabilidad ─────────────────────────────────────────────────────────
 *
 * Cada versión de cada reporte del año que se mira, de la más reciente a la más antigua: fecha, autor,
 * valor anterior y nuevo, lo que se hizo, las evidencias, y qué dijo la secretaría. Nada se sobrescribe:
 * corregir añade una versión y la anterior queda marcada como tal. Lo que ve cada quien lo decide
 * la base (un responsable ve lo de sus indicadores, una secretaría lo de su dependencia).
 *
 * ── Quién hace qué ───────────────────────────────────────────────────────
 *
 *   · Reportar: quien tiene el indicador a su cargo, en un año que ya empezó (sin que nadie abra nada).
 *     Ni el administrador ni Control Interno reportan por otro.
 *   · Validar (aprobar o devolver): el administrador y la secretaría de la dependencia, nunca sobre
 *     un reporte propio. El servidor dice a cada reporte si quien mira puede validarlo.
 *   · Comentar: cualquiera con acceso al módulo.
 */

import { useCallback, useEffect, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt, type Indicador } from '@/lib/pdm/plan'
import { anioIniciado } from '@/lib/pdm/seguimiento'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import type { NivelPdm } from '@/lib/pdm/niveles'
import {
  MAX_COMENTARIO_VALIDACION, describirTamano, errorEnValidacion,
  type AccionesSeguimiento, type DetalleIndicador, type EvidenciaVista, type ReporteDetalle,
} from '@/lib/pdm/seguimiento-acciones'
import FormularioReporte from './FormularioReporte'
import ComentariosIndicador from './ComentariosIndicador'
import { Seccion, SituacionTexto } from './ui'
import { T } from './tema'

/** Lo que la ficha necesita saber del seguimiento. Sin esto, la ficha no muestra esta parte. */
export interface ContextoSeguimiento {
  nivel: NivelPdm
  yoId: string
  /** El año calendario (hora de Colombia): de él depende qué años ya se pueden reportar. */
  anioActual: number
  acciones: AccionesSeguimiento
}

/** Quien reporta es quien tiene el indicador a su cargo y no es el administrador ni Control Interno. */
const reportaPorSuCuenta = (nivel: NivelPdm) => nivel === 'responsable' || nivel === 'coordinador'

function abrirVentana(): Window | null {
  const w = window.open('about:blank', '_blank')
  if (w) w.opener = null
  return w
}

/** Un sello pequeño con borde, para marcar una versión («Corrección», «Versión anterior»). */
function Sello({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[4px] border border-[#C5CBD6] bg-white px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.1em] text-[#556072]">
      {children}
    </span>
  )
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
    <div className="mt-2">
      <ul className="flex flex-wrap gap-1.5">
        {lista.map(e => (
          <li key={e.id}>
            <button
              onClick={() => abrir(e.id)}
              disabled={abriendo !== null}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[#DCE0E8] bg-white px-2.5 py-1 text-xs font-medium text-[#192031] transition-colors hover:border-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] disabled:opacity-60"
            >
              <Icono glifo={Iconos.documentos.adjunto} tamano="sm" className="shrink-0 text-[#667085]" />
              <span className="truncate">{e.nombre}</span>
              <span className="shrink-0 tabular-nums text-[#667085]">{describirTamano(e.bytes)}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-[#B42318]">{error}</p>}
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
    <div className="mt-3">
      {!devolviendo ? (
        <div className="flex flex-wrap gap-2">
          {reporte.estado === 'pendiente' && (
            <button id="pdm-aprobar" onClick={() => enviar('aprobado')} disabled={enviando !== null} className={T.botonChico}>
              {enviando === 'aprobado' ? 'Aprobando…' : 'Aprobar'}
            </button>
          )}
          <button
            id="pdm-devolver"
            onClick={() => { setDevolviendo(true); setError(null) }}
            disabled={enviando !== null}
            className={T.botonSecChico}
          >
            Devolver…
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className={T.rotulo}>¿Qué falta o qué está mal?</span>
            <textarea
              id="pdm-devolver-comentario"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={2}
              maxLength={MAX_COMENTARIO_VALIDACION}
              className={`${T.campo} mt-1.5 resize-none`}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { setDevolviendo(false); setComentario(''); setError(null) }}
              disabled={enviando !== null}
              className={T.botonSecChico}
            >
              Cancelar
            </button>
            <button
              id="pdm-devolver-confirmar"
              onClick={() => enviar('devuelto')}
              disabled={enviando !== null || comentario.trim().length < 10}
              className={T.botonPeligro}
            >
              {enviando === 'devuelto' ? 'Devolviendo…' : 'Devolver el reporte'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-[#B42318]">{error}</p>}
    </div>
  )
}

function Version({ r, acciones, onHecho }: { r: ReporteDetalle; acciones: AccionesSeguimiento; onHecho: () => void }) {
  return (
    <li className={`relative border-l-2 border-[#DCE0E8] pb-6 pl-5 last:pb-1 ${r.vigente ? '' : 'opacity-70'}`}>
      <span className={`absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-[2px] ${r.vigente ? 'bg-[#192031]' : 'bg-[#B8BFCC]'}`} />
      <p className="text-xs text-[#667085]">
        <span className="font-semibold text-[#192031]">{fechaHoraBogota(r.creado)}</span> · {r.autorNombre}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold tabular-nums text-[#192031]">
          {fmt(r.valorAnterior)} <span className="font-normal text-[#98A2B3]">→</span> {fmt(r.valor)}
        </p>
        {r.vigente ? <SituacionTexto situacion={r.estado} /> : <Sello>Versión anterior</Sello>}
        {r.corrigeA && <Sello>Corrección</Sello>}
      </div>
      {r.motivoCorreccion && <p className="mt-1 text-xs italic text-[#667085]">«{r.motivoCorreccion}»</p>}
      <p className="mt-1.5 whitespace-pre-line text-sm leading-snug text-[#2D3648]">{r.texto}</p>
      <Evidencias lista={r.evidencias} acciones={acciones} />
      {r.validaciones.map((v, k) => (
        <p
          key={k}
          className={`mt-2 text-xs leading-snug ${v.estado === 'aprobado' ? 'text-[#1F5D43]' : 'text-[#912018]'} ${k < r.validaciones.length - 1 ? 'opacity-70' : ''}`}
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
  const { acciones, anioActual, nivel, yoId } = ctx
  const [detalle, setDetalle] = useState<DetalleIndicador | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)

  // Lo que cambia en el servidor (alguien valida, o se reporta) llega aquí como una firma distinta: se vuelve a leer.
  const enAnio = indicador.enAnio
  const firma = `${enAnio?.situacion ?? '-'}:${enAnio?.reporte?.reporteId ?? '-'}:${enAnio?.reporte?.estado ?? '-'}:${indicador.avance ?? '-'}`

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
  // El detalle trae los reportes de todos los años; aquí se muestra el año que se mira. Vienen del más reciente
  // al más antiguo, así que el primero es lo último que se reportó en él.
  const delAnio = detalle ? detalle.reportes.filter(r => r.anio === indicador.anio) : []
  const ultimoDelAnio = delAnio[0] ?? null
  const reportaria = esDeQuienMira && reportaPorSuCuenta(nivel)
  const puedeReportar = reportaria && anioIniciado(indicador.anio, anioActual)

  return (
    <>
      <Seccion rotulo={`Trazabilidad · ${indicador.anio}`}>
        {aviso && <p role="status" className={`mb-3 ${T.avisoBien} text-xs font-medium`}>{aviso}</p>}
        {errorCarga ? (
          <div className={`flex items-center justify-between gap-3 ${T.avisoMal}`}>
            <p role="alert" className="text-xs font-medium">{errorCarga}</p>
            <button onClick={() => { setErrorCarga(null); recargar() }} className={T.botonSecChico}>Reintentar</button>
          </div>
        ) : detalle === null ? (
          <p className="text-xs text-[#667085]">Cargando el seguimiento…</p>
        ) : delAnio.length === 0 ? (
          <ol>
            <li className="relative border-l-2 border-transparent pl-5">
              <span className="absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-[2px] bg-[#B8BFCC]" />
              <p className="text-sm font-semibold text-[#192031]">Sin reportes en {indicador.anio}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#667085]">
                El primer reporte quedará aquí, con su autor, su fecha y su evidencia.
              </p>
            </li>
          </ol>
        ) : (
          <ol className="space-y-0">
            {delAnio.map(r => <Version key={r.id} r={r} acciones={acciones} onHecho={() => recargar()} />)}
          </ol>
        )}
      </Seccion>

      {puedeReportar && detalle && (
        <FormularioReporte
          // Cada estado del reporte abre un formulario nuevo: el de «responder» no arrastra lo del de «corregir».
          key={`${indicador.anio}:${ultimoDelAnio?.id ?? 'nuevo'}:${ultimoDelAnio?.estado ?? ''}`}
          indicador={indicador}
          vigente={ultimoDelAnio}
          acciones={acciones}
          onHecho={recargar}
        />
      )}
      {reportaria && !puedeReportar && (
        <Seccion rotulo={`Reporte de ${indicador.anio}`}>
          <p className={T.avisoNota}>El {indicador.anio} empieza el 1 de enero: todavía no se puede reportar.</p>
        </Seccion>
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
