import fs from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import { enlaceWhatsApp, ORIGEN_APP } from '@/lib/dominio'
import Revelar from '../Revelar'
import { TituloEscribe, Destello, Flotante, TarjetaSenal } from './Animado'
import EnvioAnimado from './EnvioAnimado'
import Contador from '../Contador'
import ProgresoScroll from '../ProgresoScroll'

/**
 * Propuesta comercial para la Alcaldía de Caramanta.
 *
 * Vive en el ápice —contratistadigital.com/propuesta/caramanta— y no en el
 * subdominio de la aplicación: el enlace se comparte con un secretario de
 * despacho, y `app.` lee como la herramienta interna de otro cliente.
 *
 * NO SE INDEXA. Es un documento dirigido a una alcaldía concreta, con su
 * nombre y su precio. Que apareciera en un buscador sería un problema
 * comercial —cualquier otro municipio vería la tarifa— y de discreción.
 *
 * ── Heredado de Dabeiba, El Bagre y Venecia ──────────────────────────────
 *
 * EL DIAGNÓSTICO ACUSA, PERO ABSUELVE AL FINAL. Los seis «lo está haciendo
 * mal» son deliberadamente punzantes: despiertan más que una lista de
 * beneficios. Pero cierran con «ninguno es de las personas, son del método»,
 * porque un secretario que se siente juzgado deja de escuchar.
 *
 * LAS CIFRAS VAN AL FINAL, justo antes de la llamada a la acción.
 *
 * ── Lo propio de esta propuesta ──────────────────────────────────────────
 *
 * UNA SOLA IMPLEMENTACIÓN. Venecia ofrecía dos caminos según quién cargara
 * los contratos; aquí es un pago único, como en Dabeiba. La página de
 * inversión vuelve por tanto a la forma de dos columnas —implementación y
 * mensualidad— en vez de las tres tarjetas de Venecia.
 *
 * SE NOMBRA AL MANDATARIO, cosa que ninguna otra propuesta hace: lo pidió el
 * cliente. La entidad va primero y el alcalde debajo, más tenue — el
 * destinatario es la Alcaldía; el señor Correa Cárdenas la encabeza.
 *
 * ── Animación, y por qué aquí hay más que en las otras ───────────────────
 *
 * Se pidió expresamente «muy rica en animaciones para teléfono», sabiendo que
 * el alcalde la va a abrir en un iPhone. Lo que se añadió sobre la base común
 * está en `Animado.tsx`, y todo entra por `@supports`: en un navegador que no
 * lo soporte la página queda exactamente como las demás propuestas, que ya
 * funcionan bien. Nada de lo añadido es requisito para leerla.
 *
 * ── Heredado, y que conviene no tocar ────────────────────────────────────
 *
 * ESPACIADO PENSADO PARA EL TELÉFONO. La propuesta se abre desde un enlace
 * que alguien reenvía por WhatsApp, así que la primera lectura casi siempre
 * es en móvil.
 */

export const metadata: Metadata = {
  title: 'Propuesta · Alcaldía de Caramanta — Contratista Digital',
  description: 'Gestión digital de contratos de prestación de servicios.',
  robots: { index: false, follow: false },
}

/**
 * Acento de la portada de Caramanta: verde menta pastel.
 *
 * Elegido por lo que dice antes de que se lea una palabra. El menta-turquesa
 * es el color de «verificado» —sellos de seguridad, visto bueno, candado de
 * SSL—, y el producto vende justo eso: expediente verificable por QR. Está
 * desaturado a propósito: una alcaldía no quiere «disrupción», quiere una
 * elección competente y de bajo riesgo, y el pastel transmite calma
 * institucional en vez de gritar. Sobre el azul noche de la marca contrasta
 * con fuerza y da un brillo sutil que lleva el ojo a la cifra y al botón.
 *
 * Es el mismo esmeralda de antes, suavizado: se afina la lógica que ya había,
 * no se tira.
 */
const ACENTO = '#7FCBB8'          // menta con fuerza: filetes, barras, iconos
const ACENTO_OSCURO = '#2F7A68'   // texto pequeño y filetes SOBRE el pastel (contraste AA)
const PASTEL_BASE = '#F4FAF7'     // fondo de toda la página: blanco con velo de menta
const PASTEL_ALT = '#E7F3EE'      // secciones alternas, separan bloques sin líneas
const PASTEL_PANEL = '#DCEEE7'    // portada y tarjetas sobre pastel

/** El diagnóstico. Cuatro son de la alcaldía y dos del contratista, a propósito. */
const DIAGNOSTICO = [
  { frente: 'El expediente, en un arrume de papeles',
    dorso: 'Si le piden el expediente de un contrato y toca buscarlo en un arrume de documentos, lo está haciendo mal.' },
  { frente: 'Sin saber cuántos contratistas trabajan',
    dorso: 'Si no sabe cuántos contratistas tiene ni si están trabajando, lo está haciendo mal.' },
  { frente: 'El fin de mes se va en papeleo',
    dorso: 'Si a fin de mes sus contratistas están armando papeles en vez de trabajando, lo está haciendo mal.' },
  { frente: 'La alcaldía no cabe en el bolsillo',
    dorso: 'Si no tiene la alcaldía en la palma de la mano —en cualquier lugar, a cualquier hora—, lo está haciendo mal.' },
  { frente: 'Cuentas de cobro devueltas por errores',
    dorso: 'Si le devuelven cuentas de cobro por errores de redacción o de transcripción, lo está haciendo mal.' },
  { frente: 'El contratista llama a preguntar por su pago',
    dorso: 'Si un contratista tiene que llamar a preguntar por qué se retrasó su pago, lo está haciendo mal.' },
]


/** Consultadas a producción el 1 de septiembre de 2026. Reverificar antes de reusar. */
const CIFRAS: [number, string][] = [
  [126, 'contratos gestionados'],
  [629, 'periodos procesados'],
  [503, 'documentos verificables'],
  [236, 'históricos migrados'],
  [4081, 'evidencias cargadas'],
  [1449, 'movimientos trazados'],
]

/**
 * El escudo del municipio. Caramanta sí lo aportó, así que la portada lo lleva
 * de verdad. La comprobación se conserva como red de seguridad: si el archivo
 * llegara a faltar, la portada mantiene su composición con un cuadrado del
 * mismo tamaño en vez de descuadrarse.
 */
const ESCUDO = '/marca/escudo-caramanta.png'
function hayEscudo(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'marca', 'escudo-caramanta.png'))
  } catch {
    return false
  }
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Seccion({
  children,
  oscura = false,
}: {
  children: React.ReactNode
  oscura?: boolean
}) {
  return (
    <section
      /* py-14 en móvil: con doce secciones, py-20 obligaba a desplazarse por
         casi 400 px de vacío solo para pasar de una a otra. */
      // La página es toda pastel; `oscura` ya no oscurece, solo pone un punto
      // más de menta para separar bloques sin líneas. Se conserva el nombre
      // del prop para no tocar los cuatro sitios que lo pasan.
      className="px-6 py-14 sm:py-24 lg:py-28 text-gray-900"
      style={{ backgroundColor: oscura ? PASTEL_ALT : PASTEL_BASE }}
    >
      <div className="max-w-3xl mx-auto">{children}</div>
    </section>
  )
}

function Etiqueta({ children, oscura = false }: { children: React.ReactNode; oscura?: boolean }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] mb-4 ${oscura ? 'text-[#2F7A68]' : 'text-gray-400'}`}>
      {children}
    </p>
  )
}

function Titulo({ children, oscura = false }: { children: React.ReactNode; oscura?: boolean }) {
  return (
    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.15] text-gray-900">
      {children}
    </h2>
  )
}


// ── Página ──────────────────────────────────────────────────────────────────

export default async function PropuestaAngelopolis() {
  // QR real, generado en el servidor: apunta al verificador público. En la
  // reunión se escanea desde la proyección y valida de verdad — es el momento
  // que más convence, y un QR de adorno lo arruinaría.
  const escudo = hayEscudo()

  const qr = await QRCode.toDataURL(`${ORIGEN_APP}/verificar`, {
    margin: 1,
    width: 480,
    color: { dark: MARCA, light: '#FFFFFF' },
  })

  return (
    <main style={{ backgroundColor: PASTEL_BASE }}>
      <ProgresoScroll color={ACENTO} />

      {/* ── Portada ───────────────────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col justify-center px-6 py-16 sm:py-20 text-gray-900"
        style={{ backgroundColor: PASTEL_PANEL }}
      >
        <div className="max-w-3xl mx-auto w-full">
          <Revelar><LogoCD size={64} color={MARCA} /></Revelar>

          <Revelar retraso={80}>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: ACENTO_OSCURO }}>
              Bienvenidos a Contratista Digital
            </p>
          </Revelar>

          <Revelar retraso={160}>
            <h1 className="mt-4 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08]">
              <TituloEscribe texto="La innovación en la ejecución de la contratación pública" />
            </h1>
            <div className="mt-6 h-[3px] w-16 rounded-full" style={{ backgroundColor: ACENTO_OSCURO }} />
          </Revelar>

          <Revelar retraso={300}>
            <p className="mt-8 text-lg sm:text-xl text-gray-600 leading-relaxed max-w-xl">
              El expediente completo de cada contrato, con los documentos
              generados automáticamente, listo y verificable desde el primer mes.
            </p>
          </Revelar>

          <Revelar retraso={460}>
            <div className="mt-12 sm:mt-16 flex items-center gap-3">
              {escudo ? (
                <Flotante>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ESCUDO}
                    alt="Escudo del municipio de Caramanta"
                    className="w-12 h-12 object-contain"
                  />
                </Flotante>
              ) : (
                /* Red de seguridad por si el archivo llegara a faltar: la
                   portada conserva su composición en vez de descuadrarse. */
                <span
                  aria-hidden="true"
                  className="w-12 h-12 rounded-xl border border-gray-900/15 flex items-center justify-center text-lg font-semibold text-gray-500 shrink-0"
                >
                  C
                </span>
              )}
              <p className="text-xs text-gray-500 leading-snug">
                Propuesta preparada para la<br />Alcaldía Municipal de Caramanta
                <br />
                <span className="text-gray-700">
                  En cabeza del señor Alcalde Juan Esteban Correa Cárdenas
                </span>
              </p>
            </div>
          </Revelar>
        </div>
      </section>

      {/* ── Diagnóstico ───────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Diagnóstico</Etiqueta>
          <Titulo>Seis señales</Titulo>
        </Revelar>

        {/* Rejilla 3×2 desde `sm`; en el teléfono se apilan de a una, que es
            la única forma legible de seis tarjetas en 375 px. Cada una se
            voltea — ver TarjetaSenal en Animado.tsx.

            La entrada va en diagonal —(fila + columna) × 90 ms— y no por
            índice. Escalonar 0,1,2,3,4,5 hace que la segunda fila arranque
            cuando la primera va por la mitad, y las dos filas se pisan; por
            diagonal el grupo entra como una onda desde la esquina superior
            izquierda, que es por donde se lee. En el teléfono cada tarjeta
            tiene su propio observador y entra a su altura, así que el orden
            se respeta igual. */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {DIAGNOSTICO.map((sig, i) => (
            <Revelar key={sig.frente} retraso={(Math.floor(i / 3) + (i % 3)) * 90}>
              {/* Solo la primera hace el asomo que enseña que la tarjeta gira. */}
              <TarjetaSenal frente={sig.frente} dorso={sig.dorso} insinua={i === 0} />
            </Revelar>
          ))}
        </div>

        <Revelar retraso={240}>
          <p className="mt-10 text-lg font-semibold text-gray-900">
            Ninguno de estos problemas es de las personas. Todos son del método.
          </p>
        </Revelar>
      </Seccion>

      {/* ── Qué es · Cinco documentos ─────────────────────────────
          Dos secciones que sumaban unas 150 palabras, reemplazadas por la
          animación real del envío. El argumento —«el sistema escribe los
          documentos»— se demuestra en dos segundos y se leía en treinta.
          Ver EnvioAnimado.tsx. */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>La solución</Etiqueta>
          <Titulo>Cinco documentos, generados solos</Titulo>
          <p className="mt-6 text-gray-600 leading-relaxed max-w-xl">
            El contratista sube sus evidencias desde el celular. El sistema
            escribe el resto — con QR verificable y listo para cargar a SECOP II.
          </p>
        </Revelar>

        <Revelar retraso={140}>
          <div className="mt-10">
            <EnvioAnimado />
          </div>
        </Revelar>

      </Seccion>

      {/* ── Verificación QR ───────────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Verificación</Etiqueta>
          <Titulo oscura>Cualquiera comprueba la autenticidad. Sin pedirle nada a la alcaldía.</Titulo>
        </Revelar>

        <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
          <Revelar retraso={150} desde="zoom">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="Código QR de verificación de documentos"
              className="w-44 h-44 rounded-2xl bg-white p-2 shrink-0"
            />
          </Revelar>
          <Revelar retraso={280} className="flex-1">
            <p className="text-gray-600 leading-relaxed">
              Cada documento sale con un código único y una huella digital SHA-256.
              Escanee este código con la cámara de su celular: así verifica un
              documento un auditor, un banco o un ente de control.
            </p>
          </Revelar>
        </div>
      </Seccion>

      {/* ── Inversión ─────────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Inversión</Etiqueta>
        </Revelar>

        {/* Dos pagos separados y con alcance propio: un pago único por dejar
            la plataforma montada con los datos del municipio, y una
            mensualidad por mantenerla operando. */}
        <Revelar retraso={100} desde="zoom">
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#D5E8DF] bg-white/60 p-6 sm:p-7 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                Pago único
              </p>
              <p className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                <Destello>$3.500.000</Destello>
              </p>
              <p className="mt-2 text-sm text-gray-500">Implementación</p>
            </div>
            <div className="rounded-2xl p-6 sm:p-7 text-center text-white" style={{ backgroundColor: MARCA }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Cada mes
              </p>
              <p className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
                <Destello>$2.400.000</Destello>
              </p>
              <p className="mt-2 text-sm text-white/60">Operación de la plataforma</p>
            </div>
          </div>
        </Revelar>

        <Revelar retraso={240}>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#D5E8DF] p-6">
              <p className="text-sm font-semibold text-gray-900">La implementación incluye</p>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                {[
                  'Creación de los usuarios de todas las secretarías',
                  'Cargue de los contratos vigentes',
                  'Adaptación de los documentos al formato de Caramanta',
                  'Capacitación por rol: contratistas, supervisores y contratación',
                  'Acompañamiento durante el primer ciclo mensual completo',
                ].map(t => (
                  <div key={t} className="flex gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#D5E8DF] p-6">
              <p className="text-sm font-semibold text-gray-900">La mensualidad incluye</p>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                {[
                  'Capacitaciones periódicas por rol',
                  'Base de datos y alojamiento',
                  'Copias de seguridad diarias',
                  'Soporte técnico durante toda la vigencia',
                  'Actualizaciones y verificación pública de documentos',
                  'Sin límite de usuarios, secretarías ni almacenamiento',
                ].map(t => (
                  <div key={t} className="flex gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Revelar>


      </Seccion>

      {/* ── Las cifras, al final ──────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Esto ya opera</Etiqueta>
          <Titulo oscura>No es una promesa. Son cifras.</Titulo>
        </Revelar>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-px rounded-2xl overflow-hidden">
          {CIFRAS.map(([n, t], i) => (
            <Revelar key={t} retraso={i * 80} desde="zoom">
              <div className="bg-white/70 p-5 sm:p-6 h-full">
                <Contador valor={n} className="block text-3xl sm:text-4xl font-bold tracking-tight" />
                <p className="mt-1 text-sm text-gray-500 leading-snug">{t}</p>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={520}>
          <div className="mt-6 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marca/escudo-fredonia.png"
              alt="Escudo del municipio de Fredonia"
              className="w-8 h-8 object-contain opacity-80"
            />
            <p className="text-xs text-gray-400">
              Operación real del municipio de Fredonia, Antioquia.
            </p>
          </div>
        </Revelar>

        <Revelar retraso={620}>
          <div className="mt-10 rounded-2xl bg-white/70 p-6">
            <p className="text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-900">Su historial no se queda afuera.</span>{' '}
              Esos 238 periodos históricos son información anterior que entró al
              sistema, repartida en 61 contratos. No se empieza de cero.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Cierre ────────────────────────────────────────────────── */}
      <section className="px-6 py-24 text-white" style={{ backgroundColor: MARCA }}>
        <div className="max-w-3xl mx-auto">
          <Revelar>
            <LogoCD size={48} color="#FFFFFF" />
            <p className="mt-8 text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
              Hablemos de cómo se vería el primer ciclo en Caramanta.
            </p>
          </Revelar>

          <Revelar retraso={200}>
            <a
              href={enlaceWhatsApp('Buen día. Soy de la Alcaldía de Caramanta y quisiera conocer más sobre Contratista Digital.')}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex items-center gap-3 rounded-xl bg-white px-7 py-4 font-semibold transition-transform hover:scale-[1.02]"
              style={{ color: MARCA }}
            >
              <span className="w-2 h-2 rounded-full latido" style={{ backgroundColor: ACENTO }} />
              Escribir por WhatsApp
            </a>
          </Revelar>

          <Revelar retraso={320}>
            <p className="mt-16 text-xs text-white/30">
              Contratista Digital · Propuesta para la Alcaldía Municipal de Caramanta
            </p>
          </Revelar>
        </div>
      </section>
    </main>
  )
}
