'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import SelectorContratista from '@/components/SelectorContratista'
import SelectorSupervisor from '@/components/SelectorSupervisor'
import type { UsuarioSelect } from '@/services/admin'
import { numerosALetras } from '@/lib/numero-letras'
import { crearContratoConContratista } from '@/app/actions/contratos'

interface ExcelData {
  objeto: string
  modalidad_seleccion: string
  dependencia_nombre: string
  supervisor_nombre: string
  cedula_contratista: string
  valor_total: number
  valor_mensual: number
  fecha_inicio: string
  fecha_fin: string
  plazo_dias: number
  cdp: string | null
  crp: string | null
  secop_url: string | null
}

export default function NuevoContratoPage({
  initialDependencias = [],
  initialUsuarios = [],
}: {
  initialDependencias?: { id: string; nombre: string }[]
  initialUsuarios?: UsuarioSelect[]
}) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [dependencias] = useState(initialDependencias)
  const [usuarios] = useState(initialUsuarios)

  // Excel lookup state
  const [buscandoExcel, setBuscandoExcel] = useState(false)
  const [excelEncontrado, setExcelEncontrado] = useState(false)

  // Contratista: seleccionar uno existente o crearlo en el mismo flujo
  const [modoContratista, setModoContratista] = useState<'existente' | 'nuevo'>('existente')
  const [nuevoContratista, setNuevoContratista] = useState({
    nombre_completo: '', cedula: '', email: '', telefono: '', direccion: '',
    banco: '', tipo_cuenta: '', numero_cuenta: '',
  })
  // Resultado de éxito (muestra la contraseña temporal si se creó el contratista)
  const [resultado, setResultado] = useState<{ contratoId: string; password?: string; nombre?: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const BANCOS = [
    'Bancolombia', 'Davivienda', 'Banco de Bogotá', 'BBVA', 'Banco Popular',
    'Banco Agrario', 'Nequi', 'Daviplata', 'Banco Caja Social', 'Banco de Occidente',
    'Banco Falabella', 'Banco Pichincha', 'Banco Finandina', 'Banco Mundo Mujer',
    'Coopcentral', 'Bancamía', 'Otro',
  ]

  const [form, setForm] = useState({
    numero: '',
    anio: new Date().getFullYear(),
    objeto: '',
    modalidad_seleccion: 'Contratacion Directa',
    dependencia_id: '',
    contratista_id: '',
    supervisor_id: '',
    valor_total: '',
    valor_mensual: '',
    valor_letras_total: '',
    valor_letras_mensual: '',
    plazo_dias: '',
    fecha_inicio: '',
    fecha_fin: '',
    cdp: '',
    crp: '',
    secop_url: '',
  })

  // Dropdowns (dependencias/usuarios) llegan como props desde el servidor —
  // sin carga client-side que pueda fallar por sesión fría.

  // ── Auto-generate valor en letras ───────────────────────────
  useEffect(() => {
    const total = parseFloat(form.valor_total)
    if (total > 0) {
      setForm(f => ({ ...f, valor_letras_total: numerosALetras(total) }))
    }
  }, [form.valor_total])

  useEffect(() => {
    const mensual = parseFloat(form.valor_mensual)
    if (mensual > 0) {
      setForm(f => ({ ...f, valor_letras_mensual: numerosALetras(mensual) }))
    }
  }, [form.valor_mensual])

  // ── Auto-calc fecha_fin from plazo_dias + fecha_inicio ──────
  useEffect(() => {
    if (form.fecha_inicio && form.plazo_dias) {
      const dias = parseInt(form.plazo_dias)
      if (dias > 0) {
        const d = new Date(form.fecha_inicio + 'T00:00:00')
        d.setDate(d.getDate() + dias - 1)
        setForm(f => ({ ...f, fecha_fin: d.toISOString().slice(0, 10) }))
      }
    }
  }, [form.fecha_inicio, form.plazo_dias])

  // ── Lookup contract data from Excel staging when numero changes ─
  const lookupExcel = useCallback(async (numero: string) => {
    if (!numero.trim() || numero.length < 5) { setExcelEncontrado(false); return }
    setBuscandoExcel(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('contratos_excel')
        .select('*')
        .eq('numero', numero.trim())
        .single()

      if (!data) { setExcelEncontrado(false); setBuscandoExcel(false); return }

      const excel = data as ExcelData

      // Resolve dependencia_id by name
      const dep = dependencias.find(d =>
        d.nombre.toLowerCase().trim() === excel.dependencia_nombre?.toLowerCase().trim()
      )

      // Resolve supervisor_id by approximate name match (accent-insensitive)
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      const sup = usuarios.find(u =>
        u.rol === 'supervisor' && normalize(u.nombre_completo) === normalize(excel.supervisor_nombre || '')
      )

      // Resolve contratista_id by cedula
      const contratista = usuarios.find(u =>
        (u.rol === 'contratista' || u.rol === 'admin') &&
        u.cedula === excel.cedula_contratista
      )

      setForm(f => ({
        ...f,
        objeto: excel.objeto || f.objeto,
        modalidad_seleccion: excel.modalidad_seleccion || f.modalidad_seleccion,
        dependencia_id: dep?.id || f.dependencia_id,
        supervisor_id: sup?.id || f.supervisor_id,
        contratista_id: contratista?.id || f.contratista_id,
        valor_total: excel.valor_total ? String(excel.valor_total) : f.valor_total,
        valor_mensual: excel.valor_mensual ? String(excel.valor_mensual) : f.valor_mensual,
        fecha_inicio: excel.fecha_inicio ? excel.fecha_inicio.slice(0, 10) : f.fecha_inicio,
        fecha_fin: excel.fecha_fin ? excel.fecha_fin.slice(0, 10) : f.fecha_fin,
        plazo_dias: excel.plazo_dias ? String(excel.plazo_dias) : f.plazo_dias,
        cdp: excel.cdp || f.cdp,
        crp: excel.crp || f.crp,
        secop_url: (excel as any).secop_url || f.secop_url,
      }))
      setExcelEncontrado(true)
    } catch {
      setExcelEncontrado(false)
    }
    setBuscandoExcel(false)
  }, [dependencias, usuarios])

  // Debounced lookup when numero changes (only after dropdowns are loaded)
  useEffect(() => {
    if (!dependencias.length || !usuarios.length) return
    const timer = setTimeout(() => lookupExcel(form.numero), 600)
    return () => clearTimeout(timer)
  }, [form.numero, lookupExcel, dependencias.length, usuarios.length])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (name === 'numero') setExcelEncontrado(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validación previa según el modo de contratista
    const creandoNuevo = modoContratista === 'nuevo'
    if (creandoNuevo) {
      if (!nuevoContratista.nombre_completo.trim() || !nuevoContratista.cedula.trim() || !nuevoContratista.email.trim()) {
        toast.error('Nombre, cédula y correo del contratista son obligatorios')
        return
      }
    } else if (!form.contratista_id) {
      toast.error('Selecciona el contratista')
      return
    }

    // Al desaparecer el desplegable de dependencia, estas dos validaciones
    // dejan de estar cubiertas por `required` del navegador.
    if (!form.supervisor_id) {
      toast.error('Selecciona el supervisor del contrato')
      return
    }
    if (!form.dependencia_id) {
      toast.error('El supervisor elegido no tiene secretaría asignada. Indícala con "cambiar".')
      return
    }

    setGuardando(true)

    // Server Action atómica: crea el contratista (si es nuevo) + el contrato.
    // Si el contrato falla, el usuario recién creado se elimina (rollback).
    try {
      const res = await crearContratoConContratista({
        dependencia_id: form.dependencia_id,
        contratista_id: creandoNuevo ? undefined : form.contratista_id,
        nuevoContratista: creandoNuevo ? {
          nombre_completo: nuevoContratista.nombre_completo,
          cedula: nuevoContratista.cedula,
          email: nuevoContratista.email,
          telefono: nuevoContratista.telefono || undefined,
          direccion: nuevoContratista.direccion || undefined,
          banco: nuevoContratista.banco || undefined,
          tipo_cuenta: nuevoContratista.tipo_cuenta || undefined,
          numero_cuenta: nuevoContratista.numero_cuenta || undefined,
        } : undefined,
        supervisor_id: form.supervisor_id,
        numero: form.numero,
        anio: Number(form.anio),
        objeto: form.objeto,
        modalidad_seleccion: form.modalidad_seleccion,
        valor_total: parseFloat(form.valor_total) || 0,
        valor_mensual: parseFloat(form.valor_mensual) || 0,
        valor_letras_total: form.valor_letras_total,
        valor_letras_mensual: form.valor_letras_mensual,
        plazo_dias: parseInt(form.plazo_dias) || 0,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        cdp: form.cdp || null,
        crp: form.crp || null,
        secop_url: form.secop_url?.trim() || null,
      })

      if (res.error) {
        toast.error(res.error)
        setGuardando(false)
        return
      }

      // Si se creó un contratista nuevo, mostrar la contraseña temporal antes
      // de salir. Si no, ir directo al contrato como siempre.
      if (res.data?.passwordInicial) {
        setResultado({ contratoId: res.data.id, password: res.data.passwordInicial, nombre: res.data.contratistaNombre })
        setGuardando(false)
      } else {
        toast.success('Contrato creado exitosamente')
        router.push(`/dashboard/contratos/${res.data!.id}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado')
      setGuardando(false)
    }
  }

  const contratistas = usuarios.filter(u => u.rol === 'contratista' || u.rol === 'admin')
  const supervisores = usuarios.filter(u => u.rol === 'supervisor' || u.rol === 'admin')

  const inputClass =
    'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none'
  const autoClass = inputClass + ' bg-emerald-50 border-emerald-200'

  // Pantalla de éxito con la contraseña temporal del contratista recién creado
  if (resultado?.password) {
    return (
      <div className="max-w-lg mx-auto">
        <Toaster position="top-center" richColors />
        <div className="bg-white rounded-2xl border p-6 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Contrato y contratista creados</h2>
          <p className="text-sm text-gray-500 mb-5">
            {resultado.nombre ? `Se creó la cuenta de ${resultado.nombre}. ` : ''}
            Comparte esta contraseña temporal; podrá cambiarla al ingresar.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
            <p className="text-xs text-gray-400 mb-1">Contraseña temporal</p>
            <p className="text-2xl font-mono font-bold text-gray-900 tracking-wider select-all">{resultado.password}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(resultado.password!)
                setCopiado(true)
                setTimeout(() => setCopiado(false), 2000)
              }}
              className="flex-1 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {copiado ? '✓ Copiada' : 'Copiar contraseña'}
            </button>
            <button
              onClick={() => router.push(`/dashboard/contratos/${resultado.contratoId}`)}
              className="flex-1 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Ir al contrato
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <Toaster position="top-center" richColors />

      <h2 className="text-2xl font-bold text-gray-900 mb-2">Nuevo contrato</h2>
      <p className="text-gray-500 mb-6">Registra un contrato de prestación de servicios.</p>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Datos del contrato */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Datos del contrato
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número
                {buscandoExcel && (
                  <span className="ml-2 text-xs text-blue-500 font-normal">Buscando en Excel...</span>
                )}
                {excelEncontrado && !buscandoExcel && (
                  <span className="ml-2 text-xs text-emerald-600 font-normal">✓ Datos del Excel cargados</span>
                )}
              </label>
              <input name="numero" value={form.numero} onChange={handleChange} required
                placeholder="022-2026" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
              <input name="anio" type="number" value={form.anio} onChange={handleChange} required
                className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Objeto del contrato</label>
              <textarea name="objeto" value={form.objeto} onChange={handleChange} required rows={3}
                placeholder="PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN..."
                className={`${excelEncontrado ? autoClass : inputClass} resize-none`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad</label>
              <select name="modalidad_seleccion" value={form.modalidad_seleccion} onChange={handleChange}
                className={inputClass}>
                <option value="Contratacion Directa">Contratación Directa</option>
                <option value="Mínima Cuantía">Mínima Cuantía</option>
                <option value="Selección Abreviada">Selección Abreviada</option>
              </select>
            </div>
          </div>
        </div>

        {/* Personas */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Contratista y supervisor
          </h3>

          {/* Toggle: seleccionar existente o crear nuevo */}
          <div className="inline-flex bg-gray-100 rounded-xl p-1 mb-4">
            <button
              type="button"
              onClick={() => setModoContratista('existente')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                modoContratista === 'existente' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Contratista existente
            </button>
            <button
              type="button"
              onClick={() => setModoContratista('nuevo')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                modoContratista === 'nuevo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ➕ Crear nuevo
            </button>
          </div>

          {modoContratista === 'existente' ? (
            <SelectorContratista
              contratistas={contratistas}
              valor={form.contratista_id}
              onChange={id => setForm(f => ({ ...f, contratista_id: id }))}
            />
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-800">
                Se creará la cuenta del contratista junto con el contrato. Al guardar se generará
                una <strong>contraseña temporal</strong> para compartirle.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                  <input value={nuevoContratista.nombre_completo}
                    onChange={e => setNuevoContratista(n => ({ ...n, nombre_completo: e.target.value }))}
                    placeholder="Ej. Juan Pérez Gómez" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cédula *</label>
                  <input value={nuevoContratista.cedula}
                    onChange={e => setNuevoContratista(n => ({ ...n, cedula: e.target.value }))}
                    placeholder="1036..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Correo *</label>
                  <input type="email" value={nuevoContratista.email}
                    onChange={e => setNuevoContratista(n => ({ ...n, email: e.target.value }))}
                    placeholder="correo@ejemplo.com" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input value={nuevoContratista.telefono}
                    onChange={e => setNuevoContratista(n => ({ ...n, telefono: e.target.value }))}
                    placeholder="300..." className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input value={nuevoContratista.direccion}
                    onChange={e => setNuevoContratista(n => ({ ...n, direccion: e.target.value }))}
                    className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
                  <select value={nuevoContratista.banco}
                    onChange={e => setNuevoContratista(n => ({ ...n, banco: e.target.value }))}
                    className={inputClass}>
                    <option value="">— Seleccionar —</option>
                    {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cuenta</label>
                  <select value={nuevoContratista.tipo_cuenta}
                    onChange={e => setNuevoContratista(n => ({ ...n, tipo_cuenta: e.target.value }))}
                    className={inputClass}>
                    <option value="">— Seleccionar —</option>
                    <option value="Ahorros">Ahorros</option>
                    <option value="Corriente">Corriente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N.° de cuenta</label>
                  <input value={nuevoContratista.numero_cuenta}
                    onChange={e => setNuevoContratista(n => ({ ...n, numero_cuenta: e.target.value }))}
                    className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {/* El supervisor es del CONTRATO, no de cómo se eligió al
              contratista: antes estaba duplicado dentro de cada rama. */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <SelectorSupervisor
              supervisores={supervisores}
              dependencias={dependencias}
              supervisorId={form.supervisor_id}
              dependenciaId={form.dependencia_id}
              onChange={(sup, dep) => setForm(f => ({ ...f, supervisor_id: sup, dependencia_id: dep }))}
            />
          </div>
        </div>

        {/* Valores */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Valores y plazo
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor total ($)</label>
              <input name="valor_total" type="number" value={form.valor_total} onChange={handleChange} required
                placeholder="24000000" className={excelEncontrado && form.valor_total ? autoClass : inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor mensual ($)
                <span className="text-xs text-gray-400 font-normal ml-1">del Excel o manual</span>
              </label>
              <input name="valor_mensual" type="number" value={form.valor_mensual} onChange={handleChange}
                placeholder="3000000" className={excelEncontrado && form.valor_mensual ? autoClass : inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor total (letras)
                <span className="text-xs text-emerald-600 font-normal ml-1">auto-generado</span>
              </label>
              <input name="valor_letras_total" value={form.valor_letras_total} onChange={handleChange}
                placeholder="Se genera al ingresar el valor total" className={form.valor_letras_total ? autoClass : inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor mensual (letras)
                <span className="text-xs text-emerald-600 font-normal ml-1">auto-generado</span>
              </label>
              <input name="valor_letras_mensual" value={form.valor_letras_mensual} onChange={handleChange}
                placeholder="Se genera al ingresar el valor mensual" className={form.valor_letras_mensual ? autoClass : inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plazo (días)
                <span className="text-xs text-gray-400 font-normal ml-1">del Excel</span>
              </label>
              <input name="plazo_dias" type="number" value={form.plazo_dias} onChange={handleChange} required
                placeholder="228" className={excelEncontrado && form.plazo_dias ? autoClass : inputClass} />
            </div>
            <div />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
              <input name="fecha_inicio" type="date" value={form.fecha_inicio} onChange={handleChange} required
                className={excelEncontrado && form.fecha_inicio ? autoClass : inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha fin
                <span className="text-xs text-emerald-600 font-normal ml-1">del Excel o auto-calculada</span>
              </label>
              <input name="fecha_fin" type="date" value={form.fecha_fin} onChange={handleChange} required
                className={excelEncontrado && form.fecha_fin ? autoClass : inputClass} />
            </div>
          </div>
        </div>

        {/* CDP / CRP */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Certificados presupuestales
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                No. CDP
                {excelEncontrado && form.cdp && (
                  <span className="text-xs text-emerald-600 font-normal ml-1">del Excel</span>
                )}
              </label>
              <input name="cdp" value={form.cdp} onChange={handleChange}
                placeholder="1" className={excelEncontrado && form.cdp ? autoClass : inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                No. CRP
                {excelEncontrado && form.crp && (
                  <span className="text-xs text-emerald-600 font-normal ml-1">del Excel</span>
                )}
              </label>
              <input name="crp" value={form.crp} onChange={handleChange}
                placeholder="1" className={excelEncontrado && form.crp ? autoClass : inputClass} />
            </div>
          </div>
        </div>

        {/* SECOP URL */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Enlace SECOP II
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL del contrato en SECOP II
              <span className="text-xs text-gray-400 font-normal ml-1">(opcional)</span>
            </label>
            <input
              name="secop_url"
              type="url"
              value={form.secop_url ?? ''}
              onChange={handleChange}
              placeholder="https://www.secop.gov.co/..."
              className={inputClass}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="bg-gray-900 text-white px-8 py-3 rounded-xl font-medium hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Crear contrato'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 px-4 py-3 text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
