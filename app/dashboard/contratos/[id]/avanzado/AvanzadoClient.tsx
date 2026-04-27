'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { calcularDistribucionPeriodos } from '@/services/contratos'
import { actualizarValorCobroPeriodo, actualizarPlanillaHistorica, subirPlanilla, actualizarBaseCotizacion } from '@/app/actions/periodos'
import type { EstadoPeriodo } from '@/lib/types'
import { DEFAULT_BASE_COTIZACION_SS } from '@/lib/constants'

// ─── Types ────────────────────────────────────────────────────

type PeriodoRow = {
  id: string
  numero_periodo: number
  mes: string
  anio: number
  fecha_inicio: string
  fecha_fin: string
  valor_cobro: number
  estado: EstadoPeriodo
  es_historico: boolean
  planilla_ss_url: string | null
  numero_planilla: string | null
  planilla_estado: 'pendiente' | 'aprobada' | 'rechazada' | null
  base_cotizacion_ss: number | null
}

type ContratoRow = {
  id: string
  numero: string
  anio: number
  objeto: string
  valor_total: number
  valor_mensual: number
  fecha_inicio: string
  fecha_fin: string
}

type DistribucionItem = ReturnType<typeof calcularDistribucionPeriodos>[number]

// ─── Helpers ──────────────────────────────────────────────────

const ESTADO_LABEL: Partial<Record<EstadoPeriodo, string>> = {
  borrador: 'Borrador',
  enviado: 'En revisión',
  revision: 'En revisión',
  aprobado: 'Aprobado',
  radicado: 'Radicado',
  rechazado: 'Rechazado',
}

const PLANILLA_ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

const PLANILLA_ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  aprobada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
}

// Admin has full power — all periods editable regardless of state or historico flag.
function esPeriodoEditableValor(_p: PeriodoRow): boolean { return true }
function esPeriodoEditablePlanilla(_p: PeriodoRow): boolean { return true }

function exportarCSV(nombre: string, filas: string[][], cabeceras: string[]) {
  const contenido = [cabeceras, ...filas]
    .map((row) => row.map((c) => `"${c}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────

export default function AvanzadoClient({ contratoId }: { contratoId: string }) {
  const router = useRouter()
  const [contrato, setContrato] = useState<ContratoRow | null>(null)
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([])
  const [distribucion, setDistribucion] = useState<DistribucionItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState<'pagos' | 'planillas' | 'base_ss'>('pagos')

  // Plan de Pagos — edición inline por periodo
  const [valoresEdit, setValoresEdit] = useState<Record<string, string>>({})
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [restaurando, setRestaurando] = useState(false)
  const [confirmRestaurar, setConfirmRestaurar] = useState(false)

  // Plan de Planillas — edición inline de numero_planilla
  const [planillasEdit, setPlanillasEdit] = useState<Record<string, string>>({})
  const [guardandoPlanillaId, setGuardandoPlanillaId] = useState<string | null>(null)

  // Base cotización SS — edición inline por periodo
  const [baseEdit, setBaseEdit] = useState<Record<string, string>>({})
  const [guardandoBaseId, setGuardandoBaseId] = useState<string | null>(null)

  // PDF upload per period
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetId = useRef<string>('')
  const [subiendoPdfId, setSubiendoPdfId] = useState<string | null>(null)

  const cargarDatos = useCallback(async () => {
    const supabase = createClient()
    const [{ data: ctr }, { data: pers }] = await Promise.all([
      supabase
        .from('contratos')
        .select('id, numero, anio, objeto, valor_total, valor_mensual, fecha_inicio, fecha_fin')
        .eq('id', contratoId)
        .single(),
      supabase
        .from('periodos')
        .select('id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, es_historico, planilla_ss_url, numero_planilla, planilla_estado, base_cotizacion_ss')
        .eq('contrato_id', contratoId)
        .order('numero_periodo'),
    ])

    if (ctr) {
      setContrato(ctr as ContratoRow)
      const dist = calcularDistribucionPeriodos({
        fechaInicio: ctr.fecha_inicio,
        fechaFin: ctr.fecha_fin,
        valorTotal: ctr.valor_total,
        valorMensual: ctr.valor_mensual,
      })
      setDistribucion(dist)
    }

    if (pers) {
      const rows = pers as PeriodoRow[]
      setPeriodos(rows)
      // Pre-poblar edits con valores actuales
      const vals: Record<string, string> = {}
      const plans: Record<string, string> = {}
      const bases: Record<string, string> = {}
      rows.forEach((p) => {
        vals[p.id] = String(p.valor_cobro)
        plans[p.id] = p.numero_planilla ?? ''
        bases[p.id] = p.base_cotizacion_ss != null ? String(p.base_cotizacion_ss) : ''
      })
      setValoresEdit(vals)
      setPlanillasEdit(plans)
      setBaseEdit(bases)
    }

    setCargando(false)
  }, [contratoId])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // ── Plan de Pagos handlers ──────────────────────────────────

  async function guardarValor(periodoId: string) {
    const raw = valoresEdit[periodoId] ?? ''
    const num = Number(raw.replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(num) || num < 0) { toast.error('Valor inválido'); return }
    setGuardandoId(periodoId)
    const res = await actualizarValorCobroPeriodo(periodoId, num)
    setGuardandoId(null)
    if (res.error) { toast.error(res.error); return }
    toast.success('Valor actualizado')
    await cargarDatos()
  }

  async function restaurarDistribucion() {
    if (!contrato) return
    setRestaurando(true)
    setConfirmRestaurar(false)
    const editables = periodos.filter(esPeriodoEditableValor)
    const resultados = await Promise.all(
      editables.map((p) => {
        const sugerido = distribucion.find((d) => d.numero === p.numero_periodo)?.valorCobro ?? p.valor_cobro
        return actualizarValorCobroPeriodo(p.id, sugerido)
      })
    )
    const errores = resultados.filter((r) => r.error)
    if (errores.length > 0) {
      toast.error(`${errores.length} periodo(s) no se pudieron restaurar`)
    } else {
      toast.success(`Distribución restaurada en ${editables.length} periodo(s)`)
    }
    setRestaurando(false)
    await cargarDatos()
  }

  function exportarPagos() {
    if (!contrato || periodos.length === 0) return
    exportarCSV(
      `pagos-contrato-${contrato.numero}-${contrato.anio}.csv`,
      periodos.map((p) => {
        const sugerido = distribucion.find((d) => d.numero === p.numero_periodo)?.valorCobro ?? p.valor_cobro
        return [
          String(p.numero_periodo),
          `${p.mes} ${p.anio}`,
          p.fecha_inicio,
          p.fecha_fin,
          String(p.valor_cobro),
          String(sugerido),
          p.valor_cobro !== sugerido ? 'Modificado' : 'Automático',
          ESTADO_LABEL[p.estado] ?? p.estado,
          p.es_historico ? 'Sí' : 'No',
        ]
      }),
      ['#', 'Mes', 'Fecha inicio', 'Fecha fin', 'Valor actual', 'Valor sugerido', 'Tipo', 'Estado', 'Histórico'],
    )
  }

  // ── Plan de Planillas handlers ──────────────────────────────

  async function guardarPlanilla(periodoId: string) {
    setGuardandoPlanillaId(periodoId)
    const res = await actualizarPlanillaHistorica(periodoId, planillasEdit[periodoId] ?? '')
    setGuardandoPlanillaId(null)
    if (res.error) { toast.error(res.error); return }
    toast.success(planillasEdit[periodoId]?.trim() ? 'Planilla actualizada' : 'Planilla borrada')
    await cargarDatos()
  }

  async function guardarBase(periodoId: string) {
    const raw = baseEdit[periodoId]?.trim()
    const valor = raw ? parseInt(raw.replace(/\D/g, ''), 10) : null
    if (raw && (!Number.isFinite(valor) || (valor as number) <= 0)) {
      toast.error('Valor inválido')
      return
    }
    setGuardandoBaseId(periodoId)
    const res = await actualizarBaseCotizacion(periodoId, valor ?? null)
    setGuardandoBaseId(null)
    if (res.error) { toast.error(res.error); return }
    toast.success(valor ? 'Base de cotización actualizada' : 'Base restablecida al valor por defecto')
    await cargarDatos()
  }

  async function handlePdfUpload(file: File) {
    const periodoId = uploadTargetId.current
    if (!periodoId) return
    setSubiendoPdfId(periodoId)
    const fd = new FormData()
    fd.append('file', file)
    const res = await subirPlanilla(periodoId, fd)
    setSubiendoPdfId(null)
    if (res.error) { toast.error(res.error); return }
    toast.success('PDF subido correctamente')
    await cargarDatos()
  }

  function exportarPlanillas() {
    if (!contrato || periodos.length === 0) return
    exportarCSV(
      `planillas-contrato-${contrato.numero}-${contrato.anio}.csv`,
      periodos.map((p) => [
        String(p.numero_periodo),
        `${p.mes} ${p.anio}`,
        p.numero_planilla ?? '',
        p.planilla_ss_url ? 'Sí' : 'No',
        p.planilla_estado ? PLANILLA_ESTADO_LABEL[p.planilla_estado] : 'Sin estado',
        ESTADO_LABEL[p.estado] ?? p.estado,
        p.es_historico ? 'Sí' : 'No',
      ]),
      ['#', 'Mes', 'N.° planilla', 'Tiene PDF', 'Estado planilla', 'Estado periodo', 'Histórico'],
    )
  }

  // ── Computed ────────────────────────────────────────────────

  const sumaPeriodos = periodos.reduce((acc, p) => acc + (p.valor_cobro ?? 0), 0)
  const delta = (contrato?.valor_total ?? 0) - sumaPeriodos
  const cuadra = delta === 0

  // ── Render ──────────────────────────────────────────────────

  if (cargando) {
    return <div className="max-w-4xl"><p className="text-gray-500 text-sm">Cargando...</p></div>
  }

  if (!contrato) {
    return <div className="max-w-4xl"><p className="text-red-500 text-sm">Contrato no encontrado.</p></div>
  }

  return (
    <div className="max-w-5xl space-y-6">
      <Toaster position="top-center" richColors />
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/dashboard/contratos/${contratoId}`}
            className="text-xs text-gray-400 hover:text-gray-600 mb-1 inline-flex items-center gap-1"
          >
            ← Volver al contrato
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Opciones Avanzadas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Contrato {contrato.numero}/{contrato.anio} · {contrato.objeto}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['pagos', 'planillas', 'base_ss'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pagos' ? '💰 Plan de Pagos' : t === 'planillas' ? '📋 Plan de Planillas' : '🏥 Base SS'}
          </button>
        ))}
      </div>

      {/* ══ PLAN DE PAGOS ══════════════════════════════════════ */}
      {tab === 'pagos' && (
        <div className="space-y-4">
          {/* Resumen financiero */}
          <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${
            cuadra ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
          }`}>
            <span className={`font-semibold ${cuadra ? 'text-emerald-800' : 'text-red-800'}`}>
              {cuadra ? '✓ Los pagos cuadran con el valor total del contrato' : '✕ Los pagos no cuadran — revisa los valores'}
            </span>
            <div className={`flex gap-4 text-xs ${cuadra ? 'text-emerald-700' : 'text-red-700'}`}>
              <span>Suma periodos: <strong>${sumaPeriodos.toLocaleString('es-CO')}</strong></span>
              <span>Total contrato: <strong>${contrato.valor_total.toLocaleString('es-CO')}</strong></span>
              {!cuadra && <span>Δ <strong>${delta.toLocaleString('es-CO')}</strong></span>}
            </div>
          </div>

          {/* Nota */}
          <p className="text-xs text-gray-500">
            Solo puedes editar periodos en estado <strong>Borrador</strong> o <strong>Rechazado</strong> que no sean históricos.
            El valor sugerido se calcula automáticamente con distribución proporcional.
          </p>

          {/* Tabla */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-8">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Periodo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Días</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Sugerido</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Actual</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Estado</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {periodos.map((p) => {
                  const distItem = distribucion.find((d) => d.numero === p.numero_periodo)
                  const sugerido = distItem?.valorCobro ?? p.valor_cobro
                  const modificado = p.valor_cobro !== sugerido
                  const editable = esPeriodoEditableValor(p)
                  const guardando = guardandoId === p.id
                  const valorActualEdit = valoresEdit[p.id] ?? String(p.valor_cobro)

                  return (
                    <tr key={p.id} className={`${editable ? 'hover:bg-gray-50' : 'opacity-60'}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.numero_periodo}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.mes} {p.anio}</p>
                        <p className="text-xs text-gray-400">{p.fecha_inicio} — {p.fecha_fin}</p>
                        {distItem && (
                          <p className="text-xs text-gray-400">
                            {distItem.diasActivos}/{distItem.diasDelMes} días
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {distItem ? `${distItem.diasActivos}/${distItem.diasDelMes}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        ${sugerido.toLocaleString('es-CO')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editable ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={valorActualEdit}
                            onChange={(e) =>
                              setValoresEdit((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            onBlur={() => {
                              const num = Number(valorActualEdit.replace(/[^\d.-]/g, ''))
                              if (Number.isFinite(num) && num !== p.valor_cobro) guardarValor(p.id)
                            }}
                            className="w-32 px-2 py-1 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                            disabled={guardando || restaurando}
                          />
                        ) : (
                          <span className="font-medium text-gray-900">
                            ${p.valor_cobro.toLocaleString('es-CO')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {p.es_historico ? '🔒 Histórico' : (ESTADO_LABEL[p.estado] ?? p.estado)}
                          </span>
                          {modificado && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                              ✎ Modificado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {guardando && (
                          <span className="text-xs text-gray-400">Guardando…</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={exportarPagos}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Exportar CSV
            </button>

            {/* Zona peligro */}
            <div className="flex items-center gap-3">
              {confirmRestaurar ? (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                  <span className="text-xs text-red-700">
                    ¿Confirmar? Se sobrescriben todos los valores editables.
                  </span>
                  <button
                    onClick={restaurarDistribucion}
                    disabled={restaurando}
                    className="text-xs px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300"
                  >
                    {restaurando ? 'Restaurando…' : 'Sí, restaurar'}
                  </button>
                  <button
                    onClick={() => setConfirmRestaurar(false)}
                    className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRestaurar(true)}
                  disabled={restaurando || periodos.filter(esPeriodoEditableValor).length === 0}
                  className="text-sm px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ↺ Restaurar distribución automática
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ PLAN DE PLANILLAS ══════════════════════════════════ */}
      {tab === 'planillas' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Puedes editar el número de planilla en periodos <strong>históricos</strong> o en estado <strong>Aprobado</strong>/<strong>Radicado</strong>.
            Cada cambio queda registrado en el historial del periodo con tu nombre.
          </p>

          {/* Resumen de completitud */}
          {(() => {
            const total = periodos.length
            const conPDF = periodos.filter((p) => p.planilla_ss_url).length
            const conNumero = periodos.filter((p) => p.numero_planilla?.trim()).length
            const completos = periodos.filter((p) => p.planilla_ss_url && p.numero_planilla?.trim()).length
            return (
              <div className="flex flex-wrap gap-4 text-sm">
                {[
                  { label: 'Total periodos', valor: total, color: 'text-gray-700' },
                  { label: 'Con PDF', valor: conPDF, color: conPDF === total ? 'text-emerald-700' : 'text-amber-700' },
                  { label: 'Con número', valor: conNumero, color: conNumero === total ? 'text-emerald-700' : 'text-amber-700' },
                  { label: 'Completos', valor: completos, color: completos === total ? 'text-emerald-700' : 'text-red-600' },
                ].map(({ label, valor, color }) => (
                  <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-center min-w-[90px]">
                    <p className={`text-lg font-bold ${color}`}>{valor}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Tabla */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-8">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Periodo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">N.° Planilla</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">PDF</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Estado</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">Completo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {periodos.map((p) => {
                  const editable = esPeriodoEditablePlanilla(p)
                  const guardando = guardandoPlanillaId === p.id
                  const valorEdit = planillasEdit[p.id] ?? ''
                  const cambio = valorEdit.trim() !== (p.numero_planilla ?? '').trim()
                  const completo = !!p.planilla_ss_url && !!p.numero_planilla?.trim()

                  return (
                    <tr key={p.id} className={`${editable ? 'hover:bg-gray-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.numero_periodo}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.mes} {p.anio}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {p.es_historico ? '🔒 Histórico' : (ESTADO_LABEL[p.estado] ?? p.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {editable ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={valorEdit}
                              onChange={(e) =>
                                setPlanillasEdit((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                              placeholder="N.° planilla"
                              className="w-36 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-100"
                              disabled={guardando}
                            />
                            {cambio && (
                              <button
                                onClick={() => guardarPlanilla(p.id)}
                                disabled={guardando}
                                className="text-xs px-2 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-gray-300"
                              >
                                {guardando ? '…' : 'Guardar'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-700">
                            {p.numero_planilla ?? <span className="text-gray-400 italic">Sin número</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.planilla_ss_url ? (
                            <a
                              href={p.planilla_ss_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Ver PDF
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">Sin PDF</span>
                          )}
                          <button
                            onClick={() => {
                              uploadTargetId.current = p.id
                              pdfInputRef.current?.click()
                            }}
                            disabled={subiendoPdfId === p.id}
                            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 hover:border-gray-300 disabled:opacity-40"
                            title={p.planilla_ss_url ? 'Reemplazar PDF' : 'Subir PDF'}
                          >
                            {subiendoPdfId === p.id ? '…' : p.planilla_ss_url ? '↑ Reemplazar' : '↑ Subir'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.planilla_estado ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLANILLA_ESTADO_COLOR[p.planilla_estado] ?? 'bg-gray-100 text-gray-600'}`}>
                            {PLANILLA_ESTADO_LABEL[p.planilla_estado]}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-base ${completo ? 'text-emerald-500' : 'text-red-400'}`}>
                          {completo ? '✓' : '✕'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-2">
            <button
              onClick={exportarPlanillas}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Exportar CSV
            </button>
          </div>
        </div>
      )}

      {/* ══ BASE COTIZACIÓN SS ════════════════════════════════ */}
      {tab === 'base_ss' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Base de cotización a la Seguridad Social que aparece en el Acta de Supervisión de cada periodo.
            Déjalo en blanco para usar el valor por defecto ($ {DEFAULT_BASE_COTIZACION_SS.toLocaleString('es-CO')}).
          </p>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-8">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Periodo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Base cotización SS</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {periodos.map((p) => {
                  const guardando = guardandoBaseId === p.id
                  const valorEdit = baseEdit[p.id] ?? ''
                  const valorActual = p.base_cotizacion_ss ?? DEFAULT_BASE_COTIZACION_SS
                  const esCambiado = valorEdit.trim() !== (p.base_cotizacion_ss != null ? String(p.base_cotizacion_ss) : '')

                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.numero_periodo}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.mes} {p.anio}</p>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {p.es_historico ? '🔒 Histórico' : (ESTADO_LABEL[p.estado] ?? p.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={valorEdit}
                            onChange={(e) =>
                              setBaseEdit((prev) => ({ ...prev, [p.id]: e.target.value.replace(/\D/g, '') }))
                            }
                            placeholder={`${DEFAULT_BASE_COTIZACION_SS.toLocaleString('es-CO')}`}
                            className="w-40 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-gray-100"
                            disabled={guardando}
                          />
                          {esCambiado && (
                            <button
                              onClick={() => guardarBase(p.id)}
                              disabled={guardando}
                              className="text-xs px-2 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-gray-300"
                            >
                              {guardando ? '…' : 'Guardar'}
                            </button>
                          )}
                          {p.base_cotizacion_ss != null && !esCambiado && (
                            <span className="text-xs text-violet-600 font-medium">✎ Personalizado</span>
                          )}
                        </div>
                        {!esCambiado && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            En acta: $ {valorActual.toLocaleString('es-CO')}
                            {p.base_cotizacion_ss == null && ' (por defecto)'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {ESTADO_LABEL[p.estado] ?? p.estado}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Input oculto para subida de PDFs — un solo input compartido por todos los periodos */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        style={{ position: 'fixed', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handlePdfUpload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
