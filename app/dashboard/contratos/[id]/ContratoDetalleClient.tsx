'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { useUsuario } from '@/lib/user-context'
import { formatCedula, formatDateMedium } from '@/lib/format'
import { calcularDistribucionPeriodos } from '@/services/contratos'
import { crearObligacion, eliminarObligacion as eliminarObligacionAction, actualizarObligacion } from '@/app/actions/obligaciones'
import { generarPeriodos as generarPeriodosAction } from '@/app/actions/contratos'
import { getOtrosies, type Otrosi } from '@/app/actions/otrosies'
import { esGestorContratos } from '@/lib/constants'
import { totalConAdiciones, valorPorPeriodo, pesos } from '@/lib/valor-contrato'
import { etiquetaEstado } from '@/lib/estado-contrato'
import ExpedienteContrato from './ExpedienteContrato'
import CopiarObligaciones from './CopiarObligaciones'
import type { DocumentoContratoDTO } from '@/lib/documentos-contrato'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

export default function ContratoDetallePage({
  initialContrato,
  initialObligaciones,
  initialPeriodos,
  initialDocumentos = [],
}: {
  initialContrato: any
  initialObligaciones: any[]
  initialPeriodos: any[]
  initialDocumentos?: DocumentoContratoDTO[]
}) {
  const { id } = useParams()
  const router = useRouter()
  const { usuario } = useUsuario()

  // Los datos llegan como props SSR desde page.tsx. Tras cada mutación la
  // pantalla se actualiza con la fila que devuelve la propia acción, sin
  // volver a consultar: es instantáneo y no depende de que la sesión del
  // navegador esté caliente.
  const [contrato, setContrato] = useState<any>(initialContrato)
  const [obligaciones, setObligaciones] = useState<any[]>(initialObligaciones)
  const [periodos, setPeriodos] = useState<any[]>(initialPeriodos)

  // Form para nueva obligación
  const [nuevaObligacion, setNuevaObligacion] = useState('')
  const [esPermanente, setEsPermanente] = useState(false)
  const [otrosiIdNuevaObl, setOtrosiIdNuevaObl] = useState<string>('')
  const [agregando, setAgregando] = useState(false)

  // Edición en línea de una obligación
  const [editandoOblId, setEditandoOblId] = useState<string | null>(null)
  const [textoEdicion, setTextoEdicion] = useState('')
  const [permanenteEdicion, setPermanenteEdicion] = useState(false)
  const [guardandoObl, setGuardandoObl] = useState(false)

  // Otrosíes del contrato (para asociar obligaciones)
  const [otrosies, setOtrosies] = useState<Otrosi[]>([])

  // Form para generar periodos
  const [generandoPeriodos, setGenerandoPeriodos] = useState(false)


  /**
   * Otrosíes del contrato — alimentan el selector al crear una obligación y
   * el distintivo "Otrosí N" de las ya creadas.
   *
   * Se cargan al montar. Antes solo se pedían dentro de la recarga posterior a
   * una mutación, de modo que al abrir el contrato la lista estaba vacía y el
   * selector no ofrecía ningún otrosí hasta que se guardaba algo.
   */
  useEffect(() => {
    let vivo = true
    getOtrosies(id as string)
      .then(o => { if (vivo) setOtrosies(o) })
      .catch(() => { /* el resto de la pantalla no depende de esto */ })
    return () => { vivo = false }
  }, [id])

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
      // La acción devuelve la fila creada, así que la lista se actualiza en el
      // mismo instante en que aparece el aviso de éxito. Antes se lanzaba una
      // reconsulta al servidor y el usuario veía "Obligación agregada" sobre
      // una lista todavía sin ella.
      if (res.data) setObligaciones(prev => [...prev, res.data!])
      toast.success('Obligación agregada')
      setNuevaObligacion('')
      setEsPermanente(false)
      setOtrosiIdNuevaObl('')
    }
    setAgregando(false)
  }

  function abrirEdicionObligacion(obl: { id: string; descripcion: string; es_permanente: boolean }) {
    setEditandoOblId(obl.id)
    setTextoEdicion(obl.descripcion)
    setPermanenteEdicion(obl.es_permanente)
  }

  async function guardarObligacion(oblId: string) {
    setGuardandoObl(true)
    const res = await actualizarObligacion({
      obligacionId: oblId,
      contratoId: id as string,
      descripcion: textoEdicion,
      esPermanente: permanenteEdicion,
    })
    setGuardandoObl(false)
    if (res.error) { toast.error(res.error); return }
    // Se pinta con lo que devolvió el servidor —ya normalizado— en vez de con
    // lo que quedó en el formulario.
    setObligaciones(prev => prev.map(o =>
      o.id === oblId ? { ...o, descripcion: res.data!.descripcion, es_permanente: res.data!.es_permanente } : o,
    ))
    setEditandoOblId(null)
    toast.success('Obligación actualizada')
  }

  async function eliminarObligacion(oblId: string) {
    const res = await eliminarObligacionAction(oblId, id as string)
    if (res.error) {
      toast.error('Error: ' + res.error)
      return
    }
    setObligaciones(prev => prev.filter(o => o.id !== oblId))
    toast.success('Obligación eliminada')
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
        // Mismos periodos que acaba de insertar el servidor, con su id real:
        // la tabla se llena sin una segunda vuelta a la base de datos.
        setPeriodos(res.data!.periodos)
        toast.success(`${res.data!.periodos.length} periodos generados`)
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

  if (!contrato) return <p className="text-red-500">Contrato no encontrado</p>

  // Admin y contratación gestionan el contrato por igual: definir obligaciones,
  // generar periodos y registrar otrosíes. El backend ya lo autorizaba; esta
  // pantalla era lo único que lo impedía.
  const esGestor = esGestorContratos(usuario?.rol)

  // Las dos cifras de dinero del encabezado se derivan; no se leen de la fila
  // del contrato. `valor_total` no incluye los otrosíes de adición y
  // `valor_mensual` supone que todos los meses se cobra lo mismo, que es falso
  // en cuanto un contrato empieza a mitad de mes. Ver lib/valor-contrato.ts.
  const valorContrato = totalConAdiciones(contrato.valor_total, otrosies)
  const porPeriodo = valorPorPeriodo(periodos)
  // Los periodos en blanco se nombran: si no, un contrato con diez periodos sin
  // cargar se describiría por los dos que sí tienen valor.
  const pendientes = porPeriodo.clase === 'sin-periodos' ? 0 : porPeriodo.sinValor
  const sufijo = pendientes > 0 ? ` · ${pendientes} sin valor` : ''
  const cobro =
    porPeriodo.clase === 'uniforme'
      ? { monto: pesos(porPeriodo.valor),
          nota: `Igual en los ${porPeriodo.periodos} periodos${sufijo}` }
      : porPeriodo.clase === 'variable'
        ? { monto: `${pesos(porPeriodo.minimo)} – ${pesos(porPeriodo.maximo)}`,
            nota: `Varía entre los ${porPeriodo.periodos} periodos${sufijo}` }
        : { monto: '—', nota: 'Sin periodos generados' }

  return (
    <div className="max-w-4xl">
      <Toaster position="top-center" richColors />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard/contratos" className="hover:text-gray-600">
          {esGestor ? 'Contratos' : 'Mis contratos'}
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
              <p className="text-lg font-bold text-gray-900">{pesos(valorContrato.total)}</p>
              {/* Con adiciones, el valor en letras del contrato quedó obsoleto:
                  corresponde a lo firmado, no a lo que vale hoy. Se sustituye
                  por lo que explica la diferencia. */}
              <p className="text-xs text-gray-400">
                {valorContrato.adiciones > 0
                  ? `Incluye ${pesos(valorContrato.adiciones)} en adiciones`
                  : contrato.valor_letras_total}
              </p>
            </div>
            {esGestor && (
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/contratos/${id}/editar`}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors bg-white"
                >
                  <Icono glifo={Iconos.accion.editar} tamano="sm" />
                  Editar
                </Link>
                <Link
                  href={`/dashboard/contratos/${id}/avanzado`}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors bg-white"
                >
                  {/* Contratación solo encuentra otrosíes al otro lado del
                      enlace; nombrarlo "Opciones avanzadas" prometería de más. */}
                  <Icono
                    glifo={usuario?.rol === 'contratacion' ? Iconos.documentos.paquete : Iconos.navegacion.configuracion}
                    tamano="sm"
                  />
                  {usuario?.rol === 'contratacion' ? 'Otrosíes' : 'Opciones avanzadas'}
                </Link>
              </div>
            )}
          </div>
        </div>

        {(() => {
          const e = etiquetaEstado(contrato.estado, contrato.fecha_fin)
          return (
            <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border mb-3 ${e.color}`}>
              {e.label}
            </span>
          )
        })()}

        <p className="text-sm text-gray-600 mb-4">{contrato.objeto}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="min-w-0">
            <span className="text-gray-400 text-xs">Contratista</span>
            <p className="font-medium text-gray-900 truncate">{contrato.contratista?.nombre_completo}</p>
            <p className="text-xs text-gray-400">CC {formatCedula(contrato.contratista?.cedula)}</p>
            {/* Decide si el cobro se documenta con Cuenta de Cobro o con
                factura electrónica. Solo se marca cuando está confirmado:
                un dato sin verificar no debe parecer una respuesta. */}
            {contrato.contratista?.obligado_facturar_electronicamente === true && (
              <span className="inline-block mt-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                Factura electrónica
              </span>
            )}
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
            {/* Antes decía «Valor mensual» y mostraba `contrato.valor_mensual`.
                En los contratos que no lo tienen cargado salía «$0», y en los
                que empiezan a mitad de mes escondía que el primer periodo se
                cobra proporcional. */}
            <span className="text-gray-400 text-xs">Valor por periodo</span>
            <p className="font-medium text-gray-900">{cobro.monto}</p>
            <p className="text-xs text-gray-400 truncate">{cobro.nota}</p>
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
              <Icono glifo={Iconos.accion.abrirFuera} tamano="sm" className="shrink-0" />
              Ver contrato en SECOP II
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

                  {editandoOblId === obl.id ? (
                    <div className="flex-1 min-w-0">
                      <textarea
                        autoFocus
                        rows={3}
                        value={textoEdicion}
                        onChange={e => setTextoEdicion(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={permanenteEdicion}
                            onChange={e => setPermanenteEdicion(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          Permanente
                        </label>
                        <button
                          type="button"
                          onClick={() => guardarObligacion(obl.id)}
                          disabled={guardandoObl || !textoEdicion.trim()}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                        >
                          {guardandoObl ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoOblId(null)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="flex-1 min-w-0 text-sm text-gray-700 break-words">{obl.descripcion}</p>
                  )}

                  <div className={`flex items-center gap-2 shrink-0 ${editandoOblId === obl.id ? 'hidden' : ''}`}>
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
                    {esGestor && (
                      <>
                        <button
                          onClick={() => abrirEdicionObligacion(obl)}
                          title="Editar obligación"
                          aria-label="Editar obligación"
                          className="text-gray-300 hover:text-blue-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => eliminarObligacion(obl.id)}
                          title="Eliminar obligación"
                          aria-label="Eliminar obligación"
                          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                        >
                          <Icono glifo={Iconos.accion.eliminar} tamano="sm" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Atajo para arrancar: solo cuando no hay ninguna obligación. */}
        {esGestor && obligaciones.length === 0 && (
          <CopiarObligaciones
            contratoId={id as string}
            onCopiado={obls => setObligaciones(obls)}
          />
        )}

        {/* Alta manual de obligaciones */}
        {esGestor && (
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

        {!esGestor && obligaciones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            La dependencia de contratación aún no ha definido las obligaciones de este contrato.
          </p>
        )}
      </div>

      {/* Expediente documental — entre las obligaciones y los periodos: es
          parte de la legalización del contrato, no de su ejecución mensual. */}
      <ExpedienteContrato
        contratoId={id as string}
        initial={initialDocumentos}
        editable={esGestor}
      />

      {/* Periodos de pago */}
      <div className="bg-white rounded-2xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
            Periodos de pago ({periodos.length})
          </h3>
          {esGestor && periodos.length === 0 && obligaciones.length > 0 && (
            <button
              onClick={generarPeriodos}
              disabled={generandoPeriodos}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {generandoPeriodos ? 'Generando...' : 'Generar periodos automáticamente'}
            </button>
          )}
        </div>

        {periodos.length === 0 && esGestor && obligaciones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            Agrega las obligaciones del contrato primero, luego genera los periodos.
          </p>
        )}

        {periodos.length === 0 && esGestor && obligaciones.length > 0 && (
          <p className="text-sm text-gray-400 text-center py-6">
            Haz clic en "Generar periodos automáticamente" para crear los {contrato.plazo_meses} periodos mensuales.
          </p>
        )}

        {periodos.length === 0 && !esGestor && (
          <p className="text-sm text-gray-400 text-center py-6">
            Los periodos de pago aún no han sido generados por la dependencia de contratación.
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
