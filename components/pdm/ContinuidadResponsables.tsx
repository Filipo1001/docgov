'use client'

/**
 * Quién responde como principal y ya no tiene contrato, o lo termina antes de que acabe el plan (ver `lib/pdm/continuidad.ts`).
 *
 * Avisa y lleva a donde se arregla: «Reasignar» abre Indicadores filtrado por esa persona, donde ya se puede seleccionar todo
 * y asignarlo a otra (el secretario, un funcionario de planta) dejando al contratista de apoyo. No reasigna nada por su cuenta.
 *
 * Solo lo ven quienes reparten (administrador y secretaría). Si nadie está en riesgo, no se pinta.
 */

import { useState } from 'react'
import Link from 'next/link'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import { resumirRiesgo, type MotivoDeRiesgo, type ResponsableEnRiesgo } from '@/lib/pdm/continuidad'
import { Avatar, LineaContrato } from './PersonaVista'
import { Panel } from './ui'
import { T } from './tema'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const VISIBLES = 6

const TITULO: Record<MotivoDeRiesgo, string> = {
  sin_contrato: 'Ya no tienen contrato',
  termina_antes: 'Su contrato termina antes de que acabe el plan',
}

function Grupo({ motivo, filas }: { motivo: MotivoDeRiesgo; filas: ResponsableEnRiesgo[] }) {
  const [todas, setTodas] = useState(false)
  if (filas.length === 0) return null
  const vistas = todas ? filas : filas.slice(0, VISIBLES)
  return (
    <div className="min-w-0">
      <h3 className={`${T.rotulo} ${motivo === 'sin_contrato' ? '!text-[#B42318]' : ''}`}>{TITULO[motivo]}</h3>
      <ul className={`mt-1 divide-y ${T.divide}`}>
        {vistas.map(({ persona: p, principal }) => (
          <li key={p.id} className="flex items-start gap-3 py-3">
            <Avatar nombre={p.nombre} fotoUrl={p.fotoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-5 text-[#192031]" title={p.nombre}>{p.nombre}</p>
              <LineaContrato contrato={p.contrato} className="leading-4" />
              <p className="text-xs leading-4 text-[#192031] sm:hidden"><b className="tabular-nums">{principal}</b> como principal</p>
            </div>
            <p className="hidden w-24 shrink-0 text-right sm:block">
              <b className="block text-sm leading-5 tabular-nums text-[#192031]">{principal}</b>
              <span className="text-[11px] text-[#667085]">como principal</span>
            </p>
            <span className="flex h-9 shrink-0 items-center">
              <Link href={`${HREF_INDICADORES}?usuario=${encodeURIComponent(p.id)}`} className={T.botonSecChico}>Reasignar</Link>
            </span>
          </li>
        ))}
      </ul>
      {filas.length > VISIBLES && (
        <button type="button" onClick={() => setTodas(v => !v)} className={`mt-1 text-xs ${T.enlace}`}>
          {todas ? 'Ver menos' : `Ver las ${filas.length}`}
        </button>
      )}
    </div>
  )
}

export default function ContinuidadResponsables({ lista }: { lista: ResponsableEnRiesgo[] }) {
  if (lista.length === 0) return null
  const r = resumirRiesgo(lista)
  const indicadores = r.sin_contrato.indicadores + r.termina_antes.indicadores
  return (
    <Panel titulo="Continuidad de los responsables" nota={`${plural(lista.length, 'persona', 'personas')} · ${plural(indicadores, 'indicador', 'indicadores')}`}>
      <p className={`max-w-3xl text-sm leading-relaxed ${T.suave}`}>
        Son responsables principales y su contrato ya terminó, o termina antes del 31 de diciembre de 2027, cuando el plan todavía
        necesita reportes. Lo recomendable es que el principal sea alguien de planta (el secretario o un funcionario) y que el contratista quede de apoyo.
      </p>
      <div className="mt-4 space-y-5">
        <Grupo motivo="sin_contrato" filas={lista.filter(x => x.motivo === 'sin_contrato')} />
        <Grupo motivo="termina_antes" filas={lista.filter(x => x.motivo === 'termina_antes')} />
      </div>
    </Panel>
  )
}
