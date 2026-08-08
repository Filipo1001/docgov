/**
 * app/inicio/page.tsx — Sitio comercial de Contratista Digital.
 *
 * Vive en contratistadigital.com (el middleware reescribe la raíz del ápice a
 * esta ruta, así que la URL que ve el visitante es el dominio pelado). La
 * aplicación quedó en app.contratistadigital.com.
 *
 * El aviso de acceso va ARRIBA DEL TODO y no depende de que nadie desplace la
 * página: durante las próximas semanas la mayoría de visitas no serán
 * alcaldías evaluando el producto, sino contratistas que escribieron la
 * dirección de siempre y necesitan encontrar la plataforma. Cuando ese tráfico
 * baje, el aviso puede pasar a ser una línea en la cabecera.
 *
 * Estática por completo: sin sesión, sin base de datos, sin JavaScript de
 * cliente. Se sirve desde el CDN.
 */

import type { Metadata } from 'next'
import { LogoCD } from '@/components/Logo'
import { MARCA, CLASES_MARCA } from '@/lib/marca'
import { ORIGEN_APP, WHATSAPP_COMERCIAL, enlaceWhatsApp } from '@/lib/dominio'
import { SITIO, NOMBRE, TITULO, DESCRIPCION, PORTADA_SOCIAL, datosEstructurados } from '@/lib/seo'
import { Analytics } from '@vercel/analytics/next'
import BotonContacto from './BotonContacto'

/** Número tal como se lee en pantalla: +57 319 242 0334 */
const WHATSAPP_LEGIBLE = WHATSAPP_COMERCIAL.replace(
  /^(\d{2})(\d{3})(\d{3})(\d{4})$/,
  '+$1 $2 $3 $4'
)

const IconoWhatsApp = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23z" />
  </svg>
)

export const dynamic = 'force-static'

export const metadata: Metadata = {
  // `absolute` evita que la plantilla del layout añada " | Contratista Digital"
  // a un título que ya lleva la marca delante.
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    url: SITIO,
    siteName: NOMBRE,
    title: TITULO,
    description: DESCRIPCION,
    images: [{
      url: PORTADA_SOCIAL,
      width: 1200,
      height: 630,
      alt: 'Contratista Digital — el expediente completo de cada contratista, listo en un clic',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRIPCION,
    images: [PORTADA_SOCIAL],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Sin recorte en el fragmento ni en la vista previa de imagen: para un
      // producto desconocido, cuanto más contexto muestre el resultado, mejor.
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
}

/**
 * Preguntas frecuentes.
 *
 * No son relleno para buscadores. Son las que de verdad hace un secretario de
 * despacho antes de decidir, escritas con las palabras que esa persona usa al
 * buscar —cuenta de cobro, informe de actividades, supervisión, SECOP II— en
 * lugar de la jerga del producto. Alimentan a la vez la página y el bloque de
 * datos estructurados, de modo que no puedan contradecirse.
 */
const PREGUNTAS = [
  {
    p: '¿Qué es Contratista Digital?',
    r: 'Es un software de gestión documental contractual para alcaldías. Automatiza el ciclo '
      + 'mensual de los contratos de prestación de servicios: el contratista reporta sus '
      + 'actividades y sus soportes, el supervisor aprueba en línea y el sistema genera el '
      + 'informe de actividades, la cuenta de cobro, el acta de supervisión y el acta de pago.',
  },
  {
    p: '¿Cómo se generan las cuentas de cobro y los informes de actividades?',
    r: 'Los genera el sistema a partir de los datos del contrato y de lo que reporta el '
      + 'contratista. No se abre Word ni se parte de la plantilla del mes anterior: los '
      + 'consecutivos, las fechas, los valores y los periodos los calcula el sistema, así que '
      + 'desaparecen los errores de digitación y las devoluciones que provocan.',
  },
  {
    p: '¿Sirve para la supervisión contractual y el control de la contratación pública?',
    r: 'Sí. El supervisor ve cada obligación específica del contrato junto a la evidencia que '
      + 'la sustenta, aprueba o devuelve con observaciones, y cada acción queda registrada con '
      + 'su responsable y su hora en un historial inalterable. Eso es lo que se necesita cuando '
      + 'llega un requerimiento de un ente de control.',
  },
  {
    p: '¿Los documentos sirven para radicar en SECOP II?',
    r: 'Sí. El paquete completo del periodo —informe de actividades, cuenta de cobro y planilla '
      + 'de seguridad social— se descarga armado, con los anexos numerados y en orden, listo '
      + 'para cargar.',
  },
  {
    p: '¿Cómo se comprueba que un documento es auténtico?',
    r: 'Cada documento se emite con un código de verificación y un código QR. Quien lo reciba '
      + 'escanea el código y confirma en segundos contra el sistema que el documento es '
      + 'auténtico y a qué contrato y periodo corresponde, sin necesidad de tener una cuenta.',
  },
  {
    p: '¿El contratista necesita instalar algo?',
    r: 'No. Se entra por internet con usuario y contraseña, desde el celular, la tableta o el '
      + 'computador. La alcaldía no tiene que comprar equipos ni mantener servidores.',
  },
  {
    p: '¿Cuánto cuesta y qué incluye?',
    r: 'La licencia es de $2.900.000 mensuales e incluye la implementación, la migración de los '
      + 'contratos en curso, la capacitación de secretarías, supervisores y contratistas, el '
      + 'soporte permanente, las actualizaciones, el alojamiento y los respaldos.',
  },
]

const CAPACIDADES = [
  {
    titulo: 'Se acabó el Word',
    texto:
      'El informe de actividades, la cuenta de cobro y las actas se generan solos, con el '
      + 'formato correcto, cada mes y para cada contratista.',
  },
  {
    titulo: 'Cero errores en los documentos',
    texto:
      'Los datos se toman una sola vez y de una sola fuente. Consecutivos, fechas, valores y '
      + 'periodos los calcula el sistema.',
  },
  {
    titulo: 'Trazabilidad de principio a fin',
    texto:
      'Cada acción queda registrada con su responsable y su hora. El expediente de cualquier '
      + 'contratista, de cualquier mes, está a un clic.',
  },
]

const PASOS = [
  ['El contratista reporta', 'Registra sus actividades y adjunta sus soportes en PDF desde el celular o el computador.'],
  ['El supervisor aprueba', 'Recibe la notificación al instante, revisa cada obligación con su evidencia al lado y aprueba en línea.'],
  ['Los documentos se generan', 'Numerados, con sus anexos adentro, verificables por código QR y listos para radicar.'],
]

export default function InicioPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">

      {/* Datos estructurados. Le dicen a Google qué es esto —una organización y
          una aplicación de software con un precio, no un blog— y son lo que
          habilita los resultados enriquecidos de preguntas frecuentes. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datosEstructurados(PREGUNTAS)) }}
      />

      {/* ── Aviso de acceso a la plataforma ──────────────────────
          Primero en el DOM y primero en pantalla: es lo que vienen
          buscando quienes escribieron el dominio de memoria. */}
      <aside
        role="region"
        aria-label="Acceso a la plataforma"
        className={`${CLASES_MARCA.fondo} text-white`}
      >
        <div className="mx-auto max-w-5xl px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">¿Ya trabaja con Contratista Digital?</p>
            <p className="text-xs text-gray-300 mt-0.5">
              La plataforma cambió de dirección. Si usted es contratista o supervisor, ingrese aquí.
            </p>
          </div>
          <a
            href={ORIGEN_APP}
            /* py-3: 44 px de alto, el mínimo cómodo para tocar con el dedo.
               Es la acción que más se va a usar y casi siempre desde un móvil. */
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#192031] transition-colors hover:bg-gray-100"
          >
            Ir a la plataforma
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </aside>

      {/* ── Cabecera ─────────────────────────────────────────── */}
      <header className="mx-auto max-w-5xl px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LogoCD size={34} />
          <span className="font-bold tracking-tight" style={{ color: MARCA }}>
            Contratista Digital
          </span>
        </div>
        <a
          href={`${ORIGEN_APP}/verificar`}
          className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          Verificar un documento
        </a>
      </header>

      {/* ── Portada ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:pt-16 sm:pb-24">
        <p className="text-xs font-bold tracking-[0.15em] text-gray-400">
          SOFTWARE DE CONTRATACIÓN PÚBLICA PARA ALCALDÍAS
        </p>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-3xl">
          El expediente completo de cada contratista, listo en un clic.
        </h1>
        {/* El primer párrafo nombra los documentos por su nombre —informe de
            actividades, cuenta de cobro, actas— porque son los términos con los
            que una alcaldía busca esto, y porque son literalmente lo que hace. */}
        <p className="mt-6 text-lg leading-relaxed text-gray-600 max-w-2xl">
          Contratista Digital automatiza la supervisión de los contratos de prestación de
          servicios: los informes de actividades, las cuentas de cobro y las actas de supervisión
          y de pago se generan solos, sin errores y con sus evidencias adentro. Nadie vuelve a
          abrir un Word.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3">
          <BotonContacto
            href={enlaceWhatsApp()}
            origen="portada"
            className={`inline-flex items-center justify-center gap-2 rounded-xl ${CLASES_MARCA.fondo} ${CLASES_MARCA.fondoHover} px-7 py-3.5 text-sm font-bold text-white transition-colors`}
          >
            <IconoWhatsApp />
            Solicitar una demostración
          </BotonContacto>
          <a
            href="#como-funciona"
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-7 py-3.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Ver cómo funciona
          </a>
        </div>
      </section>

      {/* ── El problema ──────────────────────────────────────── */}
      <section className="border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Cada mes se repite el mismo desgaste
          </h2>
          <p className="mt-5 text-base leading-relaxed text-gray-600 max-w-3xl">
            Los informes llegan por WhatsApp y por correo. Las cuentas de cobro y las actas se
            digitan a mano, y basta un dato mal copiado para que el documento se devuelva y el pago
            del contratista se atrase. Y cuando llega un requerimiento de un ente de control, hay
            que reconstruir el expediente buscando en carpetas, correos y memorias USB.
          </p>
          <p className="mt-5 text-base leading-relaxed text-gray-900 font-semibold max-w-3xl">
            El costo real no es el papeleo. Es el riesgo: un expediente incompleto es un hallazgo,
            y el hallazgo no lo asume el contratista — lo asume la administración.
          </p>
        </div>
      </section>

      {/* ── Qué resuelve ─────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Lo que hace por su administración
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {CAPACIDADES.map(c => (
            <div key={c.titulo}>
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: MARCA }} />
              <h3 className="mt-4 font-bold">{c.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{c.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────── */}
      <section id="como-funciona" className="border-t border-gray-100 bg-gray-50/60 scroll-mt-4">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Tres pasos. El resto lo hace el sistema.
          </h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {PASOS.map(([titulo, texto], i) => (
              <li key={titulo}>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: MARCA }}
                >
                  {i + 1}
                </div>
                <h3 className="mt-4 font-bold">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Preguntas frecuentes ─────────────────────────────────
          Marcado con <details> nativo: se despliega sin JavaScript, y el
          contenido está en el HTML aunque esté plegado, así que un rastreador
          lo lee igual. La misma lista alimenta los datos estructurados. */}
      <section id="preguntas" className="mx-auto max-w-5xl px-5 py-16 sm:py-20 scroll-mt-4">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-10 divide-y divide-gray-100 border-y border-gray-100">
          {PREGUNTAS.map(({ p, r }) => (
            <details key={p} className="group py-5">
              <summary className="flex cursor-pointer items-start justify-between gap-6 list-none">
                <h3 className="font-bold leading-snug">{p}</h3>
                <span
                  className="mt-0.5 shrink-0 text-gray-400 transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">{r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Cierre ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <div className={`rounded-3xl ${CLASES_MARCA.fondo} px-7 py-12 sm:px-14 sm:py-16 text-center`}>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Veinte minutos y lo ve funcionando
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-300">
            Le mostramos el sistema con un contrato real de su municipio. Si decide avanzar, la
            puesta en marcha toma menos de dos semanas y no interrumpe ningún trámite en curso.
          </p>
          <BotonContacto
            href={enlaceWhatsApp()}
            origen="cierre"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-[#192031] hover:bg-gray-100 transition-colors"
          >
            <IconoWhatsApp />
            Escríbanos por WhatsApp
          </BotonContacto>
          <p className="mt-4 text-sm text-gray-400">{WHATSAPP_LEGIBLE}</p>
        </div>
      </section>

      {/* ── Pie ──────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100">
        <div className="mx-auto max-w-5xl px-5 py-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <LogoCD size={28} />
            <p className="text-sm font-bold" style={{ color: MARCA }}>Contratista Digital</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <BotonContacto
              href={enlaceWhatsApp()}
              origen="pie"
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <IconoWhatsApp />
              {WHATSAPP_LEGIBLE}
            </BotonContacto>
            <a href={ORIGEN_APP} className="font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Ingresar a la plataforma
            </a>
          </div>
        </div>
      </footer>

      {/* Medición del embudo, solo en el sitio comercial. La aplicación queda
          fuera a propósito: son 127 usuarios reales trabajando, no visitantes. */}
      <Analytics />
    </main>
  )
}
