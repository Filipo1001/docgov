'use client'

/**
 * El detalle del periodo, detrás de un clic.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 *
 * La cabecera acumulaba datos porque no había otro sitio donde ponerlos —el
 * rango de fechas, «Actividades registradas: 11 | Total acciones: 11», dos
 * números que en el 79 % de los periodos son el MISMO— mientras que lo que de
 * verdad decide una revisión no estaba en ninguna parte: qué obligaciones
 * llegaron sin sustento, si hay evidencias repetidas, cuánto se lleva
 * ejecutado del contrato, quién movió esto y cuándo.
 *
 * ── Solo para quien revisa ───────────────────────────────────────────────
 *
 * Asesor, supervisor y administrador. La contratista no lo ve: está redactado
 * para decidir sobre un informe ajeno —«2 obligaciones sin actividad»,
 * «devuelto 2 veces»— y esa lectura no es la suya.
 */

import { useEffect, useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'
import type { Contrato, Periodo, Obligacion, Actividad, EstadoPeriodo, DuplicadoMatch } from '@/lib/types'

export interface HermanoResumen {
  id: string
  numero_periodo: number
  mes?: string
  estado?: EstadoPeriodo
  valor_cobro?: number | null
  numero_planilla?: string | null
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador', supervisor: 'Supervisor', asesor: 'Asesor',
  contratista: 'Contratista', contratacion: 'Contratación',
}

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/**
 * Un color por estado, los mismos que ya distinguen los chips de la
 * aplicación (`ESTADO_COLOR` en lib/constants). Antes la línea solo separaba
 * «acabó bien / acabó mal / lo demás», así que un envío, una revisión del
 * asesor y una vuelta a borrador se pintaban iguales — que es justo lo que una
 * trazabilidad no debe hacer.
 *
 * Van como valores y no como clases de Tailwind porque el punto es un `span`
 * que también se reutiliza en el panel de abajo, y una sola fuente evita que
 * un día el punto y su ficha digan colores distintos.
 */
const COLOR_NODO: Record<string, string> = {
  borrador:  '#d1d5db', // gris — todavía en manos de la contratista
  enviado:   '#60a5fa', // azul — salió a revisión
  revision:  '#818cf8', // índigo — el asesor ya lo miró
  aprobado:  '#22c55e', // verde
  radicado:  MARCA,     // tinta de marca — el final del recorrido
  rechazado: '#f87171', // rojo — volvió para corrección
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

const pesos = (n: number | null | undefined) => `$${(n ?? 0).toLocaleString('es-CO')}`

function fechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function Seccion({ titulo, children, className = '' }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">{titulo}</h4>
      {children}
    </section>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{etiqueta}</p>
      <p className="text-xs text-gray-800 mt-0.5 break-words">{children}</p>
    </div>
  )
}

/** Ficha oscura compartida por el calendario y la línea de tiempo. */
function Ficha({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`absolute z-20 rounded-xl px-3 py-2 shadow-2xl pointer-events-none w-max max-w-[220px] ${className}`}
      style={{ backgroundColor: MARCA }}
    >
      {children}
    </div>
  )
}

export default function DetallePeriodo({
  abierto, onCerrar, contrato, periodo, obligaciones, actividades, hermanos,
  adicionesTotal = 0, duplicados = {},
}: {
  abierto: boolean
  onCerrar: () => void
  contrato: Contrato
  periodo: Periodo
  obligaciones: Obligacion[]
  actividades: Actividad[]
  hermanos: HermanoResumen[]
  /** Adiciones por otrosí, para que la ejecución coincida con el Acta de Pago. */
  adicionesTotal?: number
  duplicados?: Record<string, DuplicadoMatch[]>
}) {
  const [diaAbierto, setDiaAbierto] = useState<number | null>(null)
  const [nodoAbierto, setNodoAbierto] = useState<number | null>(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', cerrar)
    return () => document.removeEventListener('keydown', cerrar)
  }, [abierto, onCerrar])

  if (!abierto) return null

  // ── Alertas ────────────────────────────────────────────────────────────
  // Cada una existe porque alguien tendría que descubrirla abriendo cosas: el
  // acordeón obligación por obligación, el desplegable de la planilla, las
  // miniaturas una a una.
  const sinActividad = obligaciones.filter(
    obl => !actividades.some(a => a.obligacion_id === obl.id),
  ).length

  const evidenciasRepetidas = Object.values(duplicados).filter(m => m.length > 0).length

  const mesCotiza = periodo.cotizacion_mes ?? periodo.mes
  const esMesVencido = !!mesCotiza && mesCotiza.toLowerCase() !== (periodo.mes ?? '').toLowerCase()

  const planillaNum = (periodo.numero_planilla ?? '').trim()
  const repeticionesPlanilla = planillaNum
    ? hermanos.filter(h => (h.numero_planilla ?? '').trim() === planillaNum).length
    : 0

  const alertas: { clave: string; texto: string; tono: 'ambar' | 'rojo' | 'azul' }[] = []
  if (sinActividad > 0) alertas.push({
    clave: 'sin-actividad', tono: 'ambar',
    texto: `${sinActividad} ${sinActividad === 1 ? 'obligación no tiene' : 'obligaciones no tienen'} ninguna actividad`,
  })
  if (evidenciasRepetidas > 0) alertas.push({
    clave: 'duplicadas', tono: 'rojo',
    texto: `Se detectaron ${evidenciasRepetidas} ${evidenciasRepetidas === 1 ? 'evidencia repetida' : 'evidencias repetidas'}`,
  })
  if (esMesVencido) alertas.push({
    clave: 'mes-vencido', tono: 'azul',
    texto: `La planilla es de mes vencido — cotiza ${mesCotiza}`,
  })
  if (periodo.planilla_estado === 'rechazada') alertas.push({
    clave: 'planilla-devuelta', tono: 'rojo',
    texto: 'La planilla fue devuelta por incorrecta',
  })
  else if (!periodo.planilla_ss_url) alertas.push({
    clave: 'planilla-falta', tono: 'ambar', texto: 'Sin planilla de seguridad social',
  })
  else if (periodo.planilla_estado === 'pendiente') alertas.push({
    clave: 'planilla-pendiente', tono: 'ambar', texto: 'La planilla está adjunta pero nadie la ha revisado',
  })
  if (repeticionesPlanilla >= 3) alertas.push({
    clave: 'planilla-repetida', tono: 'rojo',
    texto: `La planilla N.° ${planillaNum} se usa en ${repeticionesPlanilla} periodos`,
  })

  const TONOS = {
    ambar: 'bg-amber-50 border-amber-200 text-amber-800',
    rojo:  'bg-red-50 border-red-200 text-red-800',
    azul:  'bg-sky-50 border-sky-200 text-sky-800',
  } as const

  // ── Ejecución del contrato ─────────────────────────────────────────────
  // Mismo cálculo que lib/pdf/data.ts para el Acta de Pago: acumulado corrido
  // hasta este periodo, sobre el valor del contrato más sus adiciones.
  const valorEfectivo = (contrato.valor_total ?? 0) + adicionesTotal
  const ordenados = [...hermanos].sort((a, b) => a.numero_periodo - b.numero_periodo)
  let corrido = 0
  const ejecucion = ordenados
    .filter(h => h.numero_periodo <= periodo.numero_periodo)
    .map(h => {
      const monto = h.valor_cobro ?? 0
      corrido += monto
      return {
        numero: h.numero_periodo,
        mes: h.mes ?? '',
        monto,
        acumulado: corrido,
        restante: valorEfectivo - corrido,
        actual: h.numero_periodo === periodo.numero_periodo,
      }
    })

  // ── Calendario de carga de evidencias ──────────────────────────────────
  // MIDE CUÁNDO SE SUBIERON LOS ARCHIVOS, no cuándo se hizo el trabajo: la
  // compresión del navegador (lib/compress.ts pasa toda imagen por Canvas)
  // borra el EXIF, así que la fecha de la cámara no existe en lo guardado. El
  // rótulo lo dice para que nadie lea aquí «días trabajados»: en 2 de cada 3
  // informes toda la carga cae en un solo día.
  const idxMes = MESES_ES.findIndex(m => m.toLowerCase() === (periodo.mes ?? '').toLowerCase())
  const anio = periodo.anio
  const porDia = new Map<number, number>()
  let fueraDelMes = 0
  for (const act of actividades) {
    for (const ev of act.evidencias ?? []) {
      if (!ev.created_at) continue
      const d = new Date(ev.created_at)
      if (Number.isNaN(d.getTime())) continue
      if (d.getFullYear() === anio && d.getMonth() === idxMes) {
        porDia.set(d.getDate(), (porDia.get(d.getDate()) ?? 0) + 1)
      } else {
        fueraDelMes++
      }
    }
  }
  const diasDelMes = idxMes >= 0 ? new Date(anio, idxMes + 1, 0).getDate() : 0
  // Lunes = 0, para una semana que empieza en L como se lee aquí.
  const desplazamiento = idxMes >= 0 ? (new Date(anio, idxMes, 1).getDay() + 6) % 7 : 0
  const diasConCarga = porDia.size

  // ── Historia ───────────────────────────────────────────────────────────
  const historial = periodo.historial ?? []
  const devoluciones = historial.filter(h =>
    h.estado_nuevo === 'rechazado' ||
    (h.estado_nuevo === 'enviado' && (h.estado_anterior === 'revision' || h.estado_anterior === 'enviado')),
  ).length

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del periodo ${periodo.mes} ${periodo.anio}`}
    >
      <div
        className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Detalle del periodo</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {periodo.mes} {periodo.anio} · Contrato N.° {contrato.numero}
            </p>
          </div>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          >
            <Icono glifo={Iconos.accion.cerrar} tamano="md" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-6">

          {/* 1 · IDENTIFICACIÓN */}
          <Seccion titulo="Identificación">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <Dato etiqueta="Contrato">N.° {contrato.numero}-{contrato.anio}</Dato>
              <Dato etiqueta="CDP">{contrato.cdp?.trim() || '—'}</Dato>
              <Dato etiqueta="CRP">{contrato.crp?.trim() || '—'}</Dato>
              <Dato etiqueta="Periodo">{periodo.numero_periodo} de {hermanos.length || '—'}</Dato>
              <Dato etiqueta="Contratista">{contrato.contratista?.nombre_completo ?? '—'}</Dato>
              <Dato etiqueta="Cédula">{contrato.contratista?.cedula ?? '—'}</Dato>
              <Dato etiqueta="Dependencia">{contrato.dependencia?.nombre ?? '—'}</Dato>
              <Dato etiqueta="Supervisor">{contrato.supervisor?.nombre_completo ?? '—'}</Dato>
            </div>
          </Seccion>

          {/* 2 · EJECUCIÓN */}
          <Seccion titulo="Ejecución del contrato" className="pt-5 border-t border-gray-100">
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[420px] text-xs border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="text-left font-semibold pb-2 border-b border-gray-200">Periodo</th>
                    <th className="text-right font-semibold pb-2 pl-4 border-b border-gray-200">Monto</th>
                    <th className="text-right font-semibold pb-2 pl-4 border-b border-gray-200">Acumulado</th>
                    <th className="text-right font-semibold pb-2 pl-4 border-b border-gray-200">Restante</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {ejecucion.map(f => (
                    <tr
                      key={f.numero}
                      className={f.actual ? 'bg-amber-50 font-semibold text-amber-900' : 'text-gray-700'}
                    >
                      <td className={`py-2 border-b border-gray-100 whitespace-nowrap ${f.actual ? 'rounded-l-lg pl-2' : ''}`}>
                        {f.numero}{f.mes ? ` · ${f.mes}` : ''}
                      </td>
                      <td className="py-2 pl-4 border-b border-gray-100 text-right">{pesos(f.monto)}</td>
                      <td className="py-2 pl-4 border-b border-gray-100 text-right">{pesos(f.acumulado)}</td>
                      <td className={`py-2 pl-4 border-b border-gray-100 text-right ${f.actual ? 'rounded-r-lg pr-2' : ''}`}>
                        {pesos(f.restante)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-gray-900 font-bold tabular-nums">
                    <td className="pt-3">Valor del contrato</td>
                    <td className="pt-3 text-right" colSpan={3}>{pesos(valorEfectivo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {adicionesTotal > 0 && (
              <p className="text-[11px] text-gray-400 mt-2">
                Incluye {pesos(adicionesTotal)} de adiciones por otrosí.
              </p>
            )}
          </Seccion>

          {/* 3 · ALERTAS */}
          {alertas.length > 0 && (
            <Seccion titulo="Alertas" className="pt-5 border-t border-gray-100">
              <div className="flex flex-col gap-2">
                {alertas.map(a => (
                  <div key={a.clave} className={`flex items-start gap-2.5 border rounded-xl px-3 py-2.5 ${TONOS[a.tono]}`}>
                    <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed">{a.texto}</p>
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {/* 4 · CALENDARIO */}
          {idxMes >= 0 && (
            <Seccion titulo={`Días con carga de evidencias · ${periodo.mes} ${anio}`} className="pt-5 border-t border-gray-100">
              <div className="grid grid-cols-7 gap-1 max-w-[300px]">
                {['L','M','M','J','V','S','D'].map((d, i) => (
                  <div key={i} className="text-[9px] font-semibold text-gray-400 text-center pb-1">{d}</div>
                ))}
                {Array.from({ length: desplazamiento }, (_, i) => <div key={`p${i}`} />)}
                {Array.from({ length: diasDelMes }, (_, i) => {
                  const dia = i + 1
                  const n = porDia.get(dia) ?? 0
                  const activo = n > 0
                  return (
                    <div key={dia} className="relative">
                      <button
                        type="button"
                        disabled={!activo}
                        onMouseEnter={() => activo && setDiaAbierto(dia)}
                        onMouseLeave={() => setDiaAbierto(null)}
                        onClick={() => setDiaAbierto(d => (d === dia ? null : dia))}
                        aria-label={activo ? `${dia}: ${n} evidencias subidas` : `${dia}: sin carga`}
                        className={`w-full aspect-square rounded-md text-[10px] flex items-center justify-center transition-colors ${
                          activo
                            ? 'bg-emerald-500 text-white font-semibold hover:bg-emerald-600 cursor-pointer'
                            : 'bg-gray-100 text-gray-400 cursor-default'
                        }`}
                      >
                        {dia}
                      </button>
                      {diaAbierto === dia && activo && (
                        <Ficha className="bottom-full left-1/2 -translate-x-1/2 mb-1.5">
                          <p className="text-[11px] text-white whitespace-nowrap">
                            {n} {n === 1 ? 'evidencia subida' : 'evidencias subidas'}
                          </p>
                        </Ficha>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                {diasConCarga === 0
                  ? 'No se subió ninguna evidencia dentro de este mes.'
                  : `Se cargaron evidencias en ${diasConCarga} ${diasConCarga === 1 ? 'día' : 'días'} del mes.`}
                {fueraDelMes > 0 && ` ${fueraDelMes} ${fueraDelMes === 1 ? 'se subió' : 'se subieron'} fuera del mes del informe.`}
                {' '}Mide cuándo se subieron los archivos, no cuándo se hizo el trabajo.
              </p>
            </Seccion>
          )}

          {/* 5 · HISTORIA */}
          <Seccion titulo="Historia del periodo" className="pt-5 border-t border-gray-100">
            {devoluciones > 0 && (
              <p className="text-[11px] text-gray-500 mb-3">
                Se ha devuelto <strong className="text-gray-700">{devoluciones}</strong> {devoluciones === 1 ? 'vez' : 'veces'}.
              </p>
            )}
            {historial.length === 0 ? (
              <p className="text-[11px] text-gray-400">Todavía no se ha movido del borrador.</p>
            ) : (
              /* Línea de tiempo horizontal. Con scroll propio cuando hay muchos
                 movimientos —hay periodos con 53— en vez de apretar los nodos
                 hasta que dejen de poder tocarse. */
              <>
                {/* La línea. Con scroll propio cuando hay muchos movimientos
                    —hay periodos con 53— en vez de apretar los nodos hasta que
                    dejen de poder tocarse. */}
                <div className="overflow-x-auto -mx-1 px-1 pb-1">
                  <div className="flex items-start min-w-max">
                    {historial.map((h, i) => {
                      const sel = nodoAbierto === i
                      return (
                        <div key={h.id} className="flex items-start">
                          {i > 0 && <span className="w-10 sm:w-14 h-px bg-gray-200 mt-[9px]" aria-hidden="true" />}
                          <div className="flex flex-col items-center">
                            <button
                              type="button"
                              onMouseEnter={() => setNodoAbierto(i)}
                              onClick={() => setNodoAbierto(i)}
                              aria-label={`${accionDe(h.estado_anterior, h.estado_nuevo)} — ${fechaHora(h.created_at)}`}
                              aria-pressed={sel}
                              className="w-5 h-5 flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                            >
                              <span
                                className={`block rounded-full transition-all ${sel ? 'w-3.5 h-3.5 ring-2 ring-offset-1 ring-gray-300' : 'w-2.5 h-2.5'}`}
                                style={{ backgroundColor: COLOR_NODO[h.estado_nuevo ?? 'borrador'] ?? '#d1d5db' }}
                              />
                            </button>
                            <span className={`text-[10px] mt-1.5 whitespace-nowrap ${sel ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                              {fechaCorta(h.created_at)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* El detalle, en un panel bajo la línea y NO en una ficha
                    flotante. La ficha se recortaba: vivía dentro del scroll
                    horizontal de la línea y del scroll vertical del modal, y
                    cualquier ancestro con `overflow` distinto de `visible`
                    corta un elemento posicionado. Aquí no hay nada que cortar,
                    y cabe el comentario entero. */}
                {(() => {
                  const h = historial[nodoAbierto ?? historial.length - 1]
                  if (!h) return null
                  return (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLOR_NODO[h.estado_nuevo ?? 'borrador'] ?? '#d1d5db' }}
                        />
                        <p className="text-xs font-semibold text-gray-900">
                          {accionDe(h.estado_anterior, h.estado_nuevo)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-700 mt-1.5 break-words">
                        {h.usuario?.nombre_completo ?? 'Sistema'}
                        {h.usuario?.rol && (
                          <span className="text-gray-400"> · {ROL_LABEL[h.usuario.rol] ?? h.usuario.rol}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{fechaHora(h.created_at)}</p>
                      {h.comentario && (
                        <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200 italic break-words leading-relaxed">
                          {h.comentario}
                        </p>
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </Seccion>

        </div>
      </div>
    </div>
  )
}
