'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import { formatCedula } from '@/lib/format'

// ── Spanish number-to-words (Colombian peso format) ──────────
function numerosALetras(n: number): string {
  if (!n || n === 0) return ''
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const centenas = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  function menorMil(n: number): string {
    if (n === 0) return ''
    if (n < 20) return unidades[n]
    if (n < 30) return n === 20 ? 'VEINTE' : 'VEINTI' + unidades[n - 20]
    if (n < 100) {
      const d = Math.floor(n / 10), u = n % 10
      return decenas[d] + (u > 0 ? ' Y ' + unidades[u] : '')
    }
    const c = Math.floor(n / 100), r = n % 100
    const cStr = (c === 1 && r > 0) ? 'CIENTO' : centenas[c]
    return cStr + (r > 0 ? ' ' + menorMil(r) : '')
  }

  function convertir(n: number): string {
    if (n === 0) return ''
    if (n < 1000) return menorMil(n)
    if (n < 1_000_000) {
      const miles = Math.floor(n / 1000), r = n % 1000
      return (miles === 1 ? 'MIL' : menorMil(miles) + ' MIL') + (r > 0 ? ' ' + menorMil(r) : '')
    }
    if (n < 1_000_000_000) {
      const mill = Math.floor(n / 1_000_000), r = n % 1_000_000
      return (mill === 1 ? 'UN MILLÓN' : menorMil(mill) + ' MILLONES') + (r > 0 ? ' ' + convertir(r) : '')
    }
    return n.toString()
  }

  return convertir(Math.round(n)) + ' PESOS M/CTE'
}

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
}

export default function NuevoContratoPage() {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [dependencias, setDependencias] = useState<{ id: string; nombre: string }[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; nombre_completo: string; cedula: string; rol: string }[]>([])

  // Excel lookup state
  const [buscandoExcel, setBuscandoExcel] = useState(false)
  const [excelEncontrado, setExcelEncontrado] = useState(false)

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
    banco: '',
    tipo_cuenta: 'AHORROS',
    numero_cuenta: '',
    cdp: '',
    crp: '',
  })

  // ── Load dropdowns ──────────────────────────────────────────
  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const [{ data: deps }, { data: users }] = await Promise.all([
        supabase.from('dependencias').select('id, nombre').order('nombre'),
        supabase.from('usuarios').select('id, nombre_completo, cedula, rol').order('nombre_completo'),
      ])
      setDependencias(deps || [])
      setUsuarios(users || [])
    }
    cargar()
  }, [])

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
    setGuardando(true)

    const supabase = createClient()
    const { data: muni } = await supabase.from('municipios').select('id').single()
    if (!muni) { toast.error('No se encontró el municipio'); setGuardando(false); return }

    const dias = parseInt(form.plazo_dias) || 0
    const meses = Math.round(dias / 30) // approximate — kept for backwards compat

    const { data, error } = await supabase
      .from('contratos')
      .insert({
        municipio_id: muni.id,
        dependencia_id: form.dependencia_id,
        contratista_id: form.contratista_id,
        supervisor_id: form.supervisor_id,
        numero: form.numero,
        anio: form.anio,
        objeto: form.objeto,
        modalidad_seleccion: form.modalidad_seleccion,
        valor_total: parseFloat(form.valor_total),
        valor_mensual: parseFloat(form.valor_mensual) || 0,
        valor_letras_total: form.valor_letras_total,
        valor_letras_mensual: form.valor_letras_mensual,
        plazo_dias: dias,
        plazo_meses: meses,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        banco: form.banco || null,
        tipo_cuenta: form.tipo_cuenta,
        numero_cuenta: form.numero_cuenta || null,
        cdp: form.cdp || null,
        crp: form.crp || null,
      })
      .select()
      .single()

    if (error) { toast.error('Error: ' + error.message); setGuardando(false); return }

    toast.success('Contrato creado exitosamente')
    router.push(`/dashboard/contratos/${data.id}`)
  }

  const contratistas = usuarios.filter(u => u.rol === 'contratista' || u.rol === 'admin')
  const supervisores = usuarios.filter(u => u.rol === 'supervisor' || u.rol === 'admin')

  const inputClass =
    'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none'
  const autoClass = inputClass + ' bg-emerald-50 border-emerald-200'

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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dependencia</label>
              <select name="dependencia_id" value={form.dependencia_id} onChange={handleChange} required
                className={excelEncontrado && form.dependencia_id ? autoClass : inputClass}>
                <option value="">Seleccionar...</option>
                {dependencias.map(d => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Personas */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Contratista y supervisor
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contratista</label>
              <select name="contratista_id" value={form.contratista_id} onChange={handleChange} required
                className={excelEncontrado && form.contratista_id ? autoClass : inputClass}>
                <option value="">Seleccionar...</option>
                {contratistas.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre_completo} — {formatCedula(u.cedula)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              <select name="supervisor_id" value={form.supervisor_id} onChange={handleChange} required
                className={excelEncontrado && form.supervisor_id ? autoClass : inputClass}>
                <option value="">Seleccionar...</option>
                {supervisores.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre_completo} — {formatCedula(u.cedula)}</option>
                ))}
              </select>
            </div>
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

        {/* Datos bancarios */}
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-4">
            Datos bancarios del contratista
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
              <input name="banco" value={form.banco} onChange={handleChange}
                placeholder="BANCOLOMBIA" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cuenta</label>
              <select name="tipo_cuenta" value={form.tipo_cuenta} onChange={handleChange}
                className={inputClass}>
                <option value="AHORROS">Ahorros</option>
                <option value="CORRIENTE">Corriente</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número de cuenta</label>
              <input name="numero_cuenta" value={form.numero_cuenta} onChange={handleChange}
                placeholder="37678690075" className={inputClass} />
            </div>
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
