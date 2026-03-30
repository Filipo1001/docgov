'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Toaster, toast } from 'sonner'

export default function NuevoContratoPage() {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [dependencias, setDependencias] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])

  const [form, setForm] = useState({
    numero: '',
    anio: new Date().getFullYear(),
    objeto: '',
    modalidad_seleccion: 'Directa',
    dependencia_id: '',
    contratista_id: '',
    supervisor_id: '',
    valor_total: '',
    valor_mensual: '',
    valor_letras_total: '',
    valor_letras_mensual: '',
    plazo_meses: '',
    fecha_inicio: '',
    fecha_fin: '',
    banco: '',
    tipo_cuenta: 'AHORROS',
    numero_cuenta: '',
    cdp: '',
    crp: '',
  })

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const [{ data: deps }, { data: users }] = await Promise.all([
        supabase.from('dependencias').select('*').order('nombre'),
        supabase.from('usuarios').select('id, nombre_completo, cedula, rol').order('nombre_completo'),
      ])
      setDependencias(deps || [])
      setUsuarios(users || [])
    }
    cargar()
  }, [])

  // ── Auto-calc valor mensual ──
  useEffect(() => {
    const total = parseFloat(form.valor_total)
    const meses = parseInt(form.plazo_meses)
    if (total > 0 && meses > 0) {
      setForm(f => ({ ...f, valor_mensual: String(Math.round(total / meses)) }))
    }
  }, [form.valor_total, form.plazo_meses])

  // ── Auto-calc fecha fin ──
  useEffect(() => {
    if (form.fecha_inicio && form.plazo_meses) {
      const meses = parseInt(form.plazo_meses)
      if (meses > 0) {
        const d = new Date(form.fecha_inicio + 'T00:00:00')
        d.setMonth(d.getMonth() + meses)
        d.setDate(d.getDate() - 1)
        setForm(f => ({ ...f, fecha_fin: d.toISOString().slice(0, 10) }))
      }
    }
  }, [form.fecha_inicio, form.plazo_meses])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)

    const supabase = createClient()
    const { data: muni } = await supabase.from('municipios').select('id').single()
    if (!muni) { toast.error('No se encontró el municipio'); setGuardando(false); return }

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
        valor_mensual: parseFloat(form.valor_mensual),
        valor_letras_total: form.valor_letras_total,
        valor_letras_mensual: form.valor_letras_mensual,
        plazo_meses: parseInt(form.plazo_meses),
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        banco: form.banco,
        tipo_cuenta: form.tipo_cuenta,
        numero_cuenta: form.numero_cuenta,
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
    'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none'

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
              <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
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
                className={inputClass + ' resize-none'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad</label>
              <select name="modalidad_seleccion" value={form.modalidad_seleccion} onChange={handleChange}
                className={inputClass}>
                <option value="Directa">Directa</option>
                <option value="Mínima Cuantía">Mínima Cuantía</option>
                <option value="Selección Abreviada">Selección Abreviada</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dependencia</label>
              <select name="dependencia_id" value={form.dependencia_id} onChange={handleChange} required
                className={inputClass}>
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
                className={inputClass}>
                <option value="">Seleccionar...</option>
                {contratistas.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre_completo} — {u.cedula}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
              <select name="supervisor_id" value={form.supervisor_id} onChange={handleChange} required
                className={inputClass}>
                <option value="">Seleccionar...</option>
                {supervisores.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre_completo} — {u.cedula}</option>
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
                placeholder="24000000" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor mensual ($)
                <span className="text-xs text-gray-400 font-normal ml-1">auto-calculado</span>
              </label>
              <input name="valor_mensual" type="number" value={form.valor_mensual} onChange={handleChange} required
                placeholder="3000000" className={inputClass + ' bg-emerald-50'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor total (letras)</label>
              <input name="valor_letras_total" value={form.valor_letras_total} onChange={handleChange}
                placeholder="VEINTICUATRO MILLONES DE PESOS M/L" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor mensual (letras)</label>
              <input name="valor_letras_mensual" value={form.valor_letras_mensual} onChange={handleChange}
                placeholder="TRES MILLONES M/L" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plazo (meses)</label>
              <input name="plazo_meses" type="number" value={form.plazo_meses} onChange={handleChange} required
                placeholder="8" className={inputClass} />
            </div>
            <div />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
              <input name="fecha_inicio" type="date" value={form.fecha_inicio} onChange={handleChange} required
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha fin
                <span className="text-xs text-gray-400 font-normal ml-1">auto-calculada</span>
              </label>
              <input name="fecha_fin" type="date" value={form.fecha_fin} onChange={handleChange} required
                className={inputClass + ' bg-emerald-50'} />
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
              <label className="block text-sm font-medium text-gray-700 mb-1">No. CDP</label>
              <input name="cdp" value={form.cdp} onChange={handleChange}
                placeholder="2024-001" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No. CRP</label>
              <input name="crp" value={form.crp} onChange={handleChange}
                placeholder="2024-001" className={inputClass} />
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
