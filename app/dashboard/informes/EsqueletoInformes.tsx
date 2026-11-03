/**
 * El esqueleto de /dashboard/informes: la misma pantalla, sin datos.
 *
 * Repite la forma real —el panel de búsqueda y pestañas, y la cuadrícula de tarjetas de informe con su foto, su valor y
 * el pie con el estado y Aprobar— para que, cuando llega el mes, el contenido ocupe el sitio que el
 * esqueleto ya le guardó y nada salte. Lo usan la carga inicial de la ruta (`loading.tsx`), la primera carga de datos y el
 * cambio de mes.
 *
 * Con «reducir movimiento» no se mueve. Con el mes vecino ya pedido de antemano casi nunca llega a verse: el dato está en
 * caché. Los bloques son decorativos (`aria-hidden`); lo que se anuncia es el texto
 * `etiqueta`, para quien usa un lector de pantalla.
 */

function TarjetaInforme({ conBoton }: { conBoton: boolean }) {
  return (
    <div className="flex min-h-[13.5rem] flex-col rounded-2xl border border-gray-200 bg-white">
      <div className="flex-1 p-5 pr-12">
        <div className="flex items-start gap-3.5">
          <div className="sk h-14 w-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 pt-1">
            <div className="sk h-4 w-3/4 rounded-md" />
            <div className="sk mt-2.5 h-3.5 w-16 rounded-md" />
          </div>
        </div>
        <div className="sk mt-5 h-6 w-32 rounded-md" />
      </div>
      <div className="mx-5 flex min-h-[3.5rem] items-center justify-between border-t border-gray-100 py-3">
        <div className="sk h-4 w-36 rounded-md" />
        {conBoton && <div className="sk h-9 w-20 rounded-lg" />}
      </div>
    </div>
  )
}

export default function EsqueletoInformes({ etiqueta }: { etiqueta: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{etiqueta}</span>

      <div aria-hidden="true">
        {/* Búsqueda y pestañas */}
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="sk h-[42px] w-full max-w-md shrink-0 rounded-xl lg:flex-1" />
            <div className="flex gap-2 overflow-hidden lg:ml-auto">
              {[104, 92, 92, 92, 96, 64].map((w, i) => <div key={i} className="sk h-9 shrink-0 rounded-lg" style={{ width: w }} />)}
            </div>
          </div>
        </div>

        {/* Tarjetas de informe */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <TarjetaInforme key={i} conBoton={i % 3 !== 2} />)}
        </div>
      </div>
    </div>
  )
}
