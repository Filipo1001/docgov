import type { Metadata } from 'next'
import { LogoHorizontal } from '@/components/Logo'
import { ExpedienteVivo } from '../Escenas'

/**
 * Comparador de fondos para el folleto. PÁGINA DESECHABLE.
 *
 * El color no se juzga leyendo un hexadecimal: se juzga viéndolo debajo del
 * contenido real, con su titular, su verde y su animación encima. Por eso esto
 * repite la portada entera en cada tono en vez de enseñar muestras de color.
 *
 * Se borra en cuanto haya decisión.
 */

export const metadata: Metadata = {
  title: 'Tonos · folleto',
  robots: { index: false, follow: false },
}

const VERDE = '#10b981'

const TONOS = [
  {
    hex: '#192031',
    nombre: 'Azul noche · el actual',
    nota: 'La tinta de marca, tomada del vectorial oficial. Institucional, pero el azul y el verde no son parientes: conviven sin ayudarse.',
  },
  {
    hex: '#0D1117',
    nombre: 'Casi negro neutro',
    nota: 'El más moderno de los cuatro y el que más hace brillar el verde, porque no compite con él. Riesgo: puede leerse más a empresa de software que a proveedor del Estado.',
  },
  {
    hex: '#0B2420',
    nombre: 'Verde muy oscuro',
    nota: 'El verde del producto, llevado hasta el fondo. Es el único tono emparentado con el acento, así que la página se siente de una sola pieza. El más distintivo.',
  },
  {
    hex: '#14161B',
    nombre: 'Grafito',
    nota: 'Casi negro con una pizca de azul. Serio y sobrio sin la frialdad del azul noche ni la dureza del negro puro. El término medio.',
  },
] as const

export default function TonosPage() {
  return (
    <main>
      {TONOS.map(t => (
        <section key={t.hex} className="px-6 sm:px-8 pt-7 pb-20" style={{ backgroundColor: t.hex }}>
          <div className="max-w-5xl mx-auto">
            <header className="flex items-center justify-between gap-4">
              <LogoHorizontal size={34} color="#FFFFFF" colorNombre="#FFFFFF" />
              <span className="font-mono text-[11px] px-2 py-1 rounded"
                style={{ color: 'rgba(255,255,255,.55)', backgroundColor: 'rgba(255,255,255,.07)' }}>
                {t.hex}
              </span>
            </header>

            <div className="mt-12 grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: VERDE }}>
                  {t.nombre}
                </p>
                <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] text-white">
                  El cierre del mes deja de ser un problema.
                </h1>
                <p className="mt-6 text-lg leading-relaxed max-w-xl" style={{ color: 'rgba(255,255,255,.62)' }}>
                  Ni plantillas de Word, ni consecutivos a mano, ni perseguir soportes
                  uno por uno. El contratista reporta desde su celular y el sistema arma
                  el expediente completo de cada contrato, listo para cargar a SECOP&nbsp;II.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold"
                    style={{ backgroundColor: VERDE, color: '#06281F' }}>
                    Hablar con un asesor
                  </span>
                  <span className="text-[13px]" style={{ color: 'rgba(255,255,255,.4)' }}>
                    ← cómo se ve el verde sobre este fondo
                  </span>
                </div>

                <p className="mt-7 text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,.45)' }}>
                  {t.nota}
                </p>
              </div>

              <div className="flex justify-center lg:justify-end">
                <ExpedienteVivo />
              </div>
            </div>
          </div>
        </section>
      ))}
    </main>
  )
}
