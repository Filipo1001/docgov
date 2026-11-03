import EsqueletoInformes from './EsqueletoInformes'

/**
 * Lo que muestra Next mientras el servidor arma /dashboard/informes (sesión y datos del mes). Se dibuja dentro del panel ya
 * montado, así que el menú lateral sigue a la vista. Es la misma forma que la pantalla real (ver EsqueletoInformes.tsx),
 * con su cabecera: el título y los botones de mes ya están en su sitio cuando llegan los datos.
 */
export default function InformesLoading() {
  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-hidden="true">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Informes</h1>
          <div className="sk mt-2 h-3.5 w-56 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="sk h-9 w-9 rounded-lg" />
          <div className="sk h-9 w-32 rounded-xl" />
          <div className="sk h-9 w-9 rounded-lg" />
        </div>
      </div>
      <EsqueletoInformes etiqueta="Cargando los informes" />
    </div>
  )
}
