/**
 * Los grupos de los que formo parte, en «Mi trabajo».
 *
 * Quien responde por indicadores no ve la pestaña «Responsables» (es el directorio de la secretaría),
 * así que no tenía dónde saber con quién comparte el trabajo. Aquí se ve: cada grupo con su líder, sus
 * compañeros y los indicadores que le llegan por él. Es solo lectura: los grupos los arma y los edita
 * la secretaría.
 *
 * De los compañeros se muestra el nombre y la foto, y nada más.
 */

import Link from 'next/link'
import { HREF_INDICADORES } from '@/lib/pdm/menu'
import type { GrupoMio } from '@/lib/pdm/mi-trabajo'
import { Avatar } from './PersonaVista'
import { Panel } from './ui'
import { T } from './tema'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export default function MisGrupos({ grupos }: { grupos: GrupoMio[] }) {
  return (
    <Panel titulo="Mis grupos" nota={plural(grupos.length, 'grupo', 'grupos')} className="overflow-hidden" sinRelleno>
      <ul className={`divide-y ${T.divide}`}>
        {grupos.map(g => (
          <li key={g.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className={`min-w-0 text-sm font-semibold ${T.tinta}`}>{g.nombre}</p>
              {g.indicadores > 0 && (
                <Link href={`${HREF_INDICADORES}?grupo=${g.id}`} className={`shrink-0 text-xs ${T.enlace}`}>
                  Ver sus indicadores
                </Link>
              )}
            </div>
            <p className={`mt-0.5 text-xs ${T.tenue}`}>
              {g.secretaria} · {g.indicadores > 0 ? `${plural(g.indicadores, 'indicador', 'indicadores')} a tu cargo por este grupo` : 'sin indicadores asignados todavía'}
            </p>
            {g.descripcion && <p className={`mt-2 text-sm leading-snug ${T.suave}`}>{g.descripcion}</p>}

            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2.5">
              {g.miembros.map(m => (
                <li key={m.id} className="flex min-w-0 items-center gap-2.5">
                  {/* La foto mide lo que miden sus líneas: 32 px si es una (el nombre), 36 px si son dos (nombre + «Líder»). */}
                  <Avatar nombre={m.nombre} fotoUrl={m.fotoUrl} tamano={m.esLider ? 'md' : 'sm'} apagado={!m.activo} />
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-medium leading-5 ${m.activo ? T.tinta : T.tenue}`}>
                      {m.nombre}{m.soyYo && <span className={`font-normal ${T.tenue}`}> (tú)</span>}
                    </span>
                    {m.esLider && <span className={`block text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] ${T.tenue}`}>Líder</span>}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
