'use client'

/**
 * /dashboard/contratos
 *
 * Lista de contratos con carga única + búsqueda/filtros en cliente.
 *
 *  - useQuery: trae todos los contratos del rol en UNA sola consulta
 *    (elimina los múltiples viajes de red y el count:'exact' por página)
 *  - useWindowVirtualizer: renderiza solo lo visible
 *  - Búsqueda instantánea por nombre/apellido/cédula/N° contrato/objeto
 *    (debounce ligero solo para no recalcular en cada pulsación)
 *  - Filtros estructurados (dependencia, supervisor, rango, vigencia,
 *    incompletos) aplicados en cliente sobre el dataset completo
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useUsuario } from '@/lib/user-context'
import { formatCedula } from '@/lib/format'
import { avatarThumb } from '@/lib/avatar'
import { esGestorContratos, esRolSupervision, esMesPasado } from '@/lib/constants'
import { type ContratoListItem } from '@/services/contratos'
import { getTodosContratosConBanco } from '@/app/actions/contratos-lista'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ContratistaInfo = NonNullable<ContratoListItem['contratista']>

/**
 * Lo que este contrato espera de quien lo vigila.
 *
 * Son los dos únicos motivos por los que un supervisor necesita abrir un
 * contrato sin que nadie se lo pida:
 *
 *  · POR REVISAR — informes enviados esperando su aprobación.
 *  · ATRASADOS   — periodos en borrador cuyo mes ya terminó y que nadie ha
 *                  desbloqueado. El contratista ya no puede entregarlos por su
 *                  cuenta: hasta que el supervisor habilite el envío tardío,
 *                  quedan congelados. Antes no había forma de saber que
 *                  existían sin abrir los contratos uno por uno.
 *
 * Los históricos se excluyen: son periodos anteriores a la digitalización y
 * nadie va a actuar sobre ellos.
 */
type Atencion = { porRevisar: number; atrasados: number; total: number }

function calcularAtencion(c: ContratoListItem): Atencion {
  let porRevisar = 0
  let atrasados = 0
  for (const p of c.periodos ?? []) {
    if (p.es_historico) continue
    if (p.estado === 'enviado') porRevisar++
    else if (p.estado === 'borrador' && !p.habilitado_tardio && esMesPasado(p.mes, p.anio)) atrasados++
  }
  return { porRevisar, atrasados, total: porRevisar + atrasados }
}

function InfoRow({ icono, label, value }: { icono: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icono glifo={icono} tamano="sm" className="shrink-0 mt-0.5 text-gray-400" />
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm text-gray-800 break-all">{value}</p>
      </div>
    </div>
  )
}

function VerUsuarioModal({
  contratista,
  onClose,
}: {
  contratista: ContratistaInfo
  onClose: () => void
}) {
  const initials = contratista.nombre_completo
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const emailVisible =
    contratista.email && !contratista.email.endsWith('@pendiente.local')
      ? contratista.email
      : null

  const tieneCuenta = contratista.banco || contratista.tipo_cuenta || contratista.numero_cuenta

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header ─ photo + name */}
        <div className="bg-gray-50 border-b border-gray-100 px-6 py-5 flex items-center gap-4">
          {contratista.foto_url ? (
            <img
              src={avatarThumb(contratista.foto_url, 192) ?? undefined}
              alt={contratista.nombre_completo}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow-sm shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500 ring-2 ring-white shadow-sm shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-tight">{contratista.nombre_completo}</p>
            {contratista.cedula && (
              <p className="text-sm text-gray-500 font-mono mt-0.5">{formatCedula(contratista.cedula)}</p>
            )}
            {contratista.cargo && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{contratista.cargo}</p>
            )}
          </div>
          {/* Close */}
          <button
            onClick={onClose}
            className="ml-auto shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info rows */}
        <div className="px-6 py-5 space-y-4">
          <InfoRow icono={Iconos.aviso.correo} label="Correo electrónico" value={emailVisible ?? '—'} />
          <InfoRow icono={Iconos.dominio.telefono} label="Celular" value={contratista.telefono ?? '—'} />

          {tieneCuenta && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cuenta bancaria</p>
                <div className="space-y-4">
                  <InfoRow icono={Iconos.dominio.banco} label="Banco" value={contratista.banco ?? '—'} />
                  <InfoRow
                    icono={Iconos.dominio.cuentaBancaria}
                    label="Tipo · Número"
                    value={`${contratista.tipo_cuenta ?? '—'} · ${contratista.numero_cuenta ?? '—'}`}
                  />
                </div>
              </div>
            </>
          )}

          {/* Firma preview */}
          {contratista.firma_url && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-400 mb-2">Firma registrada</p>
              <img
                src={contratista.firma_url}
                alt="Firma"
                className="h-10 object-contain opacity-70"
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/60">
          <Link
            href={`/dashboard/admin/usuarios/${contratista.id}`}
            onClick={onClose}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Editar perfil →
          </Link>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function formatCOP(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString('es-CO')}`
}

const RANGOS = [
  { label: 'Todos los valores',       min: 0,         max: Infinity },
  { label: 'Hasta $3.000.000',        min: 0,         max: 3_000_000 },
  { label: '$3.000.001 – $6.000.000', min: 3_000_001, max: 6_000_000 },
  { label: '$6.000.001 – $9.000.000', min: 6_000_001, max: 9_000_000 },
  { label: 'Más de $9.000.000',       min: 9_000_001, max: Infinity },
]

/** Debounced value hook */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContratosPage() {
  const { usuario, cargando: cargandoUser } = useUsuario()
  // GESTIÓN (admin, contratación): todo el municipio, más crear y exportar.
  // SUPERVISIÓN (supervisor, asesor): su ámbito, sin crear ni exportar, pero
  // con el mismo buscador — un supervisor llega a 48 contratos y hasta ahora
  // recorría la lista entera a ojo.
  // El contratista se queda con su lista corta y sin herramientas.
  const esGestor = esGestorContratos(usuario?.rol)
  const esSupervision = esRolSupervision(usuario?.rol)
  const puedeBuscar = esGestor || esSupervision
  const hoy = new Date().toISOString().split('T')[0]

  // ── Modal state ────────────────────────────────────────────────
  const [viendoUsuario, setViendoUsuario] = useState<ContratistaInfo | null>(null)

  // ── Filters ────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('')
  const [filtroDep, setFiltroDep] = useState('')
  const [filtroSup, setFiltroSup] = useState('')
  const [filtroRango, setFiltroRango] = useState(0)
  const [soloIncompletos, setSoloInc] = useState(false)
  const [soloAtencion, setSoloAtencion] = useState(false)
  const [filtroVigencia, setFiltroVig] = useState<'todos' | 'vigentes' | 'vencidos'>('todos')

  const busquedaDebounced = useDebounced(busqueda, 200)

  // Filtros iniciales. Se aplican tras montar y no en el useState: dependen de
  // la query string (tarjetas del panel de contratación) y del rol, y el
  // servidor no ve ninguno de los dos igual — la hidratación no cuadraría.
  //
  // Supervisión arranca en "Vigentes": el supervisor con más carga tiene 48
  // contratos y solo 8 vigentes, así que abrir en "Todos" es abrir sobre 40
  // contratos terminados. Las otras pestañas quedan a un clic y con su cuenta
  // a la vista, así que no se esconde nada, se ordena.
  const [filtrosIniciados, setFiltrosIniciados] = useState(false)
  useEffect(() => {
    if (!usuario || filtrosIniciados) return
    const q = new URLSearchParams(window.location.search)
    if (q.get('incompletos') === '1') setSoloInc(true)
    if (q.get('vigencia') === 'vigentes') setFiltroVig('vigentes')
    else if (esRolSupervision(usuario.rol)) setFiltroVig('vigentes')
    setFiltrosIniciados(true)
  }, [usuario, filtrosIniciados])

  /**
   * Un periodo atrasado suele estar en un contrato YA VENCIDO — es el caso más
   * probable, porque el contrato terminó y quedó un informe sin entregar. Si
   * este filtro respetara "Vigentes" escondería justo lo que se pide ver, así
   * que al activarlo se abre la vigencia a todos.
   */
  function alternarAtencion() {
    const siguiente = !soloAtencion
    setSoloAtencion(siguiente)
    if (siguiente) setFiltroVig('todos')
  }

  // ── Carga única de todos los contratos del rol ─────────────────
  const {
    data: todosContratos,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['contratos-todos', usuario?.id, usuario?.rol],
    // Server action: deriva rol/usuario de la sesión e incluye los datos
    // bancarios del contratista (no legibles via browser client).
    queryFn: () => getTodosContratosConBanco(),
    enabled: !!usuario,
    staleTime: 2 * 60_000, // 2 min: volver a la lista no re-consulta
  })

  const todosCargados = useMemo(() => todosContratos ?? [], [todosContratos])
  const total = todosCargados.length

  function datosFaltantes(c: ContratoListItem): string[] {
    if (!esGestor) return []
    const f: string[] = []

    // Lo que impide OPERAR el contrato va primero: sin obligaciones o sin
    // periodos el contratista no puede reportar aunque el contrato exista.
    // Antes solo se revisaban los datos del contratista, así que 61 contratos
    // sin obligaciones no aparecían como incompletos en ninguna parte.
    if ((c.num_obligaciones ?? 0) === 0) f.push('Obligaciones')
    if ((c.num_periodos ?? 0) === 0) f.push('Periodos')

    if (!c.contratista) return f
    const u = c.contratista
    if (!u.email || u.email.endsWith('@pendiente.local')) f.push('Email')
    if (!u.telefono) f.push('Celular')
    if (!u.cargo) f.push('Cargo')
    if (!u.foto_url) f.push('Foto')
    if (!u.firma_url) f.push('Firma')
    if (!u.banco || !u.tipo_cuenta || !u.numero_cuenta) f.push('Cuenta bancaria')
    return f
  }

  // ── Filtrado + búsqueda 100% en cliente sobre el dataset completo ──
  const visibles = useMemo(() => {
    const r = RANGOS[filtroRango]
    const q = norm(busquedaDebounced)

    return todosCargados.filter((c) => {
      // Búsqueda: nombre/apellidos, cédula, N° contrato, objeto
      if (q) {
        const cedula = (c.contratista?.cedula ?? '').toLowerCase()
        const haystack = norm(
          `${c.contratista?.nombre_completo ?? ''} ${c.numero} ${c.objeto}`,
        )
        if (!haystack.includes(q) && !cedula.includes(q.replace(/\s/g, ''))) return false
      }
      // Dependencia / supervisor
      if (filtroDep && c.dependencia?.id !== filtroDep) return false
      if (filtroSup && c.supervisor?.id !== filtroSup) return false
      // Rango de valor mensual
      const vm = c.valor_mensual ?? 0
      if (r.min > 0 && vm < r.min) return false
      if (Number.isFinite(r.max) && vm > r.max) return false
      // Vigencia
      if (filtroVigencia === 'vigentes' && c.fecha_fin < hoy) return false
      if (filtroVigencia === 'vencidos' && c.fecha_fin >= hoy) return false
      // Solo incompletos
      if (soloIncompletos && datosFaltantes(c).length === 0) return false
      // Solo los que esperan algo de mí
      if (soloAtencion && calcularAtencion(c).total === 0) return false
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosCargados, busquedaDebounced, filtroDep, filtroSup, filtroRango, filtroVigencia, soloIncompletos, soloAtencion, esGestor, hoy])

  // Se cuenta sobre TODO el dataset, no sobre lo visible: es la cifra que
  // justifica pulsar el filtro, así que no puede depender del filtro.
  const totalAtencion = useMemo(
    () => todosCargados.filter(c => calcularAtencion(c).total > 0).length,
    [todosCargados],
  )
  const totalVigentes = useMemo(
    () => todosCargados.filter(c => c.fecha_fin >= hoy).length,
    [todosCargados, hoy],
  )

  // ── Opciones de filtro derivadas de TODO el dataset ───────────
  const dependencias = useMemo(() => {
    const map = new Map<string, string>()
    todosCargados.forEach((c) => {
      if (c.dependencia?.id) map.set(c.dependencia.id, c.dependencia.nombre)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [todosCargados])

  const supervisores = useMemo(() => {
    const map = new Map<string, string>()
    todosCargados.forEach((c) => {
      if (c.supervisor?.id) map.set(c.supervisor.id, c.supervisor.nombre_completo)
    })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [todosCargados])

  // ── Virtualization ────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useWindowVirtualizer({
    count: visibles.length,
    estimateSize: () => 132, // card avg height incl. gap
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  // ── Misc ──────────────────────────────────────────────────────
  const hayFiltrosActivos =
    busqueda || filtroDep || filtroSup || filtroRango > 0 || soloIncompletos || soloAtencion || filtroVigencia !== 'todos'

  function limpiarFiltros() {
    setBusqueda('')
    setFiltroDep('')
    setFiltroSup('')
    setFiltroRango(0)
    setSoloInc(false)
    setSoloAtencion(false)
    setFiltroVig('todos')
  }

  // ── Render ────────────────────────────────────────────────────
  if (cargandoUser || isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-xl w-48 mb-6" />
        {esGestor && <div className="h-24 bg-gray-200 rounded-2xl" />}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-28 bg-gray-200 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-base font-semibold text-red-800 mb-2">No pudimos cargar los contratos</p>
        <p className="text-sm text-red-600 mb-4">Revisa tu conexión e intenta de nuevo.</p>
        <button
          onClick={() => refetch()}
          className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {/* "Mis contratos" solo es literal para el contratista: son suyos.
            Quien los vigila no los posee, así que ve "Contratos". */}
        <h2 className="text-2xl font-bold text-gray-900">
          {puedeBuscar ? 'Contratos' : 'Mis contratos'}
        </h2>
        {esGestor && (
          <div className="flex items-center gap-2">
            <a
              href="/api/contratos/export"
              className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Exportar
            </a>
            <Link
              href="/dashboard/contratos/nuevo"
              className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              + Nuevo contrato
            </Link>
          </div>
        )}
      </div>

      {/* ── Buscador + filtros (gestión y supervisión) ──────────── */}
      {puedeBuscar && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 space-y-3">
          {/* Search bar */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por contratista, cédula, N.º de contrato u objeto…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Secretaría, supervisor y rango solo tienen sentido con todo el
                municipio delante: en supervisión la dependencia es una sola y
                el supervisor es quien mira. */}
            {esGestor && (
              <>
                <select
                  value={filtroDep}
                  onChange={(e) => setFiltroDep(e.target.value)}
                  className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroDep ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
                >
                  <option value="">Todas las secretarías</option>
                  {dependencias.map(([id, nombre]) => (
                    <option key={id} value={id}>{nombre.replace(/^Secretaría\s+/i, 'Sec. ')}</option>
                  ))}
                </select>

                <select
                  value={filtroSup}
                  onChange={(e) => setFiltroSup(e.target.value)}
                  className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroSup ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
                >
                  <option value="">Todos los supervisores</option>
                  {supervisores.map(([id, nombre]) => (
                    <option key={id} value={id}>{nombre.split(' ').slice(0, 2).join(' ')}</option>
                  ))}
                </select>

                <select
                  value={filtroRango}
                  onChange={(e) => setFiltroRango(Number(e.target.value))}
                  className={`px-3 py-2 border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 ${filtroRango > 0 ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-500'}`}
                >
                  {RANGOS.map((r, i) => (
                    <option key={i} value={i}>{r.label}</option>
                  ))}
                </select>
              </>
            )}

            <div className="flex border border-gray-200 rounded-xl overflow-hidden text-sm">
              {(['todos', 'vigentes', 'vencidos'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setFiltroVig(v)}
                  className={`px-3 py-2 transition-colors ${filtroVigencia === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {v === 'todos' ? 'Todos' : v === 'vigentes' ? 'Vigentes' : 'Vencidos'}
                </button>
              ))}
            </div>

            {esGestor && (
              <button
                onClick={() => setSoloInc((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm transition-colors ${
                  soloIncompletos
                    ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${soloIncompletos ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300'}`}>
                  {soloIncompletos && <Icono glifo={Iconos.estado.ok} tamano="sm" className="w-2.5 h-2.5" />}
                </span>
                Solo incompletos
              </button>
            )}

            {/* El equivalente de "incompletos" para quien vigila: no le falta
                un dato al contrato, le falta una acción suya. */}
            {esSupervision && totalAtencion > 0 && (
              <button
                onClick={alternarAtencion}
                className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-sm transition-colors ${
                  soloAtencion
                    ? 'bg-amber-50 border-amber-300 text-amber-800 font-medium'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${soloAtencion ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300'}`}>
                  {soloAtencion && <Icono glifo={Iconos.estado.ok} tamano="sm" className="w-2.5 h-2.5" />}
                </span>
                Requieren atención ({totalAtencion})
              </button>
            )}

            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">
                Limpiar filtros
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400">
            {hayFiltrosActivos
              ? `Mostrando ${visibles.length} de ${total} contratos`
              : `${total} contratos · ${totalVigentes} vigentes`}
          </p>
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────────── */}
      {total === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-50 text-gray-300 mb-4">
            <Icono glifo={Iconos.navegacion.contratos} tamano="lg" />
          </div>
          <h3 className="font-medium text-gray-900 mb-2">
            {esGestor
              ? 'No hay contratos registrados'
              : usuario?.rol === 'supervisor'
                ? 'No supervisas ningún contrato'
                : usuario?.rol === 'asesor'
                  ? 'No hay contratos en tu dependencia'
                  : 'No tienes contratos asignados'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {esGestor
              ? 'Registra el primer contrato para comenzar a gestionar los pagos.'
              : esSupervision
                ? 'Cuando contratación registre un contrato en tu ámbito, aparecerá aquí.'
                : 'Cuando el administrador te asigne un contrato, aparecerá aquí.'}
          </p>
          {esGestor && (
            <Link
              href="/dashboard/contratos/nuevo"
              className="inline-block bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Registrar primer contrato
            </Link>
          )}
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-50 text-gray-300 mb-3">
            <Icono glifo={Iconos.accion.buscar} tamano="lg" />
          </div>
          <p className="text-sm font-medium text-gray-700">Sin resultados</p>
          <p className="text-xs text-gray-400 mt-1">Prueba con otros filtros</p>
          <button onClick={limpiarFiltros} className="mt-3 text-sm text-gray-500 underline hover:text-gray-700">
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          <div ref={listRef} style={{ position: 'relative' }}>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const contrato = visibles[virtualRow.index]
                const faltantes = datosFaltantes(contrato)
                const incompleto = faltantes.length > 0
                const vencido = contrato.fecha_fin < hoy
                const atencion = esSupervision
                  ? calcularAtencion(contrato)
                  : { porRevisar: 0, atrasados: 0, total: 0 }

                return (
                  <div
                    key={contrato.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - (listRef.current?.offsetTop ?? 0)}px)`,
                      paddingBottom: '12px',
                    }}
                  >
                    <div
                      className={`rounded-2xl border transition-colors ${
                        incompleto
                          ? 'bg-red-50 border-red-200 hover:border-red-300'
                          : atencion.total > 0
                            ? 'bg-white border-amber-200 hover:border-amber-300'
                            : 'bg-white hover:border-gray-300'
                      }`}
                    >
                      <Link
                        href={`/dashboard/contratos/${contrato.id}`}
                        className="block p-5"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-2 mb-1.5">
                              <span className="text-sm font-bold text-gray-900 font-mono">
                                {contrato.numero}-{contrato.anio}
                              </span>
                              {contrato.dependencia?.abreviatura && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                  {contrato.dependencia.abreviatura}
                                </span>
                              )}
                              {vencido && (
                                <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                  Vencido
                                </span>
                              )}
                              {incompleto && (
                                <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                  Faltan: {faltantes.join(' · ')}
                                </span>
                              )}
                              {/* Ámbar: espera una decisión mía. Azul: espera
                                  que yo desbloquee al contratista. Mismo par de
                                  colores que usa el panel del periodo. */}
                              {atencion.porRevisar > 0 && (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                  {atencion.porRevisar} por revisar
                                </span>
                              )}
                              {atencion.atrasados > 0 && (
                                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                  {atencion.atrasados} sin enviar
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-gray-600 line-clamp-1 mb-2">{contrato.objeto}</p>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                              <span className="font-medium text-gray-700">
                                {contrato.contratista?.nombre_completo?.split(' ').slice(0, 3).join(' ')}
                              </span>
                              {contrato.contratista?.cedula && (
                                <span className="font-mono">{contrato.contratista.cedula}</span>
                              )}
                              {/* Para un supervisor este dato es su propio
                                  nombre repetido en cada tarjeta. */}
                              {usuario?.rol !== 'supervisor' && (
                                <span>
                                  Sup: {contrato.supervisor?.nombre_completo?.split(' ').slice(0, 2).join(' ')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-900">
                              {formatCOP(contrato.valor_mensual ?? 0)}
                              <span className="text-xs text-gray-400 font-normal">/mes</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatCOP(contrato.valor_total ?? 0)} total
                            </p>
                            <p className="text-xs text-gray-400">
                              {contrato.plazo_meses}m · {contrato.fecha_inicio?.slice(0, 7)}
                            </p>
                          </div>
                        </div>
                      </Link>

                      {/* Admin quick-action: ver usuario */}
                      {esGestor && contrato.contratista && (
                        <div className="px-5 pb-3.5 flex justify-end -mt-1">
                          <button
                            onClick={() => setViendoUsuario(contrato.contratista!)}
                            className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors flex items-center gap-1"
                          >
                            Ver usuario
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6l6 6m0 0l-6 6m6-6H3" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          {visibles.length > 0 && (
            <div className="py-6 text-center">
              <p className="text-xs text-gray-400">
                {hayFiltrosActivos
                  ? `${visibles.length} de ${total} contratos`
                  : `${total} contratos`}
              </p>
            </div>
          )}
        </>
      )}

      {/* Ver usuario modal */}
      {viendoUsuario && (
        <VerUsuarioModal
          contratista={viendoUsuario}
          onClose={() => setViendoUsuario(null)}
        />
      )}
    </div>
  )
}
