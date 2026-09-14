'use client'

/**
 * El detalle del periodo, detrás de un clic.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * La cabecera acumulaba datos porque no había otro sitio donde ponerlos:
 * rango de fechas, «Actividades registradas: 11 | Total acciones: 11» —dos
 * números que en el 79 % de los periodos son el MISMO— y poco más. Mientras
 * tanto, lo que de verdad decide una revisión no estaba en ninguna parte:
 * qué obligaciones llegaron sin sustento, cuántas veces se ha devuelto esto,
 * en qué punto del contrato estamos.
 *
 * Así que la cabecera se queda con lo que identifica (contrato, mes, quién) y
 * lo que se mira primero (estado y valor), y todo lo demás vive aquí. Mismo
 * principio que la nota de supervisión y la traza: disponible a un clic,
 * callado en reposo.
 *
 * ── Solo para quien revisa ───────────────────────────────────────────────
 *
 * Asesor, supervisor y administrador. La contratista no lo ve: el contenido
 * está redactado para decidir sobre un informe ajeno —«3 obligaciones sin
 * evidencia», «devuelto 2 veces»— y esa lectura no es la suya.
 */

import { useEffect } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import Badge from '@/components/ui/Badge'
import { ESTADO_LABEL } from '@/lib/constants'
import type { Contrato, Periodo, Obligacion, Actividad, EstadoPeriodo } from '@/lib/types'

export interface HermanoResumen {
  id: string
  numero_periodo: number
  estado?: EstadoPeriodo
  valor_cobro?: number | null
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  asesor: 'Asesor',
  contratista: 'Contratista',
  contratacion: 'Contratación',
}

function accionDe(anterior: EstadoPeriodo | null, nuevo: EstadoPeriodo | null): string {
  switch (nuevo) {
    case 'borrador':  return 'Devuelto a borrador'
    // Un `enviado` que viene de revisión no es un envío: es la secretaría
    // devolviéndolo a los asesores.
    case 'enviado':   return anterior === 'revision' || anterior === 'enviado'
      ? 'Devuelto a los asesores' : 'Enviado a revisión'
    case 'revision':  return 'Revisado por el asesor'
    case 'aprobado':  return 'Aprobado'
    case 'rechazado': return 'Devuelto para corrección'
    case 'radicado':  return 'Radicado'
    default:          return 'Actualizado'
  }
}

function fechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

const pesos = (n: number | null | undefined) => `$${(n ?? 0).toLocaleString('es-CO')}`

/** Una fila de datos. Etiqueta a la izquierda, valor a la derecha, sin adornos. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-gray-400 shrink-0">{etiqueta}</span>
      <span className="text-xs text-gray-800 text-right min-w-0 break-words">{children}</span>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="pt-4 mt-4 border-t border-gray-100 first:pt-0 first:mt-0 first:border-t-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{titulo}</h4>
      {children}
    </section>
  )
}

export default function DetallePeriodo({
  abierto,
  onCerrar,
  contrato,
  periodo,
  obligaciones,
  actividades,
  hermanos,
}: {
  abierto: boolean
  onCerrar: () => void
  contrato: Contrato
  periodo: Periodo
  obligaciones: Obligacion[]
  actividades: Actividad[]
  hermanos: HermanoResumen[]
}) {
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', cerrar)
    return () => document.removeEventListener('keydown', cerrar)
  }, [abierto, onCerrar])

  if (!abierto) return null

  // ── Cobertura por obligación ───────────────────────────────────────────
  // La pregunta útil no es «cuál tiene más actividades» —unas obligaciones son
  // naturalmente más voluminosas que otras— sino «¿llegó todo sustentado?».
  // En producción, el 28,5 % de los informes enviados trae al menos una
  // obligación SIN NINGUNA actividad, y el 72,9 % al menos una con actividad
  // pero sin una sola evidencia. Hoy eso solo se descubre abriendo el acordeón
  // obligación por obligación.
  const cobertura = obligaciones.map((obl, i) => {
    const acts = actividades.filter(a => a.obligacion_id === obl.id)
    const evid = acts.reduce((s, a) => s + (a.evidencias?.length ?? 0), 0)
    return { numero: i + 1, descripcion: obl.descripcion, acts: acts.length, evid }
  })
  const maxActs = Math.max(1, ...cobertura.map(c => c.acts))
  const sinActividad = cobertura.filter(c => c.acts === 0).length
  const sinEvidencia = cobertura.filter(c => c.acts > 0 && c.evid === 0).length

  // ── Historia ───────────────────────────────────────────────────────────
  const historial = periodo.historial ?? []
  const devoluciones = historial.filter(h =>
    h.estado_nuevo === 'rechazado' || (h.estado_nuevo === 'enviado' && (h.estado_anterior === 'revision' || h.estado_anterior === 'enviado'))
  ).length

  // ── El contrato en contexto ────────────────────────────────────────────
  const cerrados = hermanos.filter(h => h.estado === 'aprobado' || h.estado === 'radicado')
  const ejecutado = cerrados.reduce((s, h) => s + (h.valor_cobro ?? 0), 0)
  const pctEjecutado = contrato.valor_total ? Math.min(100, Math.round((ejecutado / contrato.valor_total) * 100)) : 0

  const totalActividades = actividades.length
  const totalAcciones = actividades.reduce((s, a) => s + (a.cantidad || 1), 0)

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del periodo ${periodo.mes} ${periodo.anio}`}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Detalle del periodo</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {periodo.mes} {periodo.anio} · Contrato N.° {contrato.numero}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          >
            <Icono glifo={Iconos.accion.cerrar} tamano="md" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">

          <Seccion titulo="Identificación">
            <Dato etiqueta="Periodo">
              {periodo.numero_periodo} de {hermanos.length || '—'}
            </Dato>
            <Dato etiqueta="Fechas">Del {periodo.fecha_inicio} al {periodo.fecha_fin}</Dato>
            <Dato etiqueta="Estado">
              <Badge variant={periodo.estado === 'rechazado' ? 'red' : periodo.estado === 'aprobado' || periodo.estado === 'radicado' ? 'green' : 'gray'} size="xs">
                {ESTADO_LABEL[periodo.estado] ?? periodo.estado}
              </Badge>
            </Dato>
            <Dato etiqueta="Valor del periodo">{pesos(periodo.valor_cobro)}</Dato>
            <Dato etiqueta="Contratista">{contrato.contratista?.nombre_completo ?? '—'}</Dato>
            <Dato etiqueta="Cédula">{contrato.contratista?.cedula ?? '—'}</Dato>
            {contrato.contratista?.cargo && <Dato etiqueta="Cargo">{contrato.contratista.cargo}</Dato>}
            {contrato.dependencia?.nombre && <Dato etiqueta="Dependencia">{contrato.dependencia.nombre}</Dato>}
            <Dato etiqueta="Supervisor">{contrato.supervisor?.nombre_completo ?? '—'}</Dato>
          </Seccion>

          <Seccion titulo="Cobertura de las obligaciones">
            {(sinActividad > 0 || sinEvidencia > 0) && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  {sinActividad > 0 && (
                    <>
                      <strong>{sinActividad}</strong> {sinActividad === 1 ? 'obligación no tiene ninguna actividad' : 'obligaciones no tienen ninguna actividad'}
                      {sinEvidencia > 0 ? '. ' : '.'}
                    </>
                  )}
                  {sinEvidencia > 0 && (
                    <>
                      <strong>{sinEvidencia}</strong> {sinEvidencia === 1 ? 'tiene actividades pero ninguna evidencia' : 'tienen actividades pero ninguna evidencia'}.
                    </>
                  )}
                </p>
              </div>
            )}
            <div className="space-y-2">
              {cobertura.map(c => (
                <div key={c.numero}>
                  <div className="flex items-baseline justify-between gap-3">
                    {/* Dos líneas, no una. Con `truncate` a 320 px la
                        obligación quedaba en «1. Apoyar la formulac…», que no
                        dice nada: el texto de una obligación contractual es
                        largo por naturaleza. El `title` sigue dando el texto
                        completo con el puntero. */}
                    <p className="text-[11px] text-gray-600 min-w-0 line-clamp-2" title={c.descripcion}>
                      <span className="text-gray-400 mr-1">{c.numero}.</span>{c.descripcion}
                    </p>
                    <span className={`text-[11px] shrink-0 tabular-nums ${c.acts === 0 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
                      {c.acts} act · {c.evid} evi
                    </span>
                  </div>
                  {/* La barra mide actividades; el color avisa de lo que falta. */}
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        c.acts === 0 ? 'bg-amber-400' : c.evid === 0 ? 'bg-sky-300' : 'bg-emerald-400'
                      }`}
                      style={{ width: c.acts === 0 ? '100%' : `${Math.max(8, (c.acts / maxActs) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Con evidencia</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-300" />Sin evidencia</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Sin actividad</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              {totalActividades} {totalActividades === 1 ? 'actividad' : 'actividades'}
              {totalAcciones !== totalActividades && ` · ${totalAcciones} acciones`}
            </p>
          </Seccion>

          <Seccion titulo="Historia del periodo">
            {devoluciones > 0 && (
              <p className="text-[11px] text-gray-500 mb-2">
                Se ha devuelto <strong className="text-gray-700">{devoluciones}</strong> {devoluciones === 1 ? 'vez' : 'veces'}.
              </p>
            )}
            {historial.length === 0 ? (
              <p className="text-[11px] text-gray-400">Todavía no se ha movido del borrador.</p>
            ) : (
              <ol className="space-y-0">
                {historial.map((h, i) => (
                  <li key={h.id} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5" />
                      {i < historial.length - 1 && <span className="w-px flex-1 bg-gray-100 my-1" />}
                    </div>
                    <div className="pb-3 min-w-0 flex-1">
                      <p className="text-xs text-gray-800">{accionDe(h.estado_anterior, h.estado_nuevo)}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 break-words">
                        {h.usuario?.nombre_completo ?? 'Sistema'}
                        {h.usuario?.rol ? ` · ${ROL_LABEL[h.usuario.rol] ?? h.usuario.rol}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-400">{fechaHora(h.created_at)}</p>
                      {h.comentario && (
                        <p className="text-[11px] text-gray-500 mt-1 italic bg-gray-50 px-2 py-1 rounded-lg break-words">
                          {h.comentario}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Seccion>

          <Seccion titulo="Seguridad social">
            <Dato etiqueta="Planilla">
              {periodo.planilla_ss_url
                ? (periodo.planilla_estado === 'aprobada' ? 'Aprobada'
                  : periodo.planilla_estado === 'rechazada' ? 'Devuelta por incorrecta'
                  : 'Adjunta, sin revisar')
                : 'Sin adjuntar'}
            </Dato>
            {periodo.numero_planilla && <Dato etiqueta="N.° de planilla">{periodo.numero_planilla}</Dato>}
            <Dato etiqueta="Mes que cotiza">
              {periodo.cotizacion_mes ?? periodo.mes}
              {periodo.cotizacion_origen !== 'confirmado' && (
                <span className="text-gray-400"> · sin confirmar</span>
              )}
            </Dato>
            {periodo.planilla_comentario && (
              <p className="text-[11px] text-gray-500 mt-1 italic bg-gray-50 px-2 py-1.5 rounded-lg break-words">
                {periodo.planilla_comentario}
              </p>
            )}
          </Seccion>

          <Seccion titulo="El contrato en contexto">
            <Dato etiqueta="Periodos cerrados">
              {cerrados.length} de {hermanos.length || '—'}
            </Dato>
            <Dato etiqueta="Valor del contrato">{pesos(contrato.valor_total)}</Dato>
            <Dato etiqueta="Ejecutado">
              {pesos(ejecutado)} <span className="text-gray-400">({pctEjecutado} %)</span>
            </Dato>
            <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gray-400" style={{ width: `${pctEjecutado}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              Cuenta solo los periodos aprobados o radicados.
            </p>
          </Seccion>

        </div>
      </div>
    </div>
  )
}
