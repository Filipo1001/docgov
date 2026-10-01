'use client'

/**
 * Home del rol Funcionario: personal de planta de la Alcaldía sin contratos ni
 * informes en Contratista Digital.
 *
 * Hoy su única razón de estar aquí es el módulo Plan de Desarrollo, y por eso esta
 * pantalla solo habla de eso. Existe aparte (y no cae en la de los revisores, que
 * es lo que pasaría con un rol que ninguna pantalla conociera) porque un
 * funcionario no revisa nada: mostrarle un tablero de revisión vacío sería una
 * promesa falsa.
 *
 * Cuándo ve el botón del módulo lo decide el servidor (`moduloPdmVisible`), con la
 * misma pregunta que usa la barra lateral. Mientras el módulo no esté habilitado
 * para esta persona, la pantalla lo dice con claridad en vez de quedar vacía.
 */

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { nivelPdm } from '@/app/actions/pdm'
import { MARCO_PDM_DISPONIBLE } from '@/lib/pdm/menu'
import { capitalizarNombre } from '@/lib/format'
import { ITEM_PLAN_DESARROLLO } from '@/lib/pdm/menu'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'

function saludo(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function FuncionarioHome({ nombre }: { nombre: string }) {
  // Misma clave que la barra lateral: una sola respuesta del servidor para las dos. Donde el módulo
  // no existe (producción) no se pregunta nada y la pantalla dice que todavía no hay acceso.
  const { data: nivel, isLoading } = useQuery({
    queryKey: ['pdm-acceso'],
    queryFn: () => nivelPdm(),
    enabled: MARCO_PDM_DISPONIBLE,
    staleTime: Infinity,
    retry: false,
  })
  const pdmVisible = nivel != null

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`${saludo()}, ${capitalizarNombre(nombre.split(' ')[0])}`}
        subtitle="Funcionario de la Alcaldía de Fredonia"
      />

      <Card>
        <div className="p-6">
          <h2 className="text-base font-semibold text-gray-900">Plan de Desarrollo</h2>
          {MARCO_PDM_DISPONIBLE && isLoading ? (
            <div className="mt-3 h-4 w-64 animate-pulse rounded bg-gray-100" />
          ) : pdmVisible ? (
            <>
              <p className="mt-2 text-sm text-gray-600">
                Aquí ves los indicadores del plan que están a tu cargo.
              </p>
              <Link
                href={ITEM_PLAN_DESARROLLO.href}
                className="mt-4 inline-flex rounded-xl bg-[#192031] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#242F45]"
              >
                Entrar al Plan de Desarrollo
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Tu cuenta ya existe, pero todavía no tienes acceso al Plan de Desarrollo. Cuando tu secretaría te lo
              habilite, el botón aparecerá en el menú.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
