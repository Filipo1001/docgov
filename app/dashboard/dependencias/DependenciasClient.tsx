'use client'

import { useState } from 'react'
import { Toaster, toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'
import Avatar from '@/components/ui/Avatar'
import {
  crearDependencia, actualizarDependencia, eliminarDependencia, listarDependencias,
  type DependenciaDetalle,
} from '@/app/actions/dependencias'

export default function DependenciasClient({ initial }: { initial: DependenciaDetalle[] }) {
  const [deps, setDeps] = useState(initial)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState({ nombre: '', abreviatura: '' })
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function refrescar() {
    setDeps(await listarDependencias())
  }

  function abrirEdicion(d: DependenciaDetalle) {
    setCreando(false)
    setEditandoId(d.id)
    setForm({ nombre: d.nombre, abreviatura: d.abreviatura ?? '' })
  }

  function abrirCreacion() {
    setEditandoId(null)
    setCreando(true)
    setForm({ nombre: '', abreviatura: '' })
  }

  function cerrar() {
    setEditandoId(null)
    setCreando(false)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    const res = editandoId
      ? await actualizarDependencia(editandoId, form.nombre, form.abreviatura)
      : await crearDependencia(form.nombre, form.abreviatura)
    setGuardando(false)

    if (res.error) { toast.error(res.error); return }
    toast.success(editandoId ? 'Dependencia actualizada' : 'Dependencia creada')
    cerrar()
    await refrescar()
  }

  async function borrar(d: DependenciaDetalle) {
    const res = await eliminarDependencia(d.id)
    if (res.error) { toast.error(res.error); return }
    toast.success(`"${d.nombre}" eliminada`)
    await refrescar()
  }

  return (
    <div className="max-w-3xl">
      <Toaster position="top-center" richColors />

      <PageHeader
        title="Dependencias"
        subtitle="Secretarías del municipio y su titular"
        action={
          <button
            onClick={abrirCreacion}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Nueva
          </button>
        }
      />

      {/* Formulario de creación — encima de la lista, no en un modal: son
          dos campos y verlos junto al resto evita duplicar un nombre. */}
      {creando && (
        <FormularioDependencia
          form={form} setForm={setForm} guardando={guardando}
          onSubmit={guardar} onCancelar={cerrar} etiqueta="Crear"
        />
      )}

      <div className="space-y-2">
        {deps.map(d => (
          editandoId === d.id ? (
            <FormularioDependencia
              key={d.id}
              form={form} setForm={setForm} guardando={guardando}
              onSubmit={guardar} onCancelar={cerrar} etiqueta="Guardar"
            />
          ) : (
            <div
              key={d.id}
              className="group bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-4 hover:border-gray-300 transition-colors"
            >
              {d.supervisor ? (
                <Avatar nombre={d.supervisor.nombre_completo} foto={d.supervisor.foto_url} size="md" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-300 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{d.nombre}</p>
                  {d.abreviatura && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                      {d.abreviatura}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {d.supervisor
                    ? d.supervisor.nombre_completo
                    : 'Sin titular asignado'}
                  {' · '}
                  {d.contratos} {d.contratos === 1 ? 'contrato' : 'contratos'}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => abrirEdicion(d)}
                  title="Editar"
                  aria-label={`Editar ${d.nombre}`}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>
                {/* Solo se ofrece borrar lo que está vacío: con contratos
                    asociados la acción no puede prosperar. */}
                {d.contratos === 0 && d.usuarios === 0 && (
                  <button
                    onClick={() => borrar(d)}
                    title="Eliminar"
                    aria-label={`Eliminar ${d.nombre}`}
                    className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  )
}

function FormularioDependencia({
  form, setForm, guardando, onSubmit, onCancelar, etiqueta,
}: {
  form: { nombre: string; abreviatura: string }
  setForm: (f: { nombre: string; abreviatura: string }) => void
  guardando: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancelar: () => void
  etiqueta: string
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-blue-50/50 border border-blue-200 rounded-2xl p-4 mb-2 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
    >
      <div className="flex-1">
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre</label>
        <input
          autoFocus
          value={form.nombre}
          onChange={e => setForm({ ...form, nombre: e.target.value })}
          placeholder="Secretaría de…"
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <div className="sm:w-28">
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Sigla</label>
        <input
          value={form.abreviatura}
          onChange={e => setForm({ ...form, abreviatura: e.target.value })}
          placeholder="SDT"
          maxLength={8}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={guardando || form.nombre.trim().length < 4}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {guardando ? '…' : etiqueta}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
