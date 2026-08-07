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
import { ORIGEN_APP, EMAIL_CONTACTO } from '@/lib/dominio'

export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'Contratista Digital — Supervisión de contratos para alcaldías',
  description:
    'Automatiza la supervisión de los contratos de prestación de servicios: el contratista '
    + 'reporta desde su celular, el supervisor aprueba en línea y los documentos se generan '
    + 'solos, numerados y verificables.',
}

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
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#131B2B] transition-colors hover:bg-gray-100"
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
          PARA ALCALDÍAS MUNICIPALES
        </p>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-3xl">
          El expediente completo de cada contratista, listo en un clic.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-gray-600 max-w-2xl">
          Contratista Digital automatiza de principio a fin la supervisión de los contratos de
          prestación de servicios. Nadie vuelve a abrir un Word: el sistema genera cada documento
          solo y el expediente queda armado, verificable y listo para radicar.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3">
          <a
            href={`mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent('Demostración de Contratista Digital')}`}
            className={`inline-flex items-center justify-center rounded-xl ${CLASES_MARCA.fondo} ${CLASES_MARCA.fondoHover} px-7 py-3.5 text-sm font-bold text-white transition-colors`}
          >
            Solicitar una demostración
          </a>
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
          <a
            href={`mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent('Demostración de Contratista Digital')}`}
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-white px-8 py-3.5 text-sm font-bold text-[#131B2B] hover:bg-gray-100 transition-colors"
          >
            Solicitar una demostración
          </a>
        </div>
      </section>

      {/* ── Pie ──────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100">
        <div className="mx-auto max-w-5xl px-5 py-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <LogoCD size={28} />
            <div>
              <p className="text-sm font-bold" style={{ color: MARCA }}>Contratista Digital</p>
              <p className="text-xs text-gray-500">
                Gestión documental contractual para el sector público
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <a href={`mailto:${EMAIL_CONTACTO}`} className="text-gray-600 hover:text-gray-900 transition-colors">
              {EMAIL_CONTACTO}
            </a>
            <a href={ORIGEN_APP} className="font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Ingresar a la plataforma
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}
