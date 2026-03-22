'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'

// Qué estado ve cada rol para poder revisar
const estadoQueRevisa: Record<string, string> = {
  supervisor: 'enviado',
  asesor: 'revision_asesor',
  gobierno: 'revision_gobierno',
  hacienda: 'revision_hacienda',
}

// Al aprobar, a qué estado pasa
const estadoSiguiente: Record<string, string> = {
  enviado: 'revision_asesor',
  revision_asesor: 'revision_gobierno',
  revision_gobierno: 'revision_hacienda',
  revision_hacienda: 'aprobado',
}

// Quién aprobó en cada transición
const labelAprobador: Record<string, string> = {
  enviado: 'Supervisor',
  revision_asesor: 'Asesor jurídico',
  revision_gobierno: 'Gobierno',
  revision_hacienda: 'Hacienda',
}

export default function PeriodoDetallePage() {
  const { id: contratoId, periodoId } = useParams()
  const { usuario } = useUsuario()
  const supabase = createClient()

  const [contrato, setContrato] = useState<any>(null)
  const [periodo, setPeriodo] = useState<any>(null)
  const [obligaciones, setObligaciones] = useState<any[]>([])
  const [actividades, setActividades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  // Panel de aprobación
  const [aprobando, setAprobando] = useState(false)
  const [mostrarRechazo, setMostrarRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [rechazando, setRechazando] = useState(false)

  // Form para nueva actividad
  const [formActivo, setFormActivo] = useState<string | null>(null)
  const [nuevaActividad, setNuevaActividad] = useState('')
  const [nuevaCantidad, setNuevaCantidad] = useState(1)
  const [guardando, setGuardando] = useState(false)

  async function cargarDatos() {
    const { data: cont } = await supabase
      .from('contratos')
      .select(`
        *,
        contratista:usuarios!contratos_contratista_id_fkey(nombre_completo, cedula),
        supervisor:usuarios!contratos_supervisor_id_fkey(nombre_completo, id),
        dependencia:dependencias(nombre)
      `)
      .eq('id', contratoId)
      .single()

    const { data: per } = await supabase
      .from('periodos')
      .select('*')
      .eq('id', periodoId)
      .single()

    const { data: obls } = await supabase
      .from('obligaciones')
      .select('*')
      .eq('contrato_id', contratoId)
      .order('orden')

    const { data: acts } = await supabase
      .from('actividades')
      .select('*, evidencias(*)')
      .eq('periodo_id', periodoId)
      .order('orden')

    setContrato(cont)
    setPeriodo(per)
    setObligaciones(obls || [])
    setActividades(acts || [])
    setCargando(false)
  }

  useEffect(() => { cargarDatos() }, [contratoId, periodoId])

  function actividadesPorObligacion(obligacionId: string) {
    return actividades.filter(a => a.obligacion_id === obligacionId)
  }

  function totalActividades() {
    return actividades.reduce((sum, a) => sum + (a.cantidad || 1), 0)
  }

  async function agregarActividad(obligacionId: string) {
    if (!nuevaActividad.trim()) return
    setGuardando(true)

    const { error } = await supabase
      .from('actividades')
      .insert({
        periodo_id: periodoId,
        obligacion_id: obligacionId,
        descripcion: nuevaActividad.trim(),
        cantidad: nuevaCantidad,
        orden: actividadesPorObligacion(obligacionId).length + 1,
      })

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      toast.success('Actividad registrada')
      setNuevaActividad('')
      setNuevaCantidad(1)
      setFormActivo(null)
      cargarDatos()
    }
    setGuardando(false)
  }

  async function eliminarActividad(actId: string) {
    await supabase.from('actividades').delete().eq('id', actId)
    toast.success('Actividad eliminada')
    cargarDatos()
  }

  async function subirEvidencia(actividadId: string, file: File) {
    const ext = file.name.split('.').pop()
    const path = `evidencias/${periodoId}/${actividadId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('evidencias')
      .upload(path, file)

    if (uploadError) {
      toast.error('Error subiendo imagen: ' + uploadError.message)
      return
    }

    const { data: urlData } = supabase.storage.from('evidencias').getPublicUrl(path)

    await supabase.from('evidencias').insert({
      actividad_id: actividadId,
      url: urlData.publicUrl,
      nombre_archivo: file.name,
    })

    toast.success('Evidencia subida')
    cargarDatos()
  }

  async function eliminarEvidencia(evId: string) {
    await supabase.from('evidencias').delete().eq('id', evId)
    toast.success('Evidencia eliminada')
    cargarDatos()
  }

  async function enviarARevision() {
    if (actividades.length === 0) {
      toast.error('Registra al menos una actividad antes de enviar')
      return
    }

    setEnviando(true)
    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'enviado', fecha_envio: new Date().toISOString() })
      .eq('id', periodoId)

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      toast.success('Periodo enviado a revisión')
      cargarDatos()
    }
    setEnviando(false)
  }

  async function aprobarPeriodo() {
    if (!periodo) return
    setAprobando(true)

    const siguienteEstado = estadoSiguiente[periodo.estado]
    if (!siguienteEstado) {
      toast.error('Estado no reconocido')
      setAprobando(false)
      return
    }

    const { error } = await supabase
      .from('periodos')
      .update({ estado: siguienteEstado })
      .eq('id', periodoId)

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      const aprobador = labelAprobador[periodo.estado]
      const esUltimo = siguienteEstado === 'aprobado'
      toast.success(esUltimo ? 'Periodo aprobado definitivamente' : `Aprobado por ${aprobador}, pasa a siguiente revisión`)
      cargarDatos()
    }
    setAprobando(false)
  }

  async function rechazarPeriodo() {
    if (!motivoRechazo.trim()) {
      toast.error('Escribe el motivo del rechazo')
      return
    }
    setRechazando(true)

    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'rechazado', motivo_rechazo: motivoRechazo.trim() })
      .eq('id', periodoId)

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      toast.success('Periodo rechazado')
      setMostrarRechazo(false)
      setMotivoRechazo('')
      cargarDatos()
    }
    setRechazando(false)
  }

  async function marcarPagado() {
    const { error } = await supabase
      .from('periodos')
      .update({ estado: 'pagado' })
      .eq('id', periodoId)

    if (error) {
      toast.error('Error: ' + error.message)
    } else {
      toast.success('Periodo marcado como pagado')
      cargarDatos()
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

  const esEditable = periodo?.estado === 'borrador' || periodo?.estado === 'rechazado'

  // Determinar si el usuario actual puede aprobar/rechazar este periodo
  const puedeRevisar = (() => {
    if (!usuario || !periodo) return false
    if (usuario.rol === 'admin') return ['enviado', 'revision_asesor', 'revision_gobierno', 'revision_hacienda'].includes(periodo.estado)
    const estadoEsperado = estadoQueRevisa[usuario.rol]
    return estadoEsperado === periodo.estado
  })()

  if (cargando) return <p className="text-gray-500">Cargando periodo...</p>

  return (
    <div className="max-w-4xl">
      <Toaster position="top-center" richColors />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/contratos" className="hover:text-gray-600">Contratos</Link>
        <span>/</span>
        <Link href={`/dashboard/contratos/${contratoId}`} className="hover:text-gray-600">
          N.º {contrato?.numero}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{periodo?.mes} {periodo?.anio}</span>
      </div>

      {/* Header del periodo */}
      <div className="bg-white rounded-2xl border p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {periodo?.mes} {periodo?.anio}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Periodo {periodo?.numero_periodo} — Del {periodo?.fecha_inicio} al {periodo?.fecha_fin}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Contrato N.º {contrato?.numero} — {contrato?.contratista?.nombre_completo}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-block text-xs px-3 py-1 rounded-full font-medium ${estadoColor[periodo?.estado] || ''}`}>
              {estadoLabel[periodo?.estado] || periodo?.estado}
            </span>
            <p className="text-lg font-bold text-gray-900 mt-2">
              ${periodo?.valor_cobro?.toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className="text-gray-400">Actividades registradas:</span>
          <span className="font-medium text-gray-900">{actividades.length}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">Total acciones:</span>
          <span className="font-medium text-gray-900">{totalActividades()}</span>
        </div>

        {/* Mensaje si fue rechazado */}
        {periodo?.estado === 'rechazado' && periodo?.motivo_rechazo && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-medium text-red-800">Motivo del rechazo:</p>
            <p className="text-sm text-red-700 mt-1">{periodo.motivo_rechazo}</p>
          </div>
        )}
      </div>

      {/* Panel de aprobación — solo visible para el revisor correspondiente */}
      {puedeRevisar && (
        <div className="bg-white rounded-2xl border border-amber-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
              <span className="text-base">🔍</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Este periodo requiere tu revisión</h3>
              <p className="text-xs text-gray-400">
                Revisa las actividades y evidencias antes de aprobar o rechazar.
              </p>
            </div>
          </div>

          {!mostrarRechazo ? (
            <div className="flex gap-3">
              <button
                onClick={aprobarPeriodo}
                disabled={aprobando}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {aprobando ? 'Aprobando...' : '✓ Aprobar'}
              </button>
              <button
                onClick={() => setMostrarRechazo(true)}
                className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
              >
                ✕ Rechazar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Escribe el motivo del rechazo..."
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={rechazarPeriodo}
                  disabled={rechazando || !motivoRechazo.trim()}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {rechazando ? 'Rechazando...' : 'Confirmar rechazo'}
                </button>
                <button
                  onClick={() => { setMostrarRechazo(false); setMotivoRechazo('') }}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botón pagado — solo admin/hacienda cuando está aprobado */}
      {periodo?.estado === 'aprobado' && (usuario?.rol === 'admin' || usuario?.rol === 'hacienda') && (
        <div className="bg-white rounded-2xl border border-green-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Periodo aprobado</h3>
              <p className="text-sm text-gray-500 mt-1">
                Marca el pago como realizado cuando hayas transferido el valor al contratista.
              </p>
            </div>
            <button
              onClick={marcarPagado}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Marcar como pagado
            </button>
          </div>
        </div>
      )}

      {/* Obligaciones con actividades */}
      <div className="space-y-4 mb-6">
        {obligaciones.map((obl, oblIndex) => {
          const actsDeObl = actividadesPorObligacion(obl.id)
          return (
            <div key={obl.id} className="bg-white rounded-2xl border p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="w-7 h-7 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-white">{oblIndex + 1}</span>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{obl.descripcion}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {actsDeObl.length} actividad{actsDeObl.length !== 1 ? 'es' : ''} registrada{actsDeObl.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Actividades registradas */}
              {actsDeObl.length > 0 && (
                <div className="space-y-3 mb-4 ml-10">
                  {actsDeObl.map((act, actIndex) => (
                    <div key={act.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-gray-400">{actIndex + 1}.</span>
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                              {act.cantidad} {act.cantidad === 1 ? 'acción' : 'acciones'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{act.descripcion}</p>
                        </div>
                        {esEditable && (
                          <button
                            onClick={() => eliminarActividad(act.id)}
                            className="text-gray-300 hover:text-red-500 text-xs ml-2"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Evidencias */}
                      <div className="mt-3">
                        {act.evidencias && act.evidencias.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {act.evidencias.map((ev: any) => (
                              <div key={ev.id} className="relative group">
                                <img
                                  src={ev.url}
                                  alt={ev.nombre_archivo}
                                  className="w-20 h-20 object-cover rounded-lg border"
                                />
                                {esEditable && (
                                  <button
                                    onClick={() => eliminarEvidencia(ev.id)}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {esEditable && (
                          <label className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Subir evidencia
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) subirEvidencia(act.id, file)
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Form para agregar actividad */}
              {esEditable && (
                <div className="ml-10">
                  {formActivo === obl.id ? (
                    <div className="bg-blue-50 rounded-xl p-4">
                      <textarea
                        value={nuevaActividad}
                        onChange={(e) => setNuevaActividad(e.target.value)}
                        placeholder="Describe la actividad realizada..."
                        rows={3}
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                      />
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">Cantidad:</label>
                          <input
                            type="number"
                            min={1}
                            value={nuevaCantidad}
                            onChange={(e) => setNuevaCantidad(parseInt(e.target.value) || 1)}
                            className="w-16 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-center"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setFormActivo(null); setNuevaActividad(''); setNuevaCantidad(1) }}
                            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => agregarActividad(obl.id)}
                            disabled={guardando || !nuevaActividad.trim()}
                            className="bg-gray-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          >
                            {guardando ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setFormActivo(obl.id)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      + Agregar actividad
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botón de enviar (contratista) */}
      {esEditable && (
        <div className="bg-white rounded-2xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">¿Listo para enviar?</h3>
              <p className="text-sm text-gray-500 mt-1">
                Al enviar, el supervisor recibirá este periodo para revisión.
              </p>
            </div>
            <button
              onClick={enviarARevision}
              disabled={enviando || actividades.length === 0}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 flex-shrink-0"
            >
              {enviando ? 'Enviando...' : 'Enviar a revisión'}
            </button>
          </div>
        </div>
      )}

      {/* Estado no editable y sin acciones */}
      {!esEditable && !puedeRevisar && periodo?.estado !== 'aprobado' && periodo?.estado !== 'pagado' && (
        <div className="bg-gray-50 rounded-2xl border p-6 text-center">
          <p className="text-sm text-gray-500">
            Este periodo está en estado <strong>{estadoLabel[periodo?.estado]}</strong> y está siendo revisado por la instancia correspondiente.
          </p>
        </div>
      )}

      {periodo?.estado === 'pagado' && (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 text-center">
          <p className="text-lg font-bold text-emerald-700">Periodo pagado</p>
          <p className="text-sm text-emerald-600 mt-1">
            El pago de ${periodo?.valor_cobro?.toLocaleString('es-CO')} fue procesado exitosamente.
          </p>
        </div>
      )}
    </div>
  )
}
