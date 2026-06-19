'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import { formatCedula, formatDateMedium } from '@/lib/format'
import { calcularDistribucionPeriodos } from '@/services/contratos'
import { crearObligacion, eliminarObligacion as eliminarObligacionAction } from '@/app/actions/obligaciones'
import { generarPeriodos as generarPeriodosAction } from '@/app/actions/contratos'
import { getOtrosies, type Otrosi } from '@/app/actions/otrosies'

export default function ContratoDetallePage({
  initialContrato,
  initialObligaciones,
  initialPeriodos,
}: {
  initialContrato: any
  initialObligaciones: any[]
  initialPeriodos: any[]
}) {
  const { id } = useParams()
  const router = useRouter()
  const { usuario } = useUsuario()

  // Data is pre-fetched server-side — no client fetch needed on mount.
  // cargarDatos() is still called explicitly after mutations.
  const [contrato, setContrato] = useState<any>(initialContrato)
  const [obligaciones, setObligaciones] = useState<any[]>(initialObligaciones)
  const [periodos, setPeriodos] = useState<any[]>(initialPeriodos)
  const [cargando, setCargando] = useState(false)

  // Form para nueva obligación
  const [nuevaObligacion, setNuevaObligacion] = useState('')
  const [esPermanente, setEsPermanente] = useState(false)
  const [otrosiIdNuevaObl, setOtrosiIdNuevaObl] = useState<string>('')
  const [agregando, setAgregando] = useState(false)

  // Otrosíes del contrato (para asociar obligaciones)
  const [otrosies, setOtrosies] = useState<Otrosi[]>([])

  // Form para generar periodos
  const [generandoPeriodos, setGenerandoPeriodos] = useState(false)


  async function cargarDatos() {
    try {
      const supabase = createClient()

      // Run all three queries in parallel for speed.
      // Wrapped in try/finally so setCargando(false) is guaranteed even on error —
      // previously a failed query left cargando=true forever (infinite loading screen).
      const [{ data: cont }, { data: obls }, { data: pers }] = await Promise.all([
        supabase
          .from('contratos')
          .select(`
            *,
            contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula, email, telefono),
            supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, cedula),
            dependencia:dependencias(nombre, abreviatura)
          `)
          .eq('id', id)
          .single(),

        supabase
          .from('obligaciones')
          .select('*')
          .eq('contrato_id', id)
          .order('orden'),

        supabase
          .from('periodos')
          .select('*')
          .eq('contrato_id', id)
          .order('numero_periodo'),
      ])

      setContrato(cont)
      setObligaciones(obls || [])
      setPeriodos(pers || [])
      try {
        setOtrosies(await getOtrosies(id as string))
      } catch { /* no bloquea la carga del resto */ }
    } catch {
      // Queries failed — contrato stays null, render shows "Contrato no encontrado"
    } finally {
      setCargando(false)
    }
  }

  // No initial useEffect — data arrives as SSR props from page.tsx.
  // cargarDatos() is called explicitly after mutations (agregarObligacion, etc.).

  async function agregarObligacion(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevaObligacion.trim()) return
    setAgregando(true)

    // Server Action: la autorización se valida server-side (cookies httpOnly),
    // sin depender de que la sesión del navegador esté caliente.
    const res = await crearObligacion({
      contratoId: id as string,
      descripcion: nuevaObligacion,
      esPermanente,
      otrosiId: otrosiIdNuevaObl || null,
    })

    if (res.error) {
      toast.error('Error: ' + res.error)
    } else {
      toast.success('Obligación agregada')
      setNuevaObligacion('')
      setEsPermanente(false)
      setOtrosiIdNuevaObl('')
      cargarDatos()
    }
    setAgregando(false)
  }

  async function eliminarObligacion(oblId: string) {
    const res = await eliminarObligacionAction(oblId, id as string)
    if (res.error) {
      toast.error('Error: ' + res.error)
    } else {
      toast.success('Obligación eliminada')
      cargarDatos()
    }
  }

  async function generarPeriodos() {
    if (periodos.length > 0) {
      toast.error('Los periodos ya fueron generados')
      return
    }
    if (obligaciones.length === 0) {
      toast.error('Agrega al menos una obligación antes de generar periodos')
      return
    }

    setGenerandoPeriodos(true)

    // Distribución automática con primer/último mes proporcional y residuo ajustado
    // al último periodo para que sum(valor_cobro) === valor_total. (Cálculo puro,
    // sin acceso a BD → se hace en cliente y se envía al servidor para insertar.)
    const distribucion = calcularDistribucionPeriodos({
      fechaInicio: contrato.fecha_inicio,
      fechaFin: contrato.fecha_fin,
      valorTotal: contrato.valor_total,
      valorMensual: contrato.valor_mensual,
    })

    if (distribucion.length === 0) {
      toast.error('Rango de fechas inválido')
      setGenerandoPeriodos(false)
      return
    }

    const now = new Date()
    const periodosNuevos = distribucion.map((p) => ({
      numero_periodo: p.numero,
      mes: p.mes,
      anio: p.anio,
      fecha_inicio: p.fechaInicio,
      fecha_fin: p.fechaFin,
      valor_cobro: p.valorCobro,
      es_historico:
        p.anio < now.getFullYear() ||
        (p.anio === now.getFullYear() && p.mesIndex < now.getMonth()),
    }))

    // Server Action: autorización admin server-side, sin depender de la sesión
    // del navegador. try/finally garantiza que el botón nunca quede colgado.
    try {
      const res = await generarPeriodosAction(id as string, periodosNuevos)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(`${res.data!.generados} periodos generados`)
        cargarDatos()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setGenerandoPeriodos(false)
    }
  }

  const estadoColor: Record<string, string> = {
    borrador: 'bg-gray-100 text-gray-600',
    enviado: 'bg-blue-100 text-blue-700',
    revision_supervisor: 'bg-purple-100 text-purple-700',
    revision_asesor: 'bg-orange-100 text-orange-700',
    revision_gobierno: 'bg-cyan-100 text-cyan-700',
    revision_hacienda: 'bg-amber-100 text-amber-700',
    aprobado: 'bg-green-100 text-green-700',
    rechazado: 'bg-red-100 text-red-700',
    pagado: 'bg-emerald-100 text-emerald-800',
  }

  const estadoLabel: Record<string, string> = {
    borrador: 'Borrador',
    enviado: 'Enviado',
    revision_supervisor: 'Rev. Supervisor',
    revision_asesor: 'Rev. Asesor',
    revision_gobierno: 'Rev. Gobierno',
    revision_hacienda: 'Rev. Hacienda',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    pagado: 'Pagado',
  }

  if (cargando) return <p className="text-gray-500">Cargando contrato...</p>
  if (!contrato) return <p className="text-red-500">Contrato no encontrado</p>

  const esAdmin = usuario?.rol === 'admin'

  return (
    <div className="max-w-4xl">
      <Toaster position="top-center" richColors />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/contratos" className="hover:text-gray-600">
          {esAdmin ? 'Contratos' : 'Mis contratos'}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">N.º {contrato.numero}</span>
      </div>

      {/* Header del contrato */}
      <div className="bg-white rounded-2xl border p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Contrato N.º {contrato.numero}</h2>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {contrato.dependencia?.nombre}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">
                ${contrato.valor_total?.toLocaleString('es-CO')}
              </p>
              <p className="text-xs text-gray-400">{contrato.valor_letras_total}</p>
            </div>
            {esAdmin && (
              <Link
                href={`/dashboard/contratos/${id}/avanzado`}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors bg-white"
              >
                ⚙️ Opciones avanzadas
              </Link>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">{contrato.objeto}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="min-w-0">
            <span className="text-gray-400 text-xs">Contratista</span>
            <p className="font-medium text-gray-900 truncate">{contrato.contratista?.nombre_completo}</p>
            <p className="text-xs text-gray-400">CC {formatCedula(contrato.contratista?.cedula)}</p>
          </div>
          <div className="min-w-0">
            <span className="text-gray-400 text-xs">Supervisor</span>
            <p className="font-medium text-gray-900 truncate">{contrato.supervisor?.nombre_completo}</p>
            <p className="text-xs text-gray-400">CC {formatCedula(contrato.supervisor?.cedula)}</p>
          </div>
          <div className="min-w-0">
            <span className="text-gray-400 text-xs">Plazo</span>
            <p className="font-medium text-gray-900">{contrato.plazo_meses} meses</p>
            <p className="text-xs text-gray-400">{formatDateMedium(contrato.fecha_inicio)} — {formatDateMedium(contrato.fecha_fin)}</p>
          </div>
          <div className="min-w-0">
            <span className="text-gray-400 text-xs">Valor mensual</span>
            <p className="font-medium text-gray-900">${contrato.valor_mensual?.toLocaleString('es-CO')}</p>
            <p className="text-xs text-gray-400 truncate">{contrato.valor_letras_mensual}</p>
          </div>
        </div>

        {(contrato.cdp || contrato.crp) && usuario?.rol !== 'contratista' && (
          <div className="grid grid-cols-2 gap-4 text-sm mt-4 pt-4 border-t border-gray-100">
            <div>
              <span className="text-gray-400 text-xs">No. CDP</span>
              <p className="font-medium text-gray-900">{contrato.cdp || '—'}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">No. CRP</span>
              <p className="font-medium text-gray-900">{contrato.crp || '—'}</p>
            </div>
          </div>
        )}

        {contrato.secop_url && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <span className="text-gray-400 text-xs">Enlace SECOP II</span>
            <a
              href={contrato.secop_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 mt-1 text-sm text-blue-600 hover:text-blue-800 hover:underline truncate"
            >
              🔗 Ver contrato en SECOP II
            </a>
          </div>
        )}
      </div>

      {/* Obligaciones */}
      <div className="bg-white rounded-2xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
            Obligaciones específicas ({obligaciones.length})
          </h3>
        </div>

        {obligaciones.length > 0 && (
          <div className="space-y-2 mb-6">
            {obligaciones.map((obl, index) => {
              const otrosiVinculado = obl.otrosi_id
                ? otrosies.find((o) => o.id === obl.otrosi_id)
                : null
              return (
                <div key={obl.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl group min-w-0">
                  <span className="text-xs font-medium text-gray-400 mt-0.5 min-w-[20px]">{index + 1}.</span>
                  <p className="flex-1 min-w-0 text-sm text-gray-700 break-words">{obl.descripcion}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {obl.es_permanente && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Permanente</span>
                    )}
                    {otrosiVinculado && (
                      <span
                        title={`Vigente desde el otrosí N.° ${otrosiVinculado.numero} (${otrosiVinculado.fecha_inicio})`}
                        className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"
                      >
                        Otrosí {otrosiVinculado.numero}
                      </span>
                    )}
                    {esAdmin && (
                      <button
                        onClick={() => eliminarObligacion(obl.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Solo admin puede agregar obligaciones */}
        {esAdmin && (
          <form onSubmit={agregarObligacion} className="flex gap-2">
            <div className="flex-1">
              <input
                value={nuevaObligacion}
                onChange={(e) => setNuevaObligacion(e.target.value)}
                placeholder="Escribir nueva obligación..."
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none"
              />
              <div className="flex flex-wrap items-center gap-4 mt-2 ml-1">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={esPermanente}
                    onChange={(e) => setEsPermanente(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-gray-500">Es actividad permanente</span>
                </label>
                {otrosies.length > 0 && (
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Incorporada mediante:</span>
                    <select
                      value={otrosiIdNuevaObl}
                      onChange={(e) => setOtrosiIdNuevaObl(e.target.value)}
                      className="px-2 py-0.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-400 outline-none"
                    >
                      <option value="">Contrato original</option>
                      {otrosies.map((o) => (
                        <option key={o.id} value={o.id}>
                          Otrosí N.° {o.numero} ({o.fecha_inicio})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={agregando || !nuevaObligacion.trim()}
              className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 self-start"
            >
              Agregar
            </button>
          </form>
        )}

        {!esAdmin && obligaciones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            El administrador aún no ha definido las obligaciones de este contrato.
          </p>
        )}
      </div>

      {/* Periodos de pago */}
      <div className="bg-white rounded-2xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
            Periodos de pago ({periodos.length})
          </h3>
          {esAdmin && periodos.length === 0 && obligaciones.length > 0 && (
            <button
              onClick={generarPeriodos}
              disabled={generandoPeriodos}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {generandoPeriodos ? 'Generando...' : 'Generar periodos automáticamente'}
            </button>
          )}
        </div>

        {periodos.length === 0 && esAdmin && obligaciones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            Agrega las obligaciones del contrato primero, luego genera los periodos.
          </p>
        )}

        {periodos.length === 0 && esAdmin && obligaciones.length > 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            Haz clic en "Generar periodos automáticamente" para crear los {contrato.plazo_meses} periodos mensuales.
          </p>
        )}

        {periodos.length === 0 && !esAdmin && (
          <p className="text-sm text-gray-400 text-center py-6">
            Los periodos de pago aún no han sido generados por el administrador.
          </p>
        )}

        {periodos.length > 0 && (
          <div className="space-y-2">
            {periodos.map((periodo: any) => (
              <Link
                key={periodo.id}
                href={`/dashboard/contratos/${id}/periodo/${periodo.id}`}
                className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                {/* Número de periodo */}
                <div className="w-10 h-10 bg-white border rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-gray-600">{periodo.numero_periodo}</span>
                </div>

                {/* Mes + fechas */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{periodo.mes} {periodo.anio}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {formatDateMedium(periodo.fecha_inicio)} — {formatDateMedium(periodo.fecha_fin)}
                  </p>
                </div>

                {/* Valor + estado (apilados) */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <p className="text-sm font-semibold text-gray-900">
                    ${periodo.valor_cobro?.toLocaleString('es-CO')}
                  </p>
                  {periodo.es_historico ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                      Histórico
                    </span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColor[periodo.estado] || 'bg-gray-100 text-gray-600'}`}>
                      {estadoLabel[periodo.estado] || periodo.estado}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
