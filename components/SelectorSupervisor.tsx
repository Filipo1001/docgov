'use client'

/**
 * Selección del supervisor del contrato.
 *
 * Sustituye a dos desplegables independientes —Dependencia y Supervisor— que
 * pedían por separado un mismo hecho: en el municipio cada secretaría tiene un
 * titular, y es él quien supervisa sus contratos. Preguntar las dos cosas
 * abría la puerta a combinaciones imposibles (contrato de Hacienda supervisado
 * por la secretaria de Bienestar) sin que nada lo impidiera.
 *
 * Ahora se elige a la persona y la dependencia se deduce. Se muestra deducida,
 * no oculta: quien registra el contrato tiene que poder verificar que el
 * encabezado del documento saldrá con la secretaría correcta. Y si un titular
 * llegara a supervisar contratos de otra secretaría —cargos encargados,
 * reestructuraciones— el enlace "cambiar" deja corregirla sin salir del paso.
 */

import { useState } from 'react'
import Avatar from '@/components/ui/Avatar'

export interface SupervisorOpcion {
  id: string
  nombre_completo: string
  cargo: string | null
  foto_url: string | null
  dependencia_id: string | null
}

export interface DependenciaOpcion {
  id: string
  nombre: string
}

interface Props {
  supervisores: SupervisorOpcion[]
  dependencias: DependenciaOpcion[]
  supervisorId: string
  dependenciaId: string
  onChange: (supervisorId: string, dependenciaId: string) => void
  /** Deshabilitado en contratos que ya no admiten cambio de supervisor. */
  disabled?: boolean
}

export default function SelectorSupervisor({
  supervisores, dependencias, supervisorId, dependenciaId, onChange, disabled,
}: Props) {
  const [ajustandoDep, setAjustandoDep] = useState(false)

  const nombreDep = (id: string) => dependencias.find(d => d.id === id)?.nombre ?? null
  const seleccionado = supervisores.find(s => s.id === supervisorId) ?? null

  function elegir(s: SupervisorOpcion) {
    if (disabled) return
    // Si el titular no tiene secretaría registrada se conserva la que ya
    // hubiera, en vez de borrarla y dejar el contrato sin dependencia.
    onChange(s.id, s.dependencia_id ?? dependenciaId)
    setAjustandoDep(false)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Supervisor del contrato <span className="text-red-500">*</span>
      </label>

      <div
        role="radiogroup"
        aria-label="Supervisor del contrato"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {supervisores.map(s => {
          const activo = s.id === supervisorId
          const dep = s.dependencia_id ? nombreDep(s.dependencia_id) : null
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={activo}
              disabled={disabled}
              onClick={() => elegir(s)}
              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all
                ${activo
                  ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Avatar nombre={s.nombre_completo} foto={s.foto_url} size="md" />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${activo ? 'text-blue-900' : 'text-gray-900'}`}>
                  {s.nombre_completo}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {dep ?? s.cargo ?? 'Sin secretaría asignada'}
                </p>
              </div>
              {activo && (
                <svg className="w-5 h-5 text-blue-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {/* Dependencia deducida — visible y corregible, nunca en silencio. */}
      {seleccionado && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-gray-400">Dependencia:</span>
          {ajustandoDep ? (
            <>
              <select
                value={dependenciaId}
                onChange={e => onChange(supervisorId, e.target.value)}
                className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">— Seleccionar —</option>
                {dependencias.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <button type="button" onClick={() => setAjustandoDep(false)}
                className="text-gray-400 hover:text-gray-600">listo</button>
            </>
          ) : (
            <>
              <span className="font-medium text-gray-700">
                {nombreDep(dependenciaId) ?? 'sin asignar'}
              </span>
              {!disabled && (
                <button type="button" onClick={() => setAjustandoDep(true)}
                  className="text-blue-600 hover:text-blue-700 underline underline-offset-2">
                  cambiar
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
