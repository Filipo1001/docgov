/**
 * La carga por persona: cuántas personas hay en cada tramo de «indicadores a su cargo» (ver `distribucionDeCarga`).
 *
 * Dice si el trabajo está repartido parejo; no nombra a nadie ni ordena a nadie. Quién lleva qué lo dice la lista de personas,
 * justo debajo, que ya viene ordenada por carga. Con una sola cifra por tramo no hay nada que adivinar: la barra solo
 * acompaña, y su escala es la del tramo más poblado.
 *
 * Es de presentación pura.
 */

import { fmt } from '@/lib/pdm/plan'
import type { DistribucionDeCarga } from '@/lib/pdm/graficos'
import { Panel } from './ui'
import { T } from './tema'

export default function CargaPorPersona({ d }: { d: DistribucionDeCarga }) {
  if (d.personas === 0) return null
  const mayor = Math.max(1, ...d.tramos.map(t => t.personas))
  return (
    <Panel titulo="Carga por persona" nota={`${d.personas} ${d.personas === 1 ? 'persona' : 'personas'}`}>
      <p className={`text-sm leading-snug ${T.tinta}`}>
        {d.personas === 1
          ? `Lleva ${d.maximo} ${d.maximo === 1 ? 'indicador' : 'indicadores'}.`
          : `Entre ${d.minimo} y ${d.maximo} indicadores por persona; la mediana es ${fmt(d.mediana)}.`}
      </p>
      <p className={`mt-0.5 text-xs ${T.suave}`}>Cuenta los que lleva cada una como principal o de apoyo.</p>

      <p className={`mt-4 ${T.rotulo}`}>Indicadores por persona</p>
      <ul className="mt-2.5 max-w-xl space-y-2.5">
        {d.tramos.map(t => (
          <li key={t.rotulo} aria-label={`${t.rotulo} indicadores: ${t.personas} ${t.personas === 1 ? 'persona' : 'personas'}`} className="grid grid-cols-[4.25rem_minmax(0,1fr)_5rem] items-center gap-3 text-xs">
            <span className="tabular-nums text-[#556072]" aria-hidden>{t.rotulo}</span>
            <span className="block h-2 overflow-hidden rounded-[3px] bg-[#E6E9EF]" aria-hidden>
              <span
                className="block h-full w-full origin-left bg-[#192031] transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{ transform: `scaleX(${t.personas / mayor})` }}
              />
            </span>
            <span className="text-right" aria-hidden>
              <b className={`text-sm font-semibold tabular-nums ${t.personas === 0 ? 'text-[#667085]' : 'text-[#192031]'}`}>{t.personas}</b>{' '}
              <span className="text-[#667085]">{t.personas === 1 ? 'persona' : 'personas'}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
