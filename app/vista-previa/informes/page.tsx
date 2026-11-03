'use client'

// TEMPORAL — vista previa del rediseño de /dashboard/informes con datos de EJEMPLO (nombres inventados). Se borra antes de
// publicar el rediseño. No lee la base ni necesita sesión.

import { useMemo, useState } from 'react'
import TarjetaInforme, { type DatosTarjetaInforme, type EstadoTarjeta } from '@/components/informes/TarjetaInforme'
import { opcionesDeInforme } from '@/components/informes/opciones-informe'
import SearchInput from '@/components/ui/SearchInput'
import FilterTabs from '@/components/ui/FilterTabs'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'

const EJEMPLO: DatosTarjetaInforme[] = [
  { id: '1', nombre: 'LAURA VÉLEZ RÍOS', foto: null, numeroContrato: '002', dependencia: 'SGG', valor: 3200000, estado: 'por_revisar', diasEsperando: 3, numeroRadicado: null, motivo: null, planilla: 'pendiente' },
  { id: '2', nombre: 'ANDRÉS FELIPE GÓMEZ PATIÑO', foto: null, numeroContrato: '014', dependencia: 'SGG', valor: 2800000, estado: 'por_revisar', diasEsperando: 1, numeroRadicado: null, motivo: null, planilla: null },
  { id: '3', nombre: 'MARÍA CAMILA OSORIO', foto: null, numeroContrato: '031', dependencia: 'SGG', valor: 2500000, estado: 'por_revisar', diasEsperando: 0, numeroRadicado: null, motivo: null, planilla: null },
  { id: '4', nombre: 'JUAN MEJÍA TORO', foto: null, numeroContrato: '017', dependencia: 'SGG', valor: 2800000, estado: 'radicado', diasEsperando: null, numeroRadicado: '2026-004518', motivo: null, planilla: null },
  { id: '5', nombre: 'DIANA PATRICIA RESTREPO', foto: null, numeroContrato: '022', dependencia: 'SGG', valor: 3500000, estado: 'aprobado', diasEsperando: null, numeroRadicado: null, motivo: null, planilla: null },
  { id: '6', nombre: 'CARLOS ARANGO GIL', foto: null, numeroContrato: '045', dependencia: 'SGG', valor: 2500000, estado: 'devuelto', diasEsperando: null, numeroRadicado: null, motivo: 'Falta la evidencia de la obligación 3 y la planilla no corresponde al mes.', planilla: 'devuelta' },
  { id: '7', nombre: 'NATALIA CARDONA RESTREPO', foto: null, numeroContrato: '008', dependencia: 'SGG', valor: 3000000, estado: 'radicado', diasEsperando: null, numeroRadicado: '2026-004502', motivo: null, planilla: null },
  { id: '8', nombre: 'SEBASTIÁN ZAPATA LÓPEZ', foto: null, numeroContrato: '039', dependencia: 'SGG', valor: 2200000, estado: 'sin_enviar', diasEsperando: null, numeroRadicado: null, motivo: null, planilla: null },
  { id: '9', nombre: 'VALENTINA HENAO ARIAS', foto: null, numeroContrato: '051', dependencia: 'SGG', valor: 2700000, estado: 'radicado', diasEsperando: null, numeroRadicado: '2026-004533', motivo: null, planilla: null },
]

type Pestana = 'por_revisar' | 'aprobados' | 'radicados' | 'devueltos' | 'sin_enviar' | 'todos'
const DE_PESTANA: Record<Pestana, (e: EstadoTarjeta) => boolean> = {
  por_revisar: e => e === 'por_revisar',
  aprobados: e => e === 'aprobado',
  radicados: e => e === 'radicado',
  devueltos: e => e === 'devuelto',
  sin_enviar: e => e === 'sin_enviar',
  todos: e => e !== 'sin_enviar',
}

export default function VistaPreviaInformes() {
  const [pestana, setPestana] = useState<Pestana>('por_revisar')
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const cuenta = (p: Pestana) => EJEMPLO.filter(d => DE_PESTANA[p](d.estado)).length
  const visibles = useMemo(() => EJEMPLO
    .filter(d => DE_PESTANA[pestana](d.estado))
    .filter(d => !busqueda.trim() || `${d.nombre} ${d.numeroContrato}`.toLowerCase().includes(busqueda.trim().toLowerCase())),
  [pestana, busqueda])

  const decir = (t: string) => { setAviso(t); setTimeout(() => setAviso(null), 2500) }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Vista previa del rediseño · datos de ejemplo, nombres inventados · las acciones no hacen nada todavía
        </p>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Informes</h1>
            <p className="mt-1 text-sm text-gray-600">Secretaría General y de Gobierno</p>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Mes anterior" className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"><Icono glifo={Iconos.accion.retroceder} tamano="md" /></button>
            <span className="min-w-[9rem] rounded-xl bg-gray-900 px-4 py-2 text-center text-sm font-semibold text-white">Octubre 2026</span>
            <button aria-label="Mes siguiente" className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"><Icono glifo={Iconos.accion.avanzar} tamano="md" /></button>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o número de contrato…" />
            <div className="-mx-1 overflow-x-auto px-1 lg:ml-auto lg:overflow-visible">
              <FilterTabs<Pestana>
                options={[
                  { key: 'por_revisar', label: 'Por revisar', count: cuenta('por_revisar') },
                  { key: 'aprobados', label: 'Aprobados', count: cuenta('aprobados') },
                  { key: 'radicados', label: 'Radicados', count: cuenta('radicados') },
                  { key: 'devueltos', label: 'Devueltos', count: cuenta('devueltos') },
                  { key: 'sin_enviar', label: 'Sin enviar', count: cuenta('sin_enviar') },
                  { key: 'todos', label: 'Todos', count: cuenta('todos') },
                ]}
                value={pestana}
                onChange={setPestana}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map(d => (
            <TarjetaInforme
              key={d.id}
              datos={d}
              href="#"
              onAprobar={() => decir(`Aprobar ${d.nombre} (sin efecto en la vista previa)`)}
              opciones={opcionesDeInforme(d.estado, {
                hrefInforme: '#', hrefContrato: '#', hrefHistorial: '#', hrefDocumentos: '#',
                numeroRadicado: d.numeroRadicado, mesCerrado: true,
                onCopiarRadicado: () => decir(`Copiado: ${d.numeroRadicado}`),
                onDevolver: () => decir('Aquí se abriría «Devolver» con el motivo'),
                onRecordar: () => decir('Aquí se enviaría el recordatorio'),
                onHabilitarTardio: () => decir('Aquí se habilitaría el envío tardío'),
              })}
            />
          ))}
        </div>
        {visibles.length === 0 && <p className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">No hay informes en esta pestaña.</p>}

        <p role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg empty:hidden">{aviso ?? ''}</p>
      </div>
    </div>
  )
}
