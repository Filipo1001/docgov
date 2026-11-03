/**
 * El esqueleto de /dashboard/informes: la misma pantalla, sin datos.
 *
 * Repite la forma real —las cuatro tarjetas de cifras, el panel de búsqueda y pestañas, y la cuadrícula de tarjetas de
 * informe con su avatar, su valor y su fila de botones— para que, cuando llega el mes, el contenido ocupe el sitio que el
 * esqueleto ya le guardó y nada salte. Lo usan la carga inicial de la ruta (`loading.tsx`), la primera carga de datos y el
 * cambio de mes.
 *
 * Con «reducir movimiento» no se mueve. Con el mes vecino ya pedido de antemano casi nunca llega a verse: el dato está en
 * caché. Los bloques son decorativos (`aria-hidden`); lo que se anuncia es el texto
 * `etiqueta`, para quien usa un lector de pantalla.
 */

const TARJETAS_CIFRAS = ['bg-gray-50', 'bg-blue-50', 'bg-indigo-50', 'bg-emerald-50']

function TarjetaCifra({ fondo }: { fondo: string }) {
  return (
    <div className={`${fondo} rounded-2xl border border-transparent p-5`}>
      <div className="sk h-7 w-12 rounded-lg" />
      <div className="sk mt-2.5 h-3.5 w-24 rounded-md" />
    </div>
  )
}

function TarjetaInforme({ conBotones }: { conBotones: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="sk h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="sk h-4 w-3/4 rounded-md" />
              <div className="sk mt-2 h-3 w-1/2 rounded-md" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="sk h-4 w-20 rounded-md" />
              <div className="sk h-4 w-16 rounded-full" />
            </div>
          </div>
          {conBotones && (
            <div className="mt-4 flex gap-2">
              <div className="sk h-7 w-16 rounded-lg" />
              <div className="sk h-7 w-[4.5rem] rounded-lg" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EsqueletoInformes({ etiqueta }: { etiqueta: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{etiqueta}</span>

      <div aria-hidden="true">
        {/* Cifras */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {TARJETAS_CIFRAS.map(f => <TarjetaCifra key={f} fondo={f} />)}
        </div>

        {/* Búsqueda y pestañas */}
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="sk h-[42px] w-full max-w-md shrink-0 rounded-xl lg:flex-1" />
            <div className="flex gap-2 overflow-hidden lg:ml-auto">
              {[56, 84, 92, 80, 84].map((w, i) => <div key={i} className="sk h-9 shrink-0 rounded-lg" style={{ width: w }} />)}
            </div>
          </div>
        </div>

        {/* Tarjetas de informe */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <TarjetaInforme key={i} conBotones={i % 3 !== 2} />)}
        </div>
      </div>
    </div>
  )
}
