import type { Metadata } from 'next'
import { VarianteA, VarianteB, VarianteC, EstilosPruebas } from './Variantes'

/**
 * Comparador de las tres propuestas para la sección «Cinco documentos».
 *
 * Página de trabajo, aislada a propósito: sin portada, sin las otras once
 * secciones y sin nada que distraiga de lo único que hay que decidir. No se
 * enlaza desde ningún sitio y no se indexa. Cuando se elija una variante, la
 * ganadora se lleva a la propuesta y esta carpeta se borra.
 */

export const metadata: Metadata = {
  title: 'Pruebas · Cinco documentos',
  robots: { index: false, follow: false },
}

export default function PruebasPage() {
  return (
    <main className="min-h-screen px-5 py-12 sm:py-16" style={{ backgroundColor: '#FFFFFF' }}>
      <EstilosPruebas />
      <div className="max-w-3xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#2F7A68' }}>
          Comparador interno
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: '#192031' }}>
          Cinco documentos, generados solos
        </h1>
        <p className="mt-4 text-gray-600 leading-relaxed max-w-xl">
          Las tres reproducen el mismo momento del producto. Los textos de fase y
          el rótulo del botón salen literales de la aplicación. Cada una arranca
          sola al entrar en pantalla; el botón «Repetir» la vuelve a correr.
        </p>

        {/* Lo que sobrevive de texto si se adopta cualquiera de las tres. */}
        <div className="mt-8 rounded-xl border border-dashed p-4" style={{ borderColor: '#D5E8DF' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            El texto que reemplazan
          </p>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            Los dos bloques actuales suman unas 150 palabras. Quedarían en una:
            <span className="block mt-2 font-medium text-gray-900">
              «El contratista sube sus evidencias desde el celular. El sistema
              escribe el resto — con QR verificable y listo para SECOP II.»
            </span>
          </p>
        </div>

        <div className="mt-10 space-y-8">
          <VarianteA />
          <VarianteB />
          <VarianteC />
        </div>
      </div>
    </main>
  )
}
