'use client'

/**
 * Corrección de los datos del contrato.
 *
 * Antes no existía: un error de digitación en el número, el objeto o el valor
 * era permanente para todos los roles, incluido el admin.
 *
 * La libertad para corregir se estrecha a medida que el expediente avanza, y
 * la pantalla lo dice en vez de limitarse a deshabilitar campos: quien intenta
 * corregir un valor después de generar los periodos necesita saber que la vía
 * correcta es un otrosí, no quedarse mirando un campo gris.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Toaster, toast } from 'sonner'
import SelectorSupervisor from '@/components/SelectorSupervisor'
import EstadoContratoPanel from './EstadoContratoPanel'
import EliminarContrato from './EliminarContrato'
import type { EstadoContrato } from '@/lib/estado-contrato'
import { numerosALetras } from '@/lib/numero-letras'
import {
  actualizarContrato,
  type CampoContrato, type CamposBloqueados, type CambioContrato, type ResumenBorrado,
} from '@/app/actions/contratos'
import type { UsuarioSelect } from '@/services/admin'

const ETIQUETAS: Record<string, string> = {
  numero: 'Número', anio: 'Año', objeto: 'Objeto', modalidad_seleccion: 'Modalidad',
  valor_total: 'Valor total', valor_mensual: 'Valor mensual',
  valor_letras_total: 'Valor total en letras', valor_letras_mensual: 'Valor mensual en letras',
  plazo_dias: 'Plazo (días)', fecha_inicio: 'Fecha de inicio', fecha_fin: 'Fecha de terminación',
  cdp: 'CDP', crp: 'RP', secop_url: 'Enlace SECOP',
  supervisor_id: 'Supervisor', dependencia_id: 'Dependencia',
}

const input =
  'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white outline-none'
const inputBloqueado =
  'w-full px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-400 cursor-not-allowed'

export default function EditarContratoClient({
  contrato, dependencias, supervisores, bloqueo, historial, resumenBorrado,
}: {
  contrato: Record<string, any>
  dependencias: { id: string; nombre: string }[]
  supervisores: UsuarioSelect[]
  bloqueo: CamposBloqueados
  historial: CambioContrato[]
  /** Null para quien no es administrador: el bloque no se renderiza. */
  resumenBorrado: ResumenBorrado | null
}) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)

  const [f, setF] = useState({
    numero: contrato.numero ?? '',
    anio: String(contrato.anio ?? ''),
    objeto: contrato.objeto ?? '',
    supervisor_id: contrato.supervisor_id ?? '',
    dependencia_id: contrato.dependencia_id ?? '',
    valor_total: String(contrato.valor_total ?? ''),
    valor_mensual: String(contrato.valor_mensual ?? ''),
    plazo_dias: String(contrato.plazo_dias ?? ''),
    fecha_inicio: contrato.fecha_inicio ?? '',
    fecha_fin: contrato.fecha_fin ?? '',
    cdp: contrato.cdp ?? '',
    crp: contrato.crp ?? '',
    secop_url: contrato.secop_url ?? '',
  })

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)

    const cambios: Partial<Record<CampoContrato, string | number | null>> = {
      supervisor_id: f.supervisor_id,
      dependencia_id: f.dependencia_id,
      cdp: f.cdp || null,
      crp: f.crp || null,
      secop_url: f.secop_url || null,
    }

    if (!bloqueo.identidad) {
      cambios.numero = f.numero
      cambios.anio = Number(f.anio)
      cambios.objeto = f.objeto
    }

    if (!bloqueo.economicos) {
      cambios.valor_total = Number(f.valor_total)
      cambios.valor_mensual = Number(f.valor_mensual)
      cambios.plazo_dias = Number(f.plazo_dias)
      cambios.fecha_inicio = f.fecha_inicio
      cambios.fecha_fin = f.fecha_fin
      // Las letras se derivan del número: dejarlas desactualizadas produciría
      // documentos donde la cifra y su expresión escrita no coinciden.
      cambios.valor_letras_total = numerosALetras(Number(f.valor_total))
      cambios.valor_letras_mensual = numerosALetras(Number(f.valor_mensual))
    }

    const res = await actualizarContrato(contrato.id, cambios)
    setGuardando(false)

    if (res.error) { toast.error(res.error); return }
    if (res.data?.camposActualizados === 0) { toast('No hubo cambios que guardar'); return }

    toast.success(`${res.data!.camposActualizados} campo(s) actualizado(s)`)
    router.push(`/dashboard/contratos/${contrato.id}`)
    router.refresh()
  }

  return (
    <div className="max-w-3xl">
      <Toaster position="top-center" richColors />

      <Link
        href={`/dashboard/contratos/${contrato.id}`}
        className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← Volver al contrato
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-1">
        Editar contrato N.° {contrato.numero}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Cada cambio queda registrado con tu nombre y la fecha.
      </p>

      <div className="mb-4">
        <EstadoContratoPanel
          contratoId={contrato.id}
          estadoActual={(contrato.estado ?? 'vigente') as EstadoContrato}
          fechaEstado={contrato.estado_fecha ?? null}
          motivoEstado={contrato.estado_motivo ?? null}
        />
      </div>

      <form onSubmit={guardar} className="space-y-4">

        {/* ── Identidad y objeto ── */}
        <Seccion titulo="Identidad y objeto" bloqueo={bloqueo.identidad ? bloqueo.motivoIdentidad : null}>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Número">
              <input value={f.numero} onChange={set('numero')} disabled={bloqueo.identidad}
                className={bloqueo.identidad ? inputBloqueado : input} />
            </Campo>
            <Campo etiqueta="Año">
              <input type="number" value={f.anio} onChange={set('anio')} disabled={bloqueo.identidad}
                className={bloqueo.identidad ? inputBloqueado : input} />
            </Campo>
          </div>
          <Campo etiqueta="Objeto">
            <textarea rows={3} value={f.objeto} onChange={set('objeto')} disabled={bloqueo.identidad}
              className={`${bloqueo.identidad ? inputBloqueado : input} resize-none`} />
          </Campo>
        </Seccion>

        {/* ── Supervisión ── */}
        <Seccion titulo="Supervisión">
          <SelectorSupervisor
            supervisores={supervisores}
            dependencias={dependencias}
            supervisorId={f.supervisor_id}
            dependenciaId={f.dependencia_id}
            onChange={(sup, dep) => setF(prev => ({ ...prev, supervisor_id: sup, dependencia_id: dep }))}
          />
        </Seccion>

        {/* ── Valores y plazo ── */}
        <Seccion titulo="Valores y plazo" bloqueo={bloqueo.economicos ? bloqueo.motivoEconomicos : null}>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Valor total">
              <input type="number" value={f.valor_total} onChange={set('valor_total')} disabled={bloqueo.economicos}
                className={bloqueo.economicos ? inputBloqueado : input} />
            </Campo>
            <Campo etiqueta="Valor mensual">
              <input type="number" value={f.valor_mensual} onChange={set('valor_mensual')} disabled={bloqueo.economicos}
                className={bloqueo.economicos ? inputBloqueado : input} />
            </Campo>
            <Campo etiqueta="Plazo (días)">
              <input type="number" value={f.plazo_dias} onChange={set('plazo_dias')} disabled={bloqueo.economicos}
                className={bloqueo.economicos ? inputBloqueado : input} />
            </Campo>
            <div />
            <Campo etiqueta="Fecha de inicio">
              <input type="date" value={f.fecha_inicio} onChange={set('fecha_inicio')} disabled={bloqueo.economicos}
                className={bloqueo.economicos ? inputBloqueado : input} />
            </Campo>
            <Campo etiqueta="Fecha de terminación">
              <input type="date" value={f.fecha_fin} onChange={set('fecha_fin')} disabled={bloqueo.economicos}
                className={bloqueo.economicos ? inputBloqueado : input} />
            </Campo>
          </div>
        </Seccion>

        {/* ── Presupuesto y publicación — siempre corregibles ── */}
        <Seccion titulo="Presupuesto y publicación">
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="CDP"><input value={f.cdp} onChange={set('cdp')} className={input} /></Campo>
            <Campo etiqueta="RP"><input value={f.crp} onChange={set('crp')} className={input} /></Campo>
          </div>
          <Campo etiqueta="Enlace SECOP">
            <input value={f.secop_url} onChange={set('secop_url')} placeholder="https://www.secop.gov.co/…" className={input} />
          </Campo>
        </Seccion>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={guardando}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <Link href={`/dashboard/contratos/${contrato.id}`}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Cancelar
          </Link>
        </div>
      </form>

      {resumenBorrado && (
        <div className="mt-8">
          <EliminarContrato
            contratoId={contrato.id}
            numero={contrato.numero}
            anio={contrato.anio}
            resumen={resumenBorrado}
          />
        </div>
      )}

      {/* ── Historial ── */}
      {historial.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setVerHistorial(v => !v)}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            {verHistorial ? '▾' : '▸'} Historial de cambios ({historial.length})
          </button>

          {verHistorial && (
            <div className="mt-3 bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
              {historial.map(h => (
                <div key={h.id} className="px-4 py-2.5 text-xs">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-gray-700">{ETIQUETAS[h.campo] ?? h.campo}</span>
                    <span className="text-gray-400 line-through break-all">{h.valor_anterior ?? '—'}</span>
                    <span className="text-gray-300">→</span>
                    <span className="text-gray-900 break-all">{h.valor_nuevo ?? '—'}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {h.usuario} · {new Date(h.created_at).toLocaleString('es-CO', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Seccion({
  titulo, bloqueo, children,
}: {
  titulo: string
  bloqueo?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">{titulo}</h3>
        {bloqueo && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Bloqueado
          </span>
        )}
      </div>
      {/* El motivo va escrito, no implícito en un campo gris: dice además cuál
          es la vía correcta para el cambio que se quería hacer. */}
      {bloqueo && <p className="text-xs text-amber-800 bg-amber-50/60 border border-amber-100 rounded-xl px-3 py-2 mb-4">{bloqueo}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{etiqueta}</label>
      {children}
    </div>
  )
}
