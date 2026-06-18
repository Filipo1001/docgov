'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { calcularDistribucionPeriodos } from '@/services/contratos'
import { actualizarValorCobroPeriodo, actualizarPlanillaHistorica, subirPlanilla, actualizarBaseCotizacion, guardarMesCotizacion } from '@/app/actions/periodos'
import { getOtrosies, crearOtrosi, eliminarOtrosi, type Otrosi, type TipoOtrosi } from '@/app/actions/otrosies'
import type { EstadoPeriodo } from '@/lib/types'
import { DEFAULT_BASE_COTIZACION_SS, calcularBaseCotizacionSS, MESES } from '@/lib/constants'

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
  cotizacion_mes: string | null
  cotizacion_origen: 'inferido' | 'confirmado' | null
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
  const [tab, setTab] = useState<'pagos' | 'planillas' | 'base_ss' | 'otrosies'>('pagos')

  // Otrosíes
  const [otrosies, setOtrosies] = useState<Otrosi[]>([])
  const [mostrarFormOtrosi, setMostrarFormOtrosi] = useState(false)
  const [guardandoOtrosi, setGuardandoOtrosi] = useState(false)
  const [eliminandoOtrosiId, setEliminandoOtrosiId] = useState<string | null>(null)
  const [formOtrosi, setFormOtrosi] = useState({
    tipo: 'adicion' as TipoOtrosi,
    fecha_inicio: '',
    valor_adicion: '',
    plazo_dias_adicion: '',
    cdp: '',
    crp: '',
    nota: '',
  })

  // Plan de Pagos — edición inline por periodo
  const [valoresEdit, setValoresEdit] = useState<Record<string, string>>({})
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [restaurando, setRestaurando] = useState(false)
  const [confirmRestaurar, setConfirmRestaurar] = useState(false)

  // Plan de Planillas — edición inline de numero_planilla
  const [planillasEdit, setPlanillasEdit] = useState<Record<string, string>>({})
  const [guardandoPlanillaId, setGuardandoPlanillaId] = useState<string | null>(null)

  // Mes de cotización — edición inline por periodo
  const [guardandoMesId, setGuardandoMesId] = useState<string | null>(null)

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
        .select('id, numero_periodo, mes, anio, fecha_inicio, fecha_fin, valor_cobro, estado, es_historico, planilla_ss_url, numero_planilla, planilla_estado, base_cotizacion_ss, cotizacion_mes, cotizacion_origen')
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

    // Otrosíes (vía Server Action — auth server-side)
    try {
      setOtrosies(await getOtrosies(contratoId))
    } catch { /* no bloquea la carga del resto */ }

    setCargando(false)
  }, [contratoId])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  // ── Otrosíes handlers ───────────────────────────────────────

  async function guardarOtrosi() {
    if (!formOtrosi.fecha_inicio) { toast.error('La fecha de inicio del otrosí es obligatoria'); return }
    setGuardandoOtrosi(true)
    const res = await crearOtrosi({
      contratoId,
      tipo: formOtrosi.tipo,
      fecha_inicio: formOtrosi.fecha_inicio,
      valor_adicion: parseInt(formOtrosi.valor_adicion.replace(/\D/g, ''), 10) || 0,
      plazo_dias_adicion: parseInt(formOtrosi.plazo_dias_adicion, 10) || 0,
      cdp: formOtrosi.cdp || null,
      crp: formOtrosi.crp || null,
      nota: formOtrosi.nota || null,
    })
    setGuardandoOtrosi(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Otrosí registrado')
    setMostrarFormOtrosi(false)
    setFormOtrosi({ tipo: 'adicion', fecha_inicio: '', valor_adicion: '', plazo_dias_adicion: '', cdp: '', crp: '', nota: '' })
    await cargarDatos()
  }

  async function borrarOtrosi(id: string) {
    setEliminandoOtrosiId(id)
    const res = await eliminarOtrosi(id, contratoId)
    setEliminandoOtrosiId(null)
    if (res.error) { toast.error(res.error); return }
    toast.success('Otrosí eliminado')
    await cargarDatos()
  }

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

  async function guardarMes(periodoId: string, mes: string) {
    setGuardandoMesId(periodoId)
    const res = await guardarMesCotizacion(periodoId, mes)
    setGuardandoMesId(null)
    if (res.error) { toast.error(res.error); return }
    toast.success('Mes de cotización actualizado')
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
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['pagos', 'planillas', 'base_ss', 'otrosies'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pagos' ? '💰 Plan de Pagos'
              : t === 'planillas' ? '📋 Plan de Planillas'
              : t === 'base_ss' ? '🏥 Base SS'
              : `📑 Otrosíes${otrosies.length > 0 ? ` (${otrosies.length})` : ''}`}
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
            Como administrador puedes editar el valor de <strong>cualquier periodo</strong>, incluyendo históricos y radicados.
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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Mes cotización</th>
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
                        <div className="flex items-center gap-1.5">
                          <select
                            value={p.cotizacion_mes ?? p.mes}
                            onChange={(e) => guardarMes(p.id, e.target.value)}
                            disabled={guardandoMesId === p.id}
                            className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-100"
                          >
                            {MESES.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          {p.cotizacion_origen === 'confirmado' ? (
                            <span title="Confirmado por un humano" className="text-emerald-500 text-xs">✓</span>
                          ) : (
                            <span title="Sugerido por el sistema (sin verificar)" className="text-gray-300 text-xs">●</span>
                          )}
                          {(p.cotizacion_mes ?? p.mes).toLowerCase() !== p.mes.toLowerCase() && (
                            <span title="Mes vencido (difiere del mes del informe)" className="text-amber-500 text-xs">⚠️</span>
                          )}
                        </div>
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
      {tab === 'base_ss' && (() => {
        const baseAutomatica = calcularBaseCotizacionSS(contrato.valor_mensual)
        const usandoCuarentaPct = baseAutomatica > DEFAULT_BASE_COTIZACION_SS
        return (
        <div className="space-y-4">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-xs text-gray-700 space-y-1.5">
            <p className="font-semibold text-violet-900">Cálculo automático para este contrato</p>
            <p>
              Valor mensual del contrato: <span className="font-mono font-semibold">$ {contrato.valor_mensual.toLocaleString('es-CO')}</span>
            </p>
            <p>
              Base SS por defecto:{' '}
              <span className="font-mono font-bold text-violet-700">$ {baseAutomatica.toLocaleString('es-CO')}</span>
              {usandoCuarentaPct
                ? ' (40 % del valor mensual, supera el piso)'
                : ` (piso de $ ${DEFAULT_BASE_COTIZACION_SS.toLocaleString('es-CO')}; el 40 % queda por debajo)`}
            </p>
            <p className="text-gray-500 pt-1">
              Deja el campo en blanco para usar este valor. Escribe un número para sobrescribirlo en cualquier periodo (incluidos radicados e históricos).
            </p>
          </div>

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
                  const valorActual = p.base_cotizacion_ss ?? baseAutomatica
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
                            placeholder={`${baseAutomatica.toLocaleString('es-CO')}`}
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
        )
      })()}

      {/* ══ OTROSÍES ═══════════════════════════════════════════ */}
      {tab === 'otrosies' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-gray-700 space-y-1.5">
            <p className="font-semibold text-blue-900">Otrosíes del contrato</p>
            <p>
              Un otrosí modifica el contrato (valor, plazo) sin crear uno nuevo. Al registrarlo, los
              documentos (cuenta de cobro y actas) reflejarán el valor adicionado.
            </p>
            <p className="text-amber-700">
              ⚠️ Recuerda ajustar manualmente el <strong>valor mensual</strong> de los periodos afectados
              en la pestaña <strong>Plan de Pagos</strong> (desde la fecha del otrosí en adelante).
            </p>
          </div>

          {/* Lista de otrosíes */}
          {otrosies.length > 0 && (
            <div className="space-y-2">
              {otrosies.map((o) => (
                <div key={o.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">Otrosí N.° {o.numero}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{o.tipo}</span>
                      <span className="text-xs text-gray-400">Inicia: {o.fecha_inicio}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      {o.valor_adicion > 0 && <span>Adición: <strong>$ {o.valor_adicion.toLocaleString('es-CO')}</strong></span>}
                      {o.plazo_dias_adicion > 0 && <span>Plazo: <strong>{o.plazo_dias_adicion} días</strong></span>}
                      {o.cdp && <span>CDP: {o.cdp}</span>}
                      {o.crp && <span>CRP: {o.crp}</span>}
                    </div>
                    {o.nota && <p className="text-xs text-gray-500 italic mt-1.5 break-words">{o.nota}</p>}
                  </div>
                  <button
                    onClick={() => borrarOtrosi(o.id)}
                    disabled={eliminandoOtrosiId === o.id}
                    className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 disabled:opacity-50"
                  >
                    {eliminandoOtrosiId === o.id ? '…' : 'Eliminar'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario / botón */}
          {!mostrarFormOtrosi ? (
            <button
              onClick={() => setMostrarFormOtrosi(true)}
              className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              + Registrar otrosí
            </button>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-900">Nuevo otrosí</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de modificación</label>
                  <select
                    value={formOtrosi.tipo}
                    onChange={(e) => setFormOtrosi(f => ({ ...f, tipo: e.target.value as TipoOtrosi }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  >
                    <option value="adicion">Adición</option>
                    <option value="prorroga">Prórroga</option>
                    <option value="modificatorio">Modificatorio</option>
                    <option value="aclaratorio">Aclaratorio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de inicio del otrosí</label>
                  <input
                    type="date"
                    value={formOtrosi.fecha_inicio}
                    onChange={(e) => setFormOtrosi(f => ({ ...f, fecha_inicio: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valor de la adición (0 si no aplica)</label>
                  <input
                    type="text" inputMode="numeric" placeholder="11200000"
                    value={formOtrosi.valor_adicion}
                    onChange={(e) => setFormOtrosi(f => ({ ...f, valor_adicion: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Plazo adicional en días (0 = NO APLICA)</label>
                  <input
                    type="text" inputMode="numeric" placeholder="0"
                    value={formOtrosi.plazo_dias_adicion}
                    onChange={(e) => setFormOtrosi(f => ({ ...f, plazo_dias_adicion: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CDP del otrosí</label>
                  <input
                    type="text" placeholder="00402"
                    value={formOtrosi.cdp}
                    onChange={(e) => setFormOtrosi(f => ({ ...f, cdp: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CRP del otrosí</label>
                  <input
                    type="text" placeholder="00550"
                    value={formOtrosi.crp}
                    onChange={(e) => setFormOtrosi(f => ({ ...f, crp: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nota / considerando (opcional)</label>
                <textarea
                  rows={2}
                  value={formOtrosi.nota}
                  onChange={(e) => setFormOtrosi(f => ({ ...f, nota: e.target.value }))}
                  placeholder="Se adicionó el valor contractual en la suma de…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={guardarOtrosi}
                  disabled={guardandoOtrosi || !formOtrosi.fecha_inicio}
                  className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {guardandoOtrosi ? 'Guardando…' : 'Guardar otrosí'}
                </button>
                <button
                  onClick={() => setMostrarFormOtrosi(false)}
                  className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
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
