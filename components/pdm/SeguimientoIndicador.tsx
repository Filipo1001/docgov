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
 *     un reporte propio. El servidor dice a cada reporte si quien mira puede validarlo. Devolver un reporte que ya
 *     estaba APROBADO se llama «reabrirlo» (deja de contar hasta que se corrija y se apruebe de nuevo) y así se dice.
 *   · Reabrir un aprobado es solo del administrador (migración 069): la secretaría aprueba y devuelve lo pendiente.
 *   · Anular y restaurar: solo el administrador (migración 068). Un reporte equivocado que no tiene arreglo deja de contar
 *     y de verse —solo el administrador, Control Interno y quien lo reportó lo siguen viendo, tachado, con quién lo anuló
 *     y por qué; a quien lo reportó se le dice «Tu reporte fue anulado»—.
 *   · Comentar: cualquiera con acceso al módulo.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { fmt, type Indicador } from '@/lib/pdm/plan'
import { anioIniciado } from '@/lib/pdm/seguimiento'
import { serieDelAnio } from '@/lib/pdm/graficos'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import type { NivelPdm } from '@/lib/pdm/niveles'
import { MAX_MOTIVO_ANULACION, MIN_MOTIVO_ANULACION, errorEnAnulacion, type AccionAnulacion } from '@/lib/pdm/anulaciones'
import {
  MAX_COMENTARIO_VALIDACION, MAX_OBSERVACION, describirTamano, errorEnValidacion,
  type AccionesSeguimiento, type DetalleIndicador, type EvidenciaVista, type ReporteDetalle,
} from '@/lib/pdm/seguimiento-acciones'
import FormularioReporte from './FormularioReporte'
import { useAbrirEvidencia } from './abrir-evidencia'
import Huella from './Huella'
import ComentariosIndicador from './ComentariosIndicador'
import EvolucionDelAnio from './EvolucionDelAnio'
import { Sello, Seccion, SituacionTexto } from './ui'
import BotonAccion, { Despliegue, useConfirmar, useNuevos } from './Movimiento'
import { useAvisar } from './Avisos'
import { Bloque } from './Esqueleto'
import { T } from './tema'
import { nombrePropio } from '@/lib/pdm/personas'

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

function Evidencias({ lista, acciones }: { lista: EvidenciaVista[]; acciones: AccionesSeguimiento }) {
  const { abrir, abriendo, error } = useAbrirEvidencia(acciones)
  const [huellas, setHuellas] = useState(false)
  const idHuellas = useId()

  if (lista.length === 0) return null
  return (
    <div className="mt-2">
      <ul className="flex flex-wrap items-start gap-x-2 gap-y-2">
        {lista.map(e => (
          <li key={e.id} className="min-w-0 max-w-full">
            <span className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => abrir(e.id)}
                disabled={abriendo !== null}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-[#192031] transition-colors hover:border-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] disabled:opacity-60 ${e.observacion ? 'border-[#F1C0BB] bg-[#FDF3F2]' : 'border-[#DCE0E8] bg-white'}`}
              >
                <Icono glifo={e.observacion ? Iconos.estado.advertencia : Iconos.documentos.adjunto} tamano="sm" className={`shrink-0 ${e.observacion ? 'text-[#B42318]' : 'text-[#667085]'}`} />
                <span className="truncate">{e.nombre}</span>
                <span className="shrink-0 tabular-nums text-[#667085]">{describirTamano(e.bytes)}</span>
              </button>
              {e.conservada && <Sello>Conservada</Sello>}
            </span>
            {e.observacion && (
              <span className="mt-1 block text-xs leading-snug text-[#912018]">
                <b>Devuelto</b> por {nombrePropio(e.observacion.por)}: «{e.observacion.motivo}»
              </span>
            )}
          </li>
        ))}
      </ul>
      <Despliegue abierto={!!error} separacion="">
        {error ? <p role="alert" className="mt-1 text-xs font-medium text-[#B42318]">{error}</p> : null}
      </Despliegue>
      <button
        type="button"
        onClick={() => setHuellas(v => !v)}
        aria-expanded={huellas}
        aria-controls={idHuellas}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded text-xs font-medium text-[#2D3648] underline decoration-[#C5CBD6] underline-offset-2 transition-colors hover:text-[#192031] hover:decoration-[#192031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031]"
      >
        <Icono glifo={Iconos.documentos.huella} tamano="sm" className="shrink-0 text-[#667085]" />
        {huellas ? 'Ocultar las huellas' : lista.length === 1 ? 'Ver la huella del archivo' : 'Ver las huellas de los archivos'}
      </button>
      <Despliegue abierto={huellas} separacion="pt-1.5">
        <div id={idHuellas}>
          <p className="max-w-prose text-xs leading-snug text-[#667085]">
            La huella identifica el contenido exacto de cada archivo: si cambia un solo bit, cambia la huella. La calculó el servidor
            al subirlo, así que sirve para comprobar, más adelante, que un archivo es el mismo que se reportó.
          </p>
          <ul className="mt-2 space-y-2">
            {lista.map(e => (
              <li key={e.id} className="min-w-0">
                <span className="block truncate text-xs font-medium text-[#192031]" title={e.nombre}>{e.nombre}</span>
                <Huella sha256={e.sha256} calculadaEn={e.huellaCalculadaEn} />
              </li>
            ))}
          </ul>
        </div>
      </Despliegue>
    </div>
  )
}

function Validar({ reporte, acciones, onHecho }: {
  reporte: ReporteDetalle
  acciones: AccionesSeguimiento
  /** Se llama con lo que pasó, dicho a una persona, para que quien monta recargue y lo avise. */
  onHecho: (mensaje: string) => void
}) {
  const [devolviendo, setDevolviendo] = useState(false)
  const [comentario, setComentario] = useState('')
  // Los archivos que se devuelven: id → qué les pasa. El reporte vuelve completo; lo que no se marca pasa solo a la nueva versión.
  const [marcados, setMarcados] = useState<Record<string, string>>({})
  const { fase, correr, ocupado } = useConfirmar()
  // Cuál de los dos botones está trabajando (el otro solo se apaga).
  const [cual, setCual] = useState<'aprobado' | 'devuelto' | null>(null)
  const enviando = ocupado ? cual : null
  const [error, setError] = useState<string | null>(null)
  // Sobre un reporte ya aprobado, devolver es REABRIRLO: lo aprobado deja de contar hasta que se corrija y se apruebe otra vez.
  const reabriendo = reporte.estado === 'aprobado'

  const observaciones = Object.entries(marcados).map(([evidencia, motivo]) => ({ evidencia, motivo }))
  const notasListas = observaciones.every(o => o.motivo.trim() !== '')

  function marcar(id: string) {
    setMarcados(m => { const n = { ...m }; if (id in n) delete n[id]; else n[id] = ''; return n })
  }

  async function enviar(estado: 'aprobado' | 'devuelto') {
    if (ocupado) return
    const mal = errorEnValidacion(estado, comentario, estado === 'devuelto' ? observaciones : undefined)
    if (mal) { setError(mal); return }
    setCual(estado)
    setError(null)
    await correr(
      () => acciones.validarReporte({
        reporte: reporte.id, estado,
        comentario: estado === 'devuelto' ? comentario : undefined,
        observaciones: estado === 'devuelto' && observaciones.length > 0 ? observaciones : undefined,
      }),
      {
        alTerminar: () => {
          setDevolviendo(false); setComentario(''); setMarcados({})
          onHecho(
            estado === 'aprobado' ? 'Reporte aprobado. Ya cuenta en el cumplimiento.'
              : reabriendo ? 'Reporte reabierto. Dejó de contar hasta que se corrija y se apruebe de nuevo.'
              : 'Reporte devuelto. Quien lo reportó verá el motivo.',
          )
        },
        alFallar: setError,
        // Al recargar, este bloque desaparece (el reporte ya no se puede validar): hasta entonces no vuelve a decir «Aprobar».
        quedarseHecho: true,
      },
    )
  }

  if (reporte.estado === 'devuelto') return null

  return (
    <div className="mt-3">
      {!devolviendo ? (
        <div className="flex flex-wrap gap-2">
          {reporte.estado === 'pendiente' && (
            <BotonAccion
              id="pdm-aprobar"
              chico
              fase={cual === 'aprobado' ? fase : 'reposo'}
              inhabilitado={ocupado}
              onClick={() => enviar('aprobado')}
              etiquetas={{ reposo: 'Aprobar', trabajando: 'Aprobando', hecho: 'Aprobado' }}
            />
          )}
          <button
            id="pdm-devolver"
            onClick={() => { setDevolviendo(true); setError(null) }}
            disabled={ocupado}
            className={T.accionSecundariaChica}
          >
            {reabriendo ? 'Reabrir…' : 'Devolver…'}
          </button>
        </div>
      ) : (
        <div className="pdm-entra space-y-2">
          {reabriendo && (
            <p className="text-xs leading-relaxed text-[#667085]">
              El reporte vuelve a quedar devuelto: deja de contar en el cumplimiento hasta que quien lo reportó lo corrija y se apruebe de nuevo.
              Queda anotado aquí.
            </p>
          )}
          <label className="block">
            <span className={T.rotulo}>{reabriendo ? '¿Por qué lo reabres?' : '¿Qué falta o qué está mal?'}</span>
            <textarea
              id="pdm-devolver-comentario"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={2}
              maxLength={MAX_COMENTARIO_VALIDACION}
              className={`${T.campo} mt-1.5 resize-none`}
            />
          </label>

          {reporte.evidencias.length > 0 && (
            <div>
              <span className={T.rotulo}>¿Algún archivo tiene problema? <span className="font-normal normal-case tracking-normal">· opcional</span></span>
              <p className="mt-1 text-xs leading-relaxed text-[#667085]">
                El reporte se devuelve completo. Los archivos que no marques pasan solos a la nueva versión; los que marques, no.
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {reporte.evidencias.map(ev => {
                  const marcado = ev.id in marcados
                  return (
                    <li key={ev.id} className={`rounded-lg border px-3 py-2 ${marcado ? 'border-[#F1C0BB] bg-[#FDF3F2]' : 'border-[#DCE0E8] bg-white'}`}>
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                        <input type="checkbox" checked={marcado} disabled={enviando !== null} onChange={() => marcar(ev.id)} className="h-4 w-4 shrink-0 accent-[#B42318]" />
                        <span className="min-w-0 flex-1 truncate text-[#192031]">{ev.nombre}</span>
                        <span className="shrink-0 text-xs tabular-nums text-[#667085]">{describirTamano(ev.bytes)}</span>
                      </label>
                      {marcado && (
                        <div className="pdm-entra mt-2 space-y-1.5 pl-6">
                          <input
                            type="text"
                            value={marcados[ev.id]}
                            maxLength={MAX_OBSERVACION}
                            disabled={enviando !== null}
                            onChange={e => setMarcados(m => ({ ...m, [ev.id]: e.target.value }))}
                            placeholder="¿Qué le pasa a este archivo?"
                            aria-label={`Qué le pasa a ${ev.nombre}`}
                            className={T.campo}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {['No abre', 'Ilegible', 'No corresponde al indicador', 'Falta la firma', 'Está en blanco'].map(m => (
                              <button
                                key={m}
                                type="button"
                                disabled={enviando !== null}
                                onClick={() => setMarcados(prev => ({ ...prev, [ev.id]: m }))}
                                className="rounded-md border border-[#C5CBD6] bg-white px-2 py-1 text-[11px] font-medium text-[#556072] transition-colors hover:border-[#192031] hover:text-[#192031] disabled:opacity-60"
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setDevolviendo(false); setComentario(''); setMarcados({}); setError(null) }}
              disabled={ocupado}
              className={T.accionSecundariaChica}
            >
              Cancelar
            </button>
            <BotonAccion
              id="pdm-devolver-confirmar"
              chico
              fase={cual === 'devuelto' ? fase : 'reposo'}
              inhabilitado={comentario.trim().length < 10 || !notasListas}
              onClick={() => enviar('devuelto')}
              className="!bg-[#B42318] hover:!bg-[#912018]"
              etiquetas={reabriendo
                ? { reposo: 'Reabrir el reporte', trabajando: 'Reabriendo', hecho: 'Reabierto' }
                : { reposo: 'Devolver el reporte', trabajando: 'Devolviendo', hecho: 'Devuelto' }}
            />
          </div>
        </div>
      )}
      <Despliegue abierto={!!error} separacion="">
        {error ? <p role="alert" className="mt-1.5 text-xs font-medium text-[#B42318]">{error}</p> : null}
      </Despliegue>
    </div>
  )
}

/**
 * Anular un reporte equivocado o restaurar uno anulado. Solo lo ve el administrador (el servidor decide `puedeAnular` y
 * `puedeRestaurar`; la base lo vuelve a decidir). No actúa al primer toque: abre un formulario que dice QUÉ pasa, pide el
 * motivo (obligatorio) y cuenta lo que sucede en el botón.
 */
function Anulacion({ reporte, modo, acciones, onHecho }: {
  reporte: ReporteDetalle
  modo: AccionAnulacion
  acciones: AccionesSeguimiento
  /** Se llama con lo que pasó, dicho a una persona, para que quien monta recargue y lo avise. */
  onHecho: (mensaje: string) => void
}) {
  const anular = modo === 'anular'
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { fase, correr, ocupado } = useConfirmar()
  const campo = useRef<HTMLTextAreaElement>(null)

  async function enviar() {
    if (ocupado) return
    const mal = errorEnAnulacion(motivo, modo)
    if (mal) { setError(mal); campo.current?.focus(); return }
    setError(null)
    await correr(
      () => (anular ? acciones.anularReporte : acciones.restaurarReporte)({ reporte: reporte.id, motivo }),
      {
        alTerminar: ({ versiones }) => {
          setAbierto(false); setMotivo('')
          const juntas = versiones > 1 ? ` Se ${anular ? 'anularon' : 'restauraron'} también sus versiones anteriores.` : ''
          onHecho(anular ? `Reporte anulado. Ya no cuenta.${juntas} Quedó anotado aquí.` : `Reporte restaurado. Vuelve a contar.${juntas} Quedó anotado aquí.`)
        },
        alFallar: setError,
        // Al recargar, este bloque cambia de lugar o desaparece: hasta entonces no vuelve a decir «Anular».
        quedarseHecho: true,
      },
    )
  }

  return (
    // Una regla fina lo separa de aprobar / devolver / reabrir: son cosas distintas y no deben leerse como una sola.
    <div className="mt-4 border-t border-[#DCE0E8] pt-3">
      {!abierto ? (
        <button type="button" onClick={() => { setAbierto(true); setError(null) }} className={T.accionSecundariaChica}>
          {anular ? 'Anular este reporte…' : 'Restaurar este reporte…'}
        </button>
      ) : (
        <div className="pdm-entra space-y-2">
          <p className="text-xs leading-relaxed text-[#667085]">
            {anular
              ? 'El reporte deja de contar y de verse para quien lo reportó y para la secretaría; solo tú y Control Interno lo siguen viendo, tachado. Si es una corrección, se anulan también sus versiones anteriores. El reporte anterior del año vuelve a ser el vigente. Queda anotado aquí y se puede restaurar.'
              : 'El reporte vuelve a contar y a verse como estaba, con sus versiones si las tiene. Queda anotado aquí.'}
          </p>
          <label htmlFor={`${id}-motivo`} className={`${T.rotulo} block`}>{anular ? '¿Por qué lo anulas?' : '¿Por qué lo restauras?'}</label>
          <textarea
            id={`${id}-motivo`}
            ref={campo}
            rows={2}
            value={motivo}
            maxLength={MAX_MOTIVO_ANULACION}
            disabled={ocupado}
            onChange={e => { setMotivo(e.target.value); if (error) setError(null) }}
            placeholder={anular ? 'Por ejemplo: se reportó sobre el indicador equivocado.' : 'Por ejemplo: se anuló por error; el valor era correcto.'}
            aria-describedby={`${id}-ayuda`}
            className={`${T.campo} resize-none`}
          />
          <p id={`${id}-ayuda`} className={`flex justify-between gap-3 text-xs ${T.tenue}`}>
            <span>Obligatorio, al menos {MIN_MOTIVO_ANULACION} caracteres.</span>
            <span aria-hidden className="tabular-nums">{MAX_MOTIVO_ANULACION - motivo.length}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAbierto(false); setMotivo(''); setError(null) }} disabled={ocupado} className={T.accionSecundariaChica}>
              Cancelar
            </button>
            <BotonAccion
              chico
              fase={fase}
              inhabilitado={motivo.trim().length < MIN_MOTIVO_ANULACION}
              onClick={enviar}
              className={anular ? '!bg-[#B42318] hover:!bg-[#912018]' : undefined}
              etiquetas={anular
                ? { reposo: 'Anular el reporte', trabajando: 'Anulando', hecho: 'Anulado' }
                : { reposo: 'Restaurar el reporte', trabajando: 'Restaurando', hecho: 'Restaurado' }}
            />
          </div>
        </div>
      )}
      <Despliegue abierto={!!error} separacion="">
        {error ? <p role="alert" className="mt-1.5 text-xs font-medium text-[#B42318]">{error}</p> : null}
      </Despliegue>
    </div>
  )
}

function Version({ r, acciones, onHecho, nueva, yoId }: {
  r: ReporteDetalle; acciones: AccionesSeguimiento; onHecho: (mensaje: string) => void; nueva: boolean
  /** Quien mira: si el reporte es suyo, la nota de anulación se lo dice a él («Tu reporte fue anulado»). */
  yoId: string
}) {
  const esSuyo = r.autorId !== null && r.autorId === yoId
  // Lo anulado se ve TACHADO (solo lo ven el administrador y Control Interno), sin atenuarlo todo: la nota de quién lo anuló
  // y por qué tiene que leerse con el mismo contraste que el resto.
  const tachado = r.anulado ? 'text-[#667085] line-through decoration-[#98A2B3]' : ''
  return (
    <li className={`relative border-l-2 border-[#DCE0E8] pb-6 pl-5 last:pb-1 ${r.vigente || r.anulado ? '' : 'opacity-70'} ${nueva ? 'pdm-nuevo' : ''}`}>
      <span className={`absolute -left-[6px] top-1 h-2.5 w-2.5 rounded-[2px] ${r.vigente ? 'bg-[#192031]' : 'bg-[#B8BFCC]'}`} />
      <p className="text-xs text-[#667085]">
        <span className="font-semibold text-[#192031]">{fechaHoraBogota(r.creado)}</span> · {nombrePropio(r.autorNombre)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className={`text-sm font-semibold tabular-nums ${tachado || 'text-[#192031]'}`}>
          {fmt(r.valorAnterior)} <span className="font-normal text-[#98A2B3]">→</span> {fmt(r.valor)}
        </p>
        {r.anulado ? <Sello>Anulado</Sello> : r.vigente ? <SituacionTexto situacion={r.estado} /> : <Sello>Versión anterior</Sello>}
        {r.corrigeA && <Sello>Corrección</Sello>}
      </div>
      {r.motivoCorreccion && <p className="mt-1 text-xs italic text-[#667085]">«{r.motivoCorreccion}»</p>}
      <p className={`mt-1.5 whitespace-pre-line text-sm leading-snug ${tachado || 'text-[#2D3648]'}`}>{r.texto}</p>
      <Evidencias lista={r.evidencias} acciones={acciones} />
      {r.validaciones.map((v, k) => (
        <p
          key={k}
          className={`mt-2 text-xs leading-snug ${v.estado === 'aprobado' ? 'text-[#1F5D43]' : 'text-[#912018]'} ${k < r.validaciones.length - 1 ? 'opacity-70' : ''}`}
        >
          <b>{v.estado === 'aprobado' ? 'Aprobado' : v.reabre ? 'Reabierto' : 'Devuelto'}</b> por {nombrePropio(v.validadorNombre)} · {fechaHoraBogota(v.creado)}
          {v.comentario ? `: «${v.comentario}»` : ''}
        </p>
      ))}
      {r.anulaciones.map((a, k) => (
        <p key={`anulacion-${k}`} className={`mt-2 text-xs leading-snug ${a.accion === 'anular' ? 'text-[#912018]' : 'text-[#1F5D43]'}`}>
          <b>{a.accion === 'anular' ? (esSuyo ? 'Tu reporte fue anulado' : 'Anulado') : (esSuyo ? 'Tu reporte fue restaurado' : 'Restaurado')}</b> por {nombrePropio(a.por)} · {fechaHoraBogota(a.cuando)}: «{a.motivo}»
        </p>
      ))}
      {r.puedeValidar && <Validar reporte={r} acciones={acciones} onHecho={onHecho} />}
      {r.puedeAnular && <Anulacion reporte={r} modo="anular" acciones={acciones} onHecho={onHecho} />}
      {r.puedeRestaurar && <Anulacion reporte={r} modo="restaurar" acciones={acciones} onHecho={onHecho} />}
    </li>
  )
}

export default function SeguimientoIndicador({ indicador, ctx }: { indicador: Indicador; ctx: ContextoSeguimiento }) {
  const { acciones, anioActual, nivel, yoId } = ctx
  const [detalle, setDetalle] = useState<DetalleIndicador | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const avisar = useAvisar()

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
    if (mensaje) avisar(mensaje)
    setVersion(v => v + 1)
  }, [avisar])
  // Lo que llega después de la primera lectura (una versión nueva) se ilumina un momento: se ve dónde quedó.
  const nuevas = useNuevos(detalle ? detalle.reportes.map(r => r.id) : null)

  const esDeQuienMira = indicador.asignados.some(a => a.usuarioId === yoId)
  // El detalle trae los reportes de todos los años; aquí se muestra el año que se mira. Vienen del más reciente
  // al más antiguo, así que el primero que no está anulado es lo último que se reportó en él.
  const delAnio = detalle ? detalle.reportes.filter(r => r.anio === indicador.anio) : []
  const ultimoDelAnio = delAnio.find(r => !r.anulado) ?? null
  const reportaria = esDeQuienMira && reportaPorSuCuenta(nivel)
  const puedeReportar = reportaria && anioIniciado(indicador.anio, anioActual)
  // La evolución del año (solo el administrador, por ahora): con dos reportes vigentes o más; con uno no hay evolución que dibujar.
  const serie = nivel === 'admin' && detalle ? serieDelAnio(detalle.reportes, indicador.anio) : []

  return (
    <>
      <Seccion rotulo={`Trazabilidad · ${indicador.anio}`}>
        {errorCarga ? (
          <div className={`flex items-center justify-between gap-3 ${T.avisoMal}`}>
            <p role="alert" className="text-xs font-medium">{errorCarga}</p>
            <button onClick={() => { setErrorCarga(null); recargar() }} className={T.botonSecChico}>Reintentar</button>
          </div>
        ) : detalle === null ? (
          // Con la altura de un seguimiento típico (una versión con su valor, su texto y sus archivos): así lo que hay
          // debajo de esta sección casi no se mueve cuando llega el contenido real.
          <div role="status" aria-busy="true" className="min-h-[9.5rem] space-y-3">
            <span className="sr-only">Cargando el seguimiento…</span>
            <Bloque className="h-3 w-2/5" />
            <Bloque className="h-4 w-1/4" />
            <Bloque className="h-3.5 w-3/4" />
            <Bloque className="h-3.5 w-1/2" />
            <div className="flex gap-2"><Bloque className="h-7 w-32" /><Bloque className="h-7 w-28" /></div>
          </div>
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
          <>
            <EvolucionDelAnio puntos={serie} meta={indicador.meta} anio={indicador.anio} />
            <ol className="space-y-0">
              {delAnio.map(r => <Version key={r.id} r={r} acciones={acciones} onHecho={recargar} nueva={nuevas.has(r.id)} yoId={yoId} />)}
            </ol>
          </>
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
