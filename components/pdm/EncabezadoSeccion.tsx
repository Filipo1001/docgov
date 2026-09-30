/** El título de cada sección del módulo. Una sola forma, para que las tres se lean como hermanas. */
export default function EncabezadoSeccion({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#192031]">{titulo}</h1>
      {detalle && <p className="mt-1 text-sm text-gray-500">{detalle}</p>}
    </div>
  )
}
