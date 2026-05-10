'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import { parsearExcel, confirmarImportacion } from '@/app/actions/importar'
import type { FilaImport, ImportResult } from '@/app/actions/importar'

// ─── Step indicator ───────────────────────────────────────────────────────────

function Paso({ n, label, activo, done }: { n: number; label: string; activo: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        done ? 'bg-emerald-500 text-white' : activo ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
      }`}>
        {done ? '✓' : n}
      </div>
      <span className={`text-sm font-medium ${activo ? 'text-gray-900' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
        {label}
      </span>
    </div>
  )
}

// ─── Preview row ──────────────────────────────────────────────────────────────

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function EstadoBadge({ fila }: { fila: FilaImport }) {
  if (fila.errores_bloqueo.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        ✕ {fila.errores_bloqueo.length} error{fila.errores_bloqueo.length > 1 ? 'es' : ''}
      </span>
    )
  }
  if (fila.advertencias.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        ⚠ {fila.advertencias.length} aviso{fila.advertencias.length > 1 ? 's' : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      ✓ Listo
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Paso = 1 | 2 | 3

export default function ImportarClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [paso, setPaso] = useState<Paso>(1)
  const [cargando, setCargando] = useState(false)
  const [filas, setFilas] = useState<FilaImport[]>([])
  const [resultado, setResultado] = useState<ImportResult | null>(null)
  const [expandida, setExpandida] = useState<number | null>(null)

  // ── Step 1: Upload & parse ─────────────────────────────────────────────────
  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.xlsx')) {
      toast.error('Solo se aceptan archivos .xlsx')
      return
    }

    setCargando(true)
    try {
      const fd = new FormData()
      fd.append('archivo', file)
      const result = await parsearExcel(fd)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setFilas(result.data!.filas)
      setPaso(2)
    } catch {
      toast.error('Error al procesar el archivo')
    } finally {
      setCargando(false)
      e.target.value = ''
    }
  }

  // ── Step 2: Confirm import ─────────────────────────────────────────────────
  async function handleImportar() {
    const filasOk = filas.filter(f => f.ok)
    if (filasOk.length === 0) {
      toast.error('No hay filas válidas para importar')
      return
    }
    setCargando(true)
    try {
      const result = await confirmarImportacion(filasOk)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setResultado(result.data!)
      setPaso(3)
    } catch {
      toast.error('Error durante la importación')
    } finally {
      setCargando(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const filasOk  = filas.filter(f => f.ok)
  const filasAdv = filas.filter(f => f.ok && f.advertencias.length > 0)
  const filasErr = filas.filter(f => !f.ok)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/admin/usuarios" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Importar desde Excel</h1>
          <p className="text-sm text-gray-500">Crea usuarios y contratos en masa desde tu archivo</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-4">
        <Paso n={1} label="Subir archivo" activo={paso === 1} done={paso > 1} />
        <div className="flex-1 h-px bg-gray-200" />
        <Paso n={2} label="Revisar y confirmar" activo={paso === 2} done={paso > 2} />
        <div className="flex-1 h-px bg-gray-200" />
        <Paso n={3} label="Resultado" activo={paso === 3} done={false} />
      </div>

      {/* ── PASO 1: Upload ──────────────────────────────────────────────────── */}
      {paso === 1 && (
        <div
          className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-16 flex flex-col items-center gap-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {cargando ? (
            <>
              <svg className="w-10 h-10 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-sm text-gray-500">Analizando el archivo…</p>
            </>
          ) : (
            <>
              <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div className="text-center">
                <p className="text-base font-semibold text-gray-700">Haz clic para seleccionar el Excel</p>
                <p className="text-sm text-gray-400 mt-1">Solo archivos .xlsx</p>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleArchivo} />
        </div>
      )}

      {/* ── PASO 2: Preview ─────────────────────────────────────────────────── */}
      {paso === 2 && (
        <div className="space-y-4">

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{filasOk.length}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Listos para importar</p>
            </div>
            <div className={`rounded-2xl border p-4 text-center ${filasAdv.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-2xl font-bold ${filasAdv.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{filasAdv.length}</p>
              <p className={`text-xs mt-0.5 ${filasAdv.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Con avisos (se importan)</p>
            </div>
            <div className={`rounded-2xl border p-4 text-center ${filasErr.length > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-2xl font-bold ${filasErr.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{filasErr.length}</p>
              <p className={`text-xs mt-0.5 ${filasErr.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>Con errores (se omiten)</p>
            </div>
          </div>

          {filasErr.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <span className="font-semibold">Nota:</span> Los {filasErr.length} contratos con errores no serán importados.
              Puedes ingresarlos manualmente después o corregir el Excel y volver a subir.
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 w-24">Nº Contrato</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Contratista</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Cédula/NIT</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Supervisor</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Dependencia</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right hidden md:table-cell">Valor total</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filas.map((fila, i) => (
                    <>
                      <tr
                        key={fila.numero + i}
                        className={`cursor-pointer transition-colors ${
                          fila.errores_bloqueo.length > 0 ? 'bg-red-50/40 hover:bg-red-50' :
                          fila.advertencias.length > 0 ? 'hover:bg-amber-50/40' :
                          'hover:bg-gray-50'
                        }`}
                        onClick={() => setExpandida(expandida === i ? null : i)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{fila.numero}-{fila.anio}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 text-xs leading-tight">
                            {fila.nombre_contratista.split(' ').slice(0, 4).join(' ')}
                          </p>
                          <p className="text-[10px] text-gray-400">{fila.tipo_documento}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell font-mono">{fila.cedula}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">
                          {fila.supervisor_nombre_resuelto
                            ? fila.supervisor_nombre_resuelto.split(' ').slice(0, 2).join(' ')
                            : <span className="text-red-400">No encontrado</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 hidden lg:table-cell">
                          {fila.dependencia_id
                            ? fila.dependencia_nombre_excel.replace(/^Secretar[ií]a\s+/i, 'Sec. ')
                            : <span className="text-red-400">No encontrada</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 text-right hidden md:table-cell tabular-nums">
                          {formatCOP(fila.valor_total)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <EstadoBadge fila={fila} />
                        </td>
                      </tr>
                      {expandida === i && (fila.errores_bloqueo.length > 0 || fila.advertencias.length > 0) && (
                        <tr key={`exp-${i}`} className={fila.errores_bloqueo.length > 0 ? 'bg-red-50' : 'bg-amber-50'}>
                          <td colSpan={7} className="px-4 pb-3 pt-1">
                            {fila.errores_bloqueo.map((e, j) => (
                              <p key={j} className="text-xs text-red-700">✕ {e}</p>
                            ))}
                            {fila.advertencias.map((a, j) => (
                              <p key={j} className="text-xs text-amber-700">⚠ {a}</p>
                            ))}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => { setFilas([]); setPaso(1) }}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition"
            >
              ← Subir otro archivo
            </button>
            <button
              onClick={handleImportar}
              disabled={cargando || filasOk.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {cargando ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Importando…
                </>
              ) : (
                `Importar ${filasOk.length} contrato${filasOk.length !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3: Result ──────────────────────────────────────────────────── */}
      {paso === 3 && resultado && (
        <div className="space-y-4">

          {/* Big success card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Importación completada</h2>
            <p className="text-sm text-gray-500">Los usuarios y contratos han sido creados en el sistema</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{resultado.contratos_creados}</p>
              <p className="text-xs text-gray-500 mt-0.5">Contratos creados</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{resultado.usuarios_creados}</p>
              <p className="text-xs text-gray-500 mt-0.5">Usuarios nuevos</p>
            </div>
            <div className="bg-white rounded-2xl border p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{resultado.usuarios_existentes}</p>
              <p className="text-xs text-gray-500 mt-0.5">Usuarios existentes</p>
            </div>
            <div className={`rounded-2xl border p-4 text-center ${resultado.errores.length > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
              <p className={`text-2xl font-bold ${resultado.errores.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{resultado.errores.length}</p>
              <p className={`text-xs mt-0.5 ${resultado.errores.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>Errores</p>
            </div>
          </div>

          {/* Errors detail */}
          {resultado.errores.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="bg-red-50 px-4 py-3 border-b border-red-100">
                <p className="text-sm font-semibold text-red-700">Contratos no importados</p>
              </div>
              <div className="divide-y divide-gray-100">
                {resultado.errores.map((e, i) => (
                  <div key={i} className="px-4 py-3 flex items-start gap-3">
                    <span className="font-mono text-xs text-gray-500 mt-0.5 w-20 shrink-0">{e.numero}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{e.nombre}</p>
                      <p className="text-xs text-red-600 mt-0.5">{e.error}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next step hint */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800">Siguiente paso — completar datos pendientes</p>
              <p className="text-xs text-amber-700 mt-1">
                Ve a <strong>Usuarios</strong> para agregar el correo, celular y cuenta bancaria de cada persona.
                Las contraseñas ya están activas: cada usuario inicia sesión con su número de documento.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Link
              href="/dashboard/admin/usuarios"
              className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors"
            >
              Ir a Usuarios →
            </Link>
            <Link
              href="/dashboard/contratos"
              className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
            >
              Ver contratos
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
