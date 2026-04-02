'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'

export default function ContratoDetallePage() {
  const { id } = useParams()
  const router = useRouter()
  const { usuario } = useUsuario()
  const [contrato, setContrato] = useState<any>(null)
  const [obligaciones, setObligaciones] = useState<any[]>([])
  const [periodos, setPeriodos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  // Form para nueva obligación
  const [nuevaObligacion, setNuevaObligacion] = useState('')
  const [esPermanente, setEsPermanente] = useState(false)
  const [agregando, setAgregando] = useState(false)

  // Form para generar periodos
  const [generandoPeriodos, setGenerandoPeriodos] = useState(false)

  async function cargarDatos() {
    const supabase = createClient()

    const { data: cont } = await supabase
      .from('contratos')
      .select(`
        *,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula, email, telefono),
        supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, cedula),
        dependencia:dependencias(nombre, abreviatura)
      `)
      .eq('id', id)
      .single()

    const { data: obls } = await supabase
      .from('obligaciones')
      .select('*')
      .eq('contrato_id', id)
      .order('orden')

    const { data: pers } = await supabase
      .from('periodos')
      .select('*')
      .eq('contrato_id', id)
      .order('numero_periodo')

    setContrato(cont)
    setObligaciones(obls || [])
    setPeriodos(pers || [])
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [id])

  async function agregarObligacion(e: React.FormEvent) {
    e.preventDefault()
    if (!nuevaObligacion.trim()) return
    setAgregando(true)

    const supabase = createClient()
    const { error } = await supabase
      .from('obligaciones')
      .insert({
        contrato_id: id,
        descripcion: nuevaObligacion.trim(),
        orden: obligaciones.length + 1,
        es_permanente: esPermanente,
      })

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      toast.success('Obligación agregada')
      setNuevaObligacion('')
      setEsPermanente(false)
      cargarDatos()
    }
    setAgregando(false)
  }

  async function eliminarObligacion(oblId: string) {
    const supabase = createClient()
    await supabase.from('obligaciones').delete().eq('id', oblId)
    toast.success('Obligación eliminada')
    cargarDatos()
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
    const supabase = createClient()

    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

    const fechaInicio = new Date(contrato.fecha_inicio + 'T00:00:00')
    const periodosNuevos = []

    for (let i = 0; i < contrato.plazo_meses; i++) {
      const fechaMes = new Date(fechaInicio)
      fechaMes.setMonth(fechaInicio.getMonth() + i)

      const mesIndex = fechaMes.getMonth()
      const anio = fechaMes.getFullYear()

      const inicioP = i === 0
        ? contrato.fecha_inicio
        : `${anio}-${String(mesIndex + 1).padStart(2, '0')}-01`

      const ultimoDia = new Date(anio, mesIndex + 1, 0).getDate()
      const finP = i === contrato.plazo_meses - 1
        ? contrato.fecha_fin
        : `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${ultimoDia}`

      periodosNuevos.push({
        contrato_id: id,
        numero_periodo: i + 1,
        mes: meses[mesIndex],
        anio: anio,
        fecha_inicio: inicioP,
        fecha_fin: finP,
        valor_cobro: contrato.valor_mensual,
        estado: 'borrador',
      })
    }

    const { error } = await supabase.from('periodos').insert(periodosNuevos)

    if (error) {
      toast.error('Error generando periodos: ' + error.message)
    } else {
      toast.success(`${periodosNuevos.length} periodos generados`)
      cargarDatos()
    }
    setGenerandoPeriodos(false)
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
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">
              ${contrato.valor_total?.toLocaleString('es-CO')}
            </p>
            <p className="text-xs text-gray-400">{contrato.valor_letras_total}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">{contrato.objeto}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-400 text-xs">Contratista</span>
            <p className="font-medium text-gray-900">{contrato.contratista?.nombre_completo}</p>
            <p className="text-xs text-gray-400">CC {contrato.contratista?.cedula}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Supervisor</span>
            <p className="font-medium text-gray-900">{contrato.supervisor?.nombre_completo}</p>
            <p className="text-xs text-gray-400">CC {contrato.supervisor?.cedula}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Plazo</span>
            <p className="font-medium text-gray-900">{contrato.plazo_meses} meses</p>
            <p className="text-xs text-gray-400">{contrato.fecha_inicio} a {contrato.fecha_fin}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Valor mensual</span>
            <p className="font-medium text-gray-900">${contrato.valor_mensual?.toLocaleString('es-CO')}</p>
            <p className="text-xs text-gray-400">{contrato.valor_letras_mensual}</p>
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
            {obligaciones.map((obl, index) => (
              <div key={obl.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl group">
                <span className="text-xs font-medium text-gray-400 mt-0.5 min-w-[20px]">{index + 1}.</span>
                <p className="flex-1 text-sm text-gray-700">{obl.descripcion}</p>
                <div className="flex items-center gap-2">
                  {obl.es_permanente && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Permanente</span>
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
            ))}
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
              <label className="flex items-center gap-2 mt-2 ml-1">
                <input
                  type="checkbox"
                  checked={esPermanente}
                  onChange={(e) => setEsPermanente(e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs text-gray-500">Es actividad permanente</span>
              </label>
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
            {periodos.map((periodo) => (
              <Link
                key={periodo.id}
                href={`/dashboard/contratos/${id}/periodo/${periodo.id}`}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white border rounded-lg flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-600">{periodo.numero_periodo}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {periodo.mes} {periodo.anio}
                    </p>
                    <p className="text-xs text-gray-400">
                      {periodo.fecha_inicio} al {periodo.fecha_fin}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-gray-900">
                    ${periodo.valor_cobro?.toLocaleString('es-CO')}
                  </p>
                  {periodo.es_historico && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
                      🔒 Histórico
                    </span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${estadoColor[periodo.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {estadoLabel[periodo.estado] || periodo.estado}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
