'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toaster, toast } from 'sonner'
import { marcarComoHistorico, desmarcarHistorico } from '@/app/actions/periodos'
import { ESTADO_COLOR, ESTADO_LABEL, HISTORICO_COLOR, HISTORICO_LABEL } from '@/lib/constants'
import type { Periodo } from '@/lib/types'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import FilterTabs from '@/components/ui/FilterTabs'
import EmptyState from '@/components/ui/EmptyState'

type Tab = 'candidatos' | 'marcados'

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Row component ────────────────────────────────────────────────────────────

function PeriodoRow({
  periodo,
  modo,
  onDone,
}: {
  periodo: Periodo & { marcadoPor?: { nombre_completo: string } }
  modo: 'marcar' | 'desmarcar'
  onDone: () => void
}) {
  const [procesando, setProcesando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [nota, setNota] = useState('')

  const contrato = (periodo as any).contrato
  const contratista = contrato?.contratista?.nombre_completo ?? '—'
  const contratoNum = contrato?.numero ?? '—'
  const dependencia = contrato?.dependencia?.abreviatura ?? '—'

  async function handleMarcar() {
    setProcesando(true)
    const res = await marcarComoHistorico(periodo.id, nota)
    if (res.error) {
      toast.error(res.error)
      setProcesando(false)
    } else {
      toast.success('Periodo marcado como histórico')
      setConfirmar(false)
      onDone()
    }
  }

  async function handleDesmarcar() {
    setProcesando(true)
    const res = await desmarcarHistorico(periodo.id)
    if (res.error) {
      toast.error(res.error)
      setProcesando(false)
    } else {
      toast.success('Marca histórico removida')
      onDone()
    }
  }

  return (
    <div className="p-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-4">
        {/* Left: period info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">
              {periodo.mes} {periodo.anio}
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">Contrato N.° {contratoNum}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">{dependencia}</span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">{contratista}</p>
          {modo === 'desmarcar' && (
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <span className="text-xs text-amber-600">
                Marcado {formatFecha(periodo.historico_marcado_at)}
              </span>
              {(periodo as any).marcadoPor && (
                <span className="text-xs text-gray-400">
                  por {(periodo as any).marcadoPor.nombre_completo}
                </span>
              )}
              {periodo.historico_nota && (
                <span className="text-xs text-gray-500 italic">"{periodo.historico_nota}"</span>
              )}
            </div>
          )}
        </div>

        {/* Right: estado badge + action */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESTADO_COLOR[periodo.estado] ?? 'bg-gray-100 text-gray-600'}`}>
            {ESTADO_LABEL[periodo.estado] ?? periodo.estado}
          </span>

          {modo === 'marcar' && !confirmar && (
            <button
              onClick={() => setConfirmar(true)}
              className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-medium hover:bg-amber-200 transition-colors"
            >
              🔒 Marcar como histórico
            </button>
          )}

          {modo === 'desmarcar' && (
            <button
              onClick={handleDesmarcar}
              disabled={procesando}
              className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {procesando ? '...' : 'Desmarcar'}
            </button>
          )}
        </div>
      </div>

      {/* Inline confirmation form */}
      {confirmar && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-amber-800">
            Confirmar: este periodo quedará congelado permanentemente. ¿Continuar?
          </p>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota opcional (ej: procesado físicamente antes del sistema)"
            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-300 bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={handleMarcar}
              disabled={procesando}
              className="text-xs px-4 py-1.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {procesando ? 'Guardando...' : 'Confirmar'}
            </button>
            <button
              onClick={() => { setConfirmar(false); setNota('') }}
              className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoricosClient({
  candidatos,
  yaHistoricos,
}: {
  candidatos: Periodo[]
  yaHistoricos: Periodo[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('candidatos')

  function refresh() {
    router.refresh()
  }

  const lista = tab === 'candidatos' ? candidatos : yaHistoricos

  return (
    <div className="max-w-4xl">
      <Toaster position="top-center" richColors />

      <PageHeader
        title="Periodos históricos"
        subtitle="Marca periodos que fueron procesados físicamente antes de la digitalización del sistema. Quedarán congelados e inmutables."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Candidatos" value={candidatos.length} color="gray" />
        <StatCard label="Ya marcados" value={yaHistoricos.length} color="amber" />
      </div>

      {/* Tabs */}
      <FilterTabs<Tab>
        options={[
          { key: 'candidatos', label: 'Candidatos', count: candidatos.length },
          { key: 'marcados', label: 'Ya marcados', count: yaHistoricos.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-4">
        {lista.length === 0 ? (
          <Card>
            <EmptyState
              icon={tab === 'candidatos' ? '✅' : '🔒'}
              title={tab === 'candidatos' ? 'No hay candidatos' : 'Ningún periodo marcado aún'}
              description={
                tab === 'candidatos'
                  ? 'Todos los periodos del sistema están activos en el flujo normal.'
                  : 'Marca periodos históricos desde la pestaña "Candidatos".'
              }
            />
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            {lista.map((p) => (
              <PeriodoRow
                key={p.id}
                periodo={p as any}
                modo={tab === 'candidatos' ? 'marcar' : 'desmarcar'}
                onDone={refresh}
              />
            ))}
          </Card>
        )}
      </div>

      {/* Explanation box */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-amber-800 mb-1">¿Qué hace esta función?</h3>
        <p className="text-xs text-amber-700 leading-relaxed">
          Un periodo histórico es un registro congelado: no puede ser editado, enviado, aprobado,
          rechazado, ni se le pueden subir documentos. Está protegido a nivel de base de datos.
          Úsalo para periodos que ya fueron tramitados físicamente antes de que el sistema existiera.
          Si marcas un periodo por error, puedes desmarcarlo desde la pestaña "Ya marcados".
        </p>
      </div>
    </div>
  )
}
