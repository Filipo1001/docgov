import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { LogoHorizontal } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import { enlaceWhatsApp, HOSTS_COMERCIALES } from '@/lib/dominio'
import {
  ExpedienteVivo, ElMomento, CodigoQR, CadenaCustodia, Cifra, Tesela, Secuencia,
  TeselaDuplicados, TeselaHuella, TeselaInfraestructura, TeselaTrazabilidad,
  TeselaBloqueo, TeselaDispositivos, TeselaPaquete,
} from './Escenas'

/**
 * Folleto general de Contratista Digital.
 *
 * PREVIEW. Vive aparte y no toca `app/inicio`, que sigue sirviendo el ápice:
 * se pidió verlo antes de reemplazar nada. Por eso no se indexa todavía.
 *
 * ── Las decisiones que lo gobiernan ──────────────────────────────────────
 *
 * SIN PRECIO. Se decide con datos del municipio —cuántos contratos, cuántas
 * secretarías—, así que publicarlo sería inventar. El cierre lleva a un
 * asesor, que es donde esa conversación puede ocurrir de verdad.
 *
 * SIN NOMBRAR AL CLIENTE, y sin fecha de arranque. Las cifras son reales y
 * hablan solas; decir «desde abril» nos haría sonar recién nacidos, que es lo
 * contrario de lo que necesita creer quien firma.
 *
 * SIN PROMETER LO QUE NO HAY. Nada de integración con SECOP II: el sistema
 * ARMA el paquete y alguien lo carga. Nada de firma electrónica certificada.
 * Cada afirmación de esta página sale de PRODUCTO.md.
 *
 * EN PLURAL. «Nuestros asesores», «acompañamos». Sin nombres propios y sin
 * inventar oficinas ni plantilla: la voz es de empresa porque lo que se
 * entrega —implementación, capacitación, soporte, actualizaciones— es trabajo
 * de empresa, no un favor personal.
 *
 * EL COLOR TRABAJA. Azul noche donde se pide confianza (portada, verificación,
 * cierre) y claro donde se demuestra (el envío, las capacidades, la cuenta).
 * El vaivén oscuro→claro→oscuro ES la narración: gravedad, alivio, compromiso.
 * El verde aparece solo cuando algo queda confirmado — que es lo que el verde
 * ya significa dentro del producto.
 */

/**
 * A dónde apunta el código QR del folleto.
 *
 * Tiene que ser absoluto: se lee desde el teléfono de otra persona, que no
 * tiene contexto de origen. En preview apunta al propio deployment y no a
 * producción, para que lo que se escanea sea lo que se está revisando.
 */
function destinoQR(): string {
  if (process.env.VERCEL_ENV === 'production') return `https://${HOSTS_COMERCIALES[0]}/propuesta/emitidos`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/propuesta/emitidos`
  return 'http://localhost:3000/propuesta/emitidos'
}

const TINTA_CLARA = '#F7F9FA'
const VERDE = '#10b981'

export const metadata: Metadata = {
  title: 'Contratista Digital · Gestión documental contractual para alcaldías',
  description:
    'El contratista reporta actividades y evidencias desde cualquier dispositivo. '
    + 'El sistema genera, numera y sella cada documento del ciclo mensual, verificable por QR.',
  robots: { index: false, follow: false },
}

function Acto({ oscura = false, children }: { oscura?: boolean; children: React.ReactNode }) {
  return (
    <section
      className="px-6 sm:px-8 py-20 sm:py-28"
      style={{ backgroundColor: oscura ? MARCA : TINTA_CLARA }}
    >
      <div className="max-w-5xl mx-auto">{children}</div>
    </section>
  )
}

function Etiqueta({ oscura = false, children }: { oscura?: boolean; children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: oscura ? 'rgba(255,255,255,.45)' : '#94A3AF' }}>
      {children}
    </p>
  )
}

function Titulo({ oscura = false, children }: { oscura?: boolean; children: React.ReactNode }) {
  return (
    <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight leading-[1.12]"
      style={{ color: oscura ? '#FFFFFF' : '#111827' }}>
      {children}
    </h2>
  )
}

export default function FolletoPage() {
  // La retícula se calcula aquí, en el servidor, con la misma librería que
  // imprime los QR dentro de los PDF. Corrección de errores media: aguanta un
  // reflejo o un dedo encima sin dejar de leerse.
  const qr = QRCode.create(destinoQR(), { errorCorrectionLevel: 'M' })
  const modulos = Array.from(qr.modules.data).map(Boolean)

  return (
    <main>
      {/* ── ACTO 1 · La promesa ─────────────────────────────────────────
          Una sola línea. El expediente ya está creciendo detrás mientras se
          lee: la demostración empieza antes que el argumento. */}
      <section className="px-6 sm:px-8 pt-7 pb-24 sm:pb-32" style={{ backgroundColor: MARCA }}>
        <div className="max-w-5xl mx-auto">
          {/* La cabecera que la página no tenía. El logo y el nombre quedan a
              la vista desde el primer píxel y no solo dentro de la portada. */}
          <header>
            <LogoHorizontal size={34} color="#FFFFFF" colorNombre="#FFFFFF" />
          </header>

          {/* TEXTO PROVISIONAL. Se pidió lorem ipsum a propósito, para juzgar
              la animación sin que el titular compita por la atención. El
              original está en el historial: «Nunca más un expediente
              incompleto.» más su bajada. Restaurar antes de publicar. */}
          <h1 className="mt-16 sm:mt-20 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] text-white max-w-3xl">
            Lorem ipsum dolor sit amet consectetur.
          </h1>
          <p className="mt-7 text-lg leading-relaxed max-w-xl" style={{ color: 'rgba(255,255,255,.62)' }}>
            Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
            enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo.
          </p>
          <div className="mt-14">
            <ExpedienteVivo />
          </div>
        </div>
      </section>

      {/* ── ACTO 2 · La demostración ────────────────────────────────────
          Entra la luz. Es el punto de alivio de la página y por eso cambia el
          fondo: el contraste hace el trabajo que haría un párrafo. */}
      <Acto>
        <Etiqueta>El momento</Etiqueta>
        <Titulo>Se envía una vez. El resto lo escribe el sistema.</Titulo>
        <p className="mt-6 text-lg leading-relaxed text-gray-600 max-w-2xl">
          El contratista evidencia su trabajo; el supervisor lo supervisa. Los
          nombres, las fechas, los consecutivos y el valor en letras no vuelven
          a ser motivo de devolución.
        </p>
        <div className="mt-12">
          <ElMomento />
        </div>
      </Acto>

      {/* ── ACTO 3 · Lo que ocurre por dentro ───────────────────────────
          Se pidió que las ventajas no fueran palabras ni emojis. Cada tesela
          anima su propio argumento y solo ese. */}
      <Acto>
        <Etiqueta>Por dentro</Etiqueta>
        <Titulo>Siete cosas que ya vienen resueltas.</Titulo>

        <Secuencia className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Tesela
            titulo="Reconoce una evidencia repetida"
            cuerpo="No solo el archivo idéntico. Detecta la misma imagen aunque la hayan recortado, recomprimido o vuelto a fotografiar de la pantalla, y avisa al supervisor antes de que apruebe.">
            <TeselaDuplicados indice={0} />
          </Tesela>

          <Tesela
            titulo="Sella cada documento con su huella"
            cuerpo="Cada PDF emitido guarda su huella SHA-256. Si cambia un solo carácter, la huella cambia entera: un documento alterado deja de coincidir consigo mismo y se nota.">
            <TeselaHuella indice={1} />
          </Tesela>

          <Tesela
            titulo="Trabajamos sobre infraestructura certificada"
            cuerpo="La infraestructura sobre la que opera está certificada bajo ISO/IEC 27001, 27017, 27018 y SOC 2 Tipo II, con respaldos automáticos y cifrado en tránsito y en reposo. La mejor tecnología del mundo al servicio de su alcaldía.">
            <TeselaInfraestructura indice={2} />
          </Tesela>

          <Tesela
            titulo="Avisa solo, en el momento"
            cuerpo="Cada cambio de estado sale por correo apenas ocurre: enviado, aprobado, devuelto. Nadie tiene que llamar a preguntar en qué va un informe. Y cada acción queda registrada con su responsable y su hora en un historial que no se altera.">
            <TeselaTrazabilidad indice={3} />
          </Tesela>

          <Tesela
            titulo="No deja enviar lo incompleto"
            cuerpo="Sin actividades, sin evidencias o sin planilla de seguridad social vigente, el informe no sale. El expediente se arma completo porque no hay forma de armarlo a medias.">
            <TeselaBloqueo indice={4} />
          </Tesela>

          <Tesela
            titulo="Funciona en lo que ya tienen"
            cuerpo="Web, sin instalar nada. El mismo expediente desde el celular en una vereda, desde la tableta o desde el computador de la secretaría. Disponible a toda hora.">
            <TeselaDispositivos indice={5} />
          </Tesela>

          <Tesela
            ancha
            titulo="Arma el paquete del mes y lo deja listo para SECOP II"
            cuerpo="Los documentos del periodo se descargan ordenados y con sus anexos numerados, listos para cargar. La carga a la plataforma la sigue haciendo una persona: el sistema prepara el paquete, no se conecta con SECOP II.">
            <TeselaPaquete indice={6} />
          </Tesela>
        </Secuencia>
      </Acto>

      {/* ── ACTO 4 · La prueba ──────────────────────────────────────────
          Vuelve el azul: aquí se pide confianza otra vez. */}
      <Acto oscura>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Etiqueta oscura>Cadena de custodia</Etiqueta>
            <Titulo oscura>Trazabilidad del 100%. De quien lo crea a quien lo verifica.</Titulo>
            <p className="mt-6 leading-relaxed" style={{ color: 'rgba(255,255,255,.62)' }}>
              Cada documento deja constancia de quién lo hizo, quién lo aprobó y a
              qué hora, en un historial que no se altera. Cuando sale, va sellado con
              su huella digital y su código único impreso dentro del PDF: si alguien
              le cambia un dato, deja de coincidir consigo mismo y se nota.
            </p>

            <div className="mt-8">
              <CadenaCustodia />
            </div>

            {/* «No caduca» no es una promesa comercial: hay una regla de
                arquitectura que prohíbe que las URL de verificación dejen de
                responder, porque el QR va grabado en el mapa de bits de
                documentos ya radicados en SECOP II. Ver CLAUDE.md. */}
            <p className="mt-8 leading-relaxed" style={{ color: 'rgba(255,255,255,.62)' }}>
              Esa custodia no caduca. Un acta firmada hoy se podrá comprobar dentro
              de años, sin cuenta y sin pedirle permiso a nadie.
            </p>
            <p className="mt-5 leading-relaxed text-white">
              <span className="font-semibold">Escanee el código.</span>{' '}
              <span style={{ color: 'rgba(255,255,255,.62)' }}>
                Lleva a cuántos documentos verificables lleva emitidos la plataforma,
                en este momento.
              </span>
            </p>
          </div>
          <div className="flex justify-center">
            <CodigoQR modulos={modulos} lado={qr.modules.size} />
          </div>
        </div>
      </Acto>

      {/* ── ACTO 5 · La cuenta ──────────────────────────────────────────
          Aritmética sobre un municipio hipotético de cien contratos, no sobre
          un cliente. El único supuesto —veinte minutos por documento— va
          escrito, para que quien lo dude pueda ajustarlo y seguir leyendo. */}
      <Acto>
        <Etiqueta>La cuenta</Etiqueta>
        <Titulo>Cien contratos son quinientos documentos al mes.</Titulo>

        <div className="mt-12 grid sm:grid-cols-3 gap-4">
          {[
            { cifra: <Cifra hasta={500} />, pie: 'documentos al mes', nota: 'Cinco por contrato: informe, cuenta de cobro, acta de supervisión, acta de pago y certificación de retención.' },
            { cifra: <><Cifra hasta={167} /> h</>, pie: 'de transcripción', nota: 'A veinte minutos por documento — nombre, cédula, número de contrato, fechas, valor en letras, consecutivo.' },
            { cifra: <Cifra hasta={1} />, pie: 'empleado de tiempo completo', nota: 'Eso es lo que cuesta, todos los meses, hacer a mano lo que el sistema hace solo.', fuerte: true },
          ].map(({ cifra, pie, nota, fuerte }) => (
            <div key={pie} className="rounded-2xl border p-6"
              style={{ borderColor: fuerte ? MARCA : '#E4EAEF', backgroundColor: fuerte ? '#FFFFFF' : 'transparent' }}>
              <p className="text-4xl font-bold tracking-tight" style={{ color: fuerte ? MARCA : '#111827' }}>
                {cifra}
              </p>
              <p className="mt-1.5 text-sm font-semibold text-gray-900">{pie}</p>
              <p className="mt-3 text-[13px] text-gray-500 leading-relaxed">{nota}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-[13px] text-gray-400 leading-relaxed max-w-2xl">
          Y eso es solo el tiempo de escribirlos. No cuenta perseguir soportes,
          rehacer lo devuelto, ni buscar el expediente del contrato 47 cuando
          alguien lo pide.
        </p>
      </Acto>

      {/* ── ACTO 6 · Lo que ya está andando ─────────────────────────────
          Sin fecha de arranque y sin nombrar municipio. Las cifras son
          reales y se reverifican contra producción antes de publicar. */}
      <Acto oscura>
        <Etiqueta oscura>En operación</Etiqueta>
        <Titulo oscura>No es una maqueta.</Titulo>

        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            [<Cifra key="d" hasta={518} />, 'documentos emitidos y verificables'],
            [<Cifra key="e" hasta={4128} />, 'evidencias archivadas'],
            [<><Cifra key="v" hasta={3722} /></>, 'millones de pesos bajo gestión'],
            [<><Cifra key="h" hasta={44.7} decimales={1} /> h</>, 'mediana de aprobación de un informe'],
          ].map(([cifra, pie], i) => (
            <div key={i}>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight text-white">{cifra}</p>
              <p className="mt-2 text-sm leading-snug" style={{ color: 'rgba(255,255,255,.5)' }}>{pie}</p>
            </div>
          ))}
        </div>
      </Acto>

      {/* ── ACTO 7 · El cierre ──────────────────────────────────────────
          Una sola acción en toda la página. */}
      <section className="px-6 sm:px-8 py-24 sm:py-32" style={{ backgroundColor: MARCA }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-white max-w-2xl">
            Hablemos de su municipio.
          </h2>
          <p className="mt-6 text-lg leading-relaxed max-w-xl" style={{ color: 'rgba(255,255,255,.62)' }}>
            El alcance y la inversión dependen de cuántos contratos maneja y de
            cuántas secretarías entran. Uno de nuestros asesores lo calcula con
            usted y le muestra la plataforma funcionando, con documentos reales.
          </p>

          <a
            href={enlaceWhatsApp('Buen día. Quisiera conocer Contratista Digital para mi alcaldía.')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-3 rounded-full px-8 py-4 font-semibold transition-transform hover:scale-[1.03]"
            style={{ backgroundColor: VERDE, color: '#06281F' }}
          >
            Hablar con un asesor
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

          <div className="mt-16 pt-8 grid sm:grid-cols-4 gap-6"
            style={{ borderTop: '1px solid rgba(255,255,255,.12)' }}>
            {[
              ['Implementación', 'Configuramos el municipio y migramos los contratos en curso.'],
              ['Capacitación', 'Por rol: contratistas, supervisores y contratación.'],
              ['Acompañamiento', 'Estamos en el primer ciclo mensual completo, de principio a fin.'],
              ['Soporte', 'Y las actualizaciones van incluidas, sin cobro aparte.'],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="text-sm font-semibold text-white">{t}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,.45)' }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
