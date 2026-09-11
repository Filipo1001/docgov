import type { Metadata } from 'next'
import { LogoHorizontal } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import { ExpedienteVivo } from '../Escenas'

/**
 * Comparador de fondos CLAROS para el folleto. PÁGINA DESECHABLE.
 *
 * Se descartaron los cuatro oscuros y la dirección es «nada oscuro». Eso no es
 * un cambio de color: es un cambio de estructura, porque el folleto sacaba su
 * ritmo del vaivén oscuro→claro→oscuro —gravedad, alivio, compromiso— y sin
 * secciones oscuras ese motor desaparece.
 *
 * De dónde sale el ritmo entonces: de una ESCALA de claros, no de un contraste.
 * Cuatro peldaños del mismo tono, del más abierto al más asentado, y las
 * secciones avanzan por ellos. Y el único momento saturado de la página pasa a
 * ser la llamada a la acción, en verde pleno: si no hay negro, el destino tiene
 * que marcarlo el color de la marca. Por eso cada bloque de aquí lleva su
 * botón, que es donde se ve si el fondo lo sostiene.
 *
 * Se borra en cuanto haya decisión.
 */

export const metadata: Metadata = {
  title: 'Tonos claros · folleto',
  robots: { index: false, follow: false },
}

const VERDE = '#10b981'
const VERDE_TEXTO = '#0B7A5C'

const TONOS = [
  {
    hex: '#FAFBFC',
    nombre: 'Blanco roto',
    escala: '#FFFFFF · #FAFBFC · #F2F5F7 · #E8EEF2',
    nota: 'Máxima claridad y nada de tinte. Lo más limpio y lo más neutro, pero también lo más anónimo: sin color propio, la página depende entera del verde para tener identidad.',
  },
  {
    hex: '#EDF2F5',
    nombre: 'Niebla',
    escala: '#FFFFFF · #F6F9FA · #EDF2F5 · #DFE8ED',
    nota: 'Gris con una gota de azul. Sobrio e institucional sin ser frío, y deja respirar al verde. El más seguro de los cuatro.',
  },
  {
    hex: '#E8F4EF',
    nombre: 'Menta clara',
    escala: '#FFFFFF · #F4FAF7 · #E8F4EF · #D8EBE2',
    nota: 'Teñido con el verde del producto. Es el único emparentado con el acento, así que la página se siente de una pieza y el verde deja de ser un injerto. El más distintivo.',
  },
  {
    hex: '#F5F1E9',
    nombre: 'Arena',
    escala: '#FFFFFF · #FBF9F5 · #F5F1E9 · #EBE4D7',
    nota: 'Cálido, de papel. Sale de lo que hace todo el software del sector y por eso se recuerda — pero aleja de lo institucional, que es justo donde este lector se siente cómodo.',
  },
] as const

export default function TonosPage() {
  return (
    <main>
      {TONOS.map(t => (
        <section key={t.hex} className="px-6 sm:px-8 pt-7 pb-20" style={{ backgroundColor: t.hex }}>
          <div className="max-w-5xl mx-auto">
            <header className="flex items-center justify-between gap-4">
              <LogoHorizontal size={34} />
              <span className="font-mono text-[11px] px-2 py-1 rounded"
                style={{ color: 'rgba(25,32,49,.5)', backgroundColor: 'rgba(25,32,49,.06)' }}>
                {t.hex}
              </span>
            </header>

            <div className="mt-12 grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: VERDE_TEXTO }}>
                  {t.nombre}
                </p>
                <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]"
                  style={{ color: MARCA }}>
                  El cierre del mes deja de ser un problema.
                </h1>
                <p className="mt-6 text-lg leading-relaxed max-w-xl text-gray-600">
                  Ni plantillas de Word, ni consecutivos a mano, ni perseguir soportes
                  uno por uno. El contratista reporta desde su celular y el sistema arma
                  el expediente completo de cada contrato, listo para cargar a SECOP&nbsp;II.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold"
                    style={{ backgroundColor: VERDE, color: '#06281F' }}>
                    Hablar con un asesor
                  </span>
                  <span className="text-[13px] text-gray-400">
                    ← si no hay oscuro, este es el único momento saturado de la página
                  </span>
                </div>

                {/* La escala completa: el ritmo ya no lo da el contraste, lo dan
                    los peldaños. Sin verla, el tono se juzga a medias. */}
                <div className="mt-7 flex items-center gap-1.5">
                  {t.escala.split(' · ').map(c => (
                    <span key={c} className="block rounded"
                      style={{ width: 42, height: 26, backgroundColor: c, border: '1px solid rgba(25,32,49,.1)' }} />
                  ))}
                  <span className="ml-2 font-mono text-[10px] text-gray-400">la escala</span>
                </div>

                <p className="mt-6 text-[13px] leading-relaxed text-gray-500">{t.nota}</p>
              </div>

              <div className="flex justify-center lg:justify-end">
                <ExpedienteVivo claro />
              </div>
            </div>
          </div>
        </section>
      ))}
    </main>
  )
}
