/**
 * app/inicio/page.tsx — La portada de contratistadigital.com.
 *
 * El middleware reescribe la raíz del ápice a esta ruta, así que la URL que ve
 * el visitante es el dominio pelado. La aplicación vive en
 * app.contratistadigital.com.
 *
 * ── LO QUE NO SE PUEDE PERDER AL CAMBIAR LA PORTADA ──────────────────────
 *
 * EL AVISO DE ACCESO VA ARRIBA DEL TODO y no depende de que nadie desplace la
 * página. Buena parte del tráfico del dominio no son alcaldías evaluando el
 * producto, sino contratistas que escribieron la dirección de siempre y
 * necesitan encontrar la plataforma. Dejarlos sin puerta por hacer una portada
 * más bonita sería cambiar un problema pequeño por uno grande.
 *
 * LOS DATOS ESTRUCTURADOS Y LAS PREGUNTAS FRECUENTES siguen saliendo de UNA
 * SOLA lista, para que la página y el JSON-LD no puedan contradecirse. Son las
 * preguntas que de verdad hace un secretario antes de decidir, escritas con
 * las palabras que esa persona teclea al buscar.
 *
 * LOS BOTONES SON `BotonContacto` Y NO ENLACES PELADOS: miden el clic. La
 * distancia entre visitas y clics es el número que dice si la portada
 * convence o solo se ve bien.
 *
 * ── LA PORTADA NUEVA ─────────────────────────────────────────────────────
 *
 * SIN NINGÚN FONDO OSCURO, salvo la barra de acceso —que es utilidad, no
 * narración—. El ritmo lo da la ALTERNANCIA DE TEMPERATURA: arena y nieve,
 * cálido y frío, casi a la misma claridad. Las teselas van sobre arena porque
 * son tarjetas blancas y sobre el neutro se desvanecerían.
 *
 * EL DESTINO LO MARCA EL VERDE. Sin secciones oscuras nada señalaba un final, y
 * una llamada a la acción que se confunde con el recorrido no es un destino.
 *
 * CADA ESCENA ACTÚA UNA VEZ al entrar en el tercio central de la pantalla, y no
 * se repite: repetir obligaba a un rebobinado visible, a un tiempo muerto y a
 * una espera de turno, y las tres se percibían como tirones. Ver Escenas.tsx.
 *
 * SIN PRECIO. Se decide con datos del municipio —cuántos contratos, cuántas
 * secretarías—, así que publicarlo sería inventar. Todo camino lleva a un
 * asesor, que es donde esa conversación puede ocurrir de verdad.
 *
 * SIN PROMETER LO QUE NO HAY: nada de integración con SECOP II —el sistema ARMA
 * el paquete y alguien lo carga—, nada de firma electrónica certificada. Cada
 * afirmación sale de PRODUCTO.md.
 */

import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { LogoCD, LogoHorizontal } from '@/components/Logo'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA, CLASES_MARCA } from '@/lib/marca'
import { ORIGEN_APP, WHATSAPP_COMERCIAL, enlaceWhatsApp, HOSTS_COMERCIALES } from '@/lib/dominio'
import { SITIO, NOMBRE, TITULO, DESCRIPCION, PORTADA_SOCIAL, datosEstructurados } from '@/lib/seo'
import { Analytics } from '@vercel/analytics/next'
import BotonContacto from './BotonContacto'
import {
  ExpedienteVivo, ElMomento, CodigoQR, CadenaCustodia, Tesela, Secuencia, AlEntrar,
  TeselaDuplicados, TeselaHuella, TeselaInfraestructura, TeselaTrazabilidad,
  TeselaBloqueo, TeselaDispositivos, TeselaPaquete,
} from '@/components/folleto/Escenas'

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
    r: 'El alcance y la inversión dependen de cuántos contratos administra el municipio y de '
      + 'cuántas secretarías entran. La licencia incluye la implementación, la migración de los '
      + 'contratos en curso, la capacitación de secretarías, supervisores y contratistas, el '
      + 'soporte permanente, las actualizaciones, el alojamiento y los respaldos; no se cobra '
      + 'aparte por usuario, por documento ni por almacenamiento. Escríbanos y un asesor la '
      + 'calcula con usted.',
  },
]


/**
 * Los dos suelos de la página, y por qué son dos.
 *
 * Sin secciones oscuras hacía falta otro motor para el ritmo. Lo da la
 * alternancia de TEMPERATURA —un neutro frío y un cálido casi a la misma
 * claridad—: el corte entre secciones se nota sin que ninguna pese más que
 * otra. Y resuelve un problema que el blanco solo no resolvía: las siete
 * teselas son tarjetas blancas, y sobre un fondo casi blanco no se ven.
 */
const ARENA = '#F5F1E9'
const NIEVE = '#FAFBFC'

const VERDE = '#10b981'
/** Verde legible como texto sobre claro; el pleno solo sirve de superficie. */
const VERDE_TEXTO = '#0B7A5C'
/** Y su recíproco: tinta sobre el verde pleno del cierre. */
const VERDE_TINTA = '#04352A'

/**
 * A dónde apunta el código QR.
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

function Acto({ fondo = NIEVE, children }: { fondo?: string; children: React.ReactNode }) {
  return (
    <section className="px-6 sm:px-8 py-20 sm:py-28" style={{ backgroundColor: fondo }}>
      <div className="max-w-5xl mx-auto">{children}</div>
    </section>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: VERDE_TEXTO }}>
      {children}
    </p>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight leading-[1.12]" style={{ color: MARCA }}>
      {children}
    </h2>
  )
}

export default function InicioPage() {
  // La retícula se calcula aquí, en el servidor, con la misma librería que
  // imprime los QR dentro de los PDF.
  const qr = QRCode.create(destinoQR(), { errorCorrectionLevel: 'M' })
  const modulos = Array.from(qr.modules.data).map(Boolean)

  return (
    <main className="bg-white">
      {/* Datos estructurados: dicen a Google qué es esto —una aplicación de
          software con un precio, no un blog— y habilitan los resultados
          enriquecidos de preguntas frecuentes. */}
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

      {/* ── ACTO 1 · La promesa ─────────────────────────────────────────
          Una sola línea. El expediente ya está creciendo detrás mientras se
          lee: la demostración empieza antes que el argumento. */}
      <section className="px-6 sm:px-8 pt-7 pb-24 sm:pb-32" style={{ backgroundColor: ARENA }}>
        <div className="max-w-5xl mx-auto">
          {/* La cabecera que la página no tenía. El logo y el nombre quedan a
              la vista desde el primer píxel y no solo dentro de la portada. */}
          <header className="flex items-center justify-between gap-4">
            <LogoHorizontal size={34} />
            {/* Se conserva del sitio anterior: es tráfico real —alguien con un
                documento en la mano que quiere comprobarlo— y no tiene otra
                puerta de entrada. */}
            <a
              href={`${ORIGEN_APP}/verificar`}
              /* -my-3 py-3: ensancha el área tocable a 44px sin mover nada de sitio. */
              className="shrink-0 -my-3 py-3 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              {/* En pantallas muy estrechas el logo, el nombre y la etiqueta
                  completa no caben en una fila. Se acorta la etiqueta en vez de
                  esconder el enlace: quien llega con un documento en la mano no
                  tiene otra puerta. */}
              <span className="sm:hidden">Verificar</span>
              <span className="hidden sm:inline">Verificar un documento</span>
            </a>
          </header>

          {/* Dos columnas a partir de `lg`, y no antes: la escena mide 340px de
              ancho y en una media columna de tableta quedaría espachurrada
              contra el titular. Por debajo de ese corte se apilan, y el orden
              del DOM deja el texto primero — que es el orden en que hay que
              leerlo en un teléfono. */}
          <div className="mt-14 sm:mt-20 grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
            <div className="min-w-0">
              {/* El titular le habla al segundo motivo del lector —el desgaste
                  que vive cada mes— y no al primero, que es el miedo al
                  hallazgo. Es una elección: el miedo abre la puerta pero cansa
                  en una portada, y el alivio invita a seguir bajando.

                  La bajada nombra las tres tareas concretas que desaparecen, en
                  las palabras del lector, y cierra en SECOP II — que es donde
                  termina su mes. Dice «listo para CARGAR a SECOP II», no
                  «integrado con»: el sistema arma el paquete y la carga la
                  sigue haciendo una persona. Ver PRODUCTO.md. */}
              <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]"
                style={{ color: MARCA }}>
                El cierre del mes deja de ser un problema.
              </h1>
              <p className="mt-7 text-lg leading-relaxed max-w-xl text-gray-600">
                Ni plantillas de Word, ni consecutivos a mano, ni perseguir soportes
                uno por uno. El contratista reporta desde su celular y el sistema arma
                el expediente completo de cada contrato, listo para cargar a SECOP&nbsp;II.
              </p>

              {/* La portada vuelve a tener acción, y no solo por el embudo: una
                  primera pantalla sin nada que hacer obliga a bajar siete
                  secciones para poder actuar. `origen="portada"` la distingue
                  del cierre al medir, que es lo que dice si convence el titular
                  o hay que leer hasta el final. */}
              <BotonContacto
                href={enlaceWhatsApp('Buen día. Quisiera conocer Contratista Digital para mi alcaldía.')}
                origen="portada"
                className="mt-8 inline-flex items-center gap-3 rounded-full bg-[#10b981] px-7 py-4 font-semibold transition-transform hover:scale-[1.03]"
              >
                <span style={{ color: VERDE_TINTA }}>Hablar con un asesor</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                  style={{ color: VERDE_TINTA }}>
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </BotonContacto>
            </div>

            <div className="min-w-0 flex justify-center lg:justify-end">
              <ExpedienteVivo claro />
            </div>
          </div>
        </div>
      </section>

      {/* ── ACTO 2 · La demostración ────────────────────────────────────
          Entra la luz. Es el punto de alivio de la página y por eso cambia el
          fondo: el contraste hace el trabajo que haría un párrafo. */}
      <Acto fondo={NIEVE}>
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
      {/* Arena: las teselas son tarjetas blancas y sobre el neutro se
          desvanecerían. Aquí se leen como tarjetas. */}
      <Acto fondo={ARENA}>
        <Etiqueta>Por dentro</Etiqueta>
        <Titulo>La mejor tecnología del mundo al servicio de su alcaldía.</Titulo>

        <Secuencia className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Tesela
            titulo="Reconoce una evidencia repetida"
            cuerpo="No hace falta que sea el mismo archivo. Reconoce la misma foto aunque la hayan recortado, achicado o vuelto a fotografiar de la pantalla — y se lo advierte al supervisor antes de que apruebe, no después.">
            <TeselaDuplicados />
          </Tesela>

          <Tesela
            titulo="Sella cada documento con su huella"
            cuerpo="Cada documento sale con una huella única. Si alguien le cambia un dato —un valor, una fecha, un nombre— la huella deja de coincidir y el cambio queda a la vista. Es el estándar SHA-256, el mismo que usa la banca.">
            <TeselaHuella />
          </Tesela>

          <Tesela
            titulo="Trabajamos sobre infraestructura certificada"
            cuerpo="La infraestructura sobre la que opera está certificada bajo ISO/IEC 27001, 27017, 27018 y SOC 2 Tipo II. La información viaja cifrada, se guarda cifrada y se respalda sola, sin que nadie en la alcaldía tenga que acordarse de hacerlo.">
            <TeselaInfraestructura />
          </Tesela>

          <Tesela
            titulo="Avisa solo, en el momento"
            cuerpo="Cada vez que algo cambia sale un correo, en el momento: enviado, aprobado, devuelto. Nadie tiene que llamar a preguntar en qué va un informe. Y todo queda anotado con su responsable y su hora, en un historial que nadie puede retocar.">
            <TeselaTrazabilidad />
          </Tesela>

          <Tesela
            titulo="No deja enviar lo incompleto"
            cuerpo="Sin actividades, sin evidencias o sin planilla de seguridad social vigente, el informe no sale. El expediente se arma completo porque no hay forma de armarlo a medias.">
            <TeselaBloqueo />
          </Tesela>

          <Tesela
            titulo="Funciona en lo que ya tienen"
            cuerpo="Web, sin instalar nada. El mismo expediente desde el celular en una vereda, desde la tableta o desde el computador de la secretaría. Disponible a toda hora.">
            <TeselaDispositivos />
          </Tesela>

          <Tesela
            ancha
            titulo="Arma el paquete del mes y lo deja listo para SECOP II"
            cuerpo="Los documentos del periodo se descargan ordenados y con sus anexos numerados, listos para cargar. La carga a la plataforma la sigue haciendo una persona: el sistema prepara el paquete, no se conecta con SECOP II.">
            <TeselaPaquete />
          </Tesela>
        </Secuencia>
      </Acto>

      {/* ── ACTO 4 · La prueba ──────────────────────────────────────────
          Vuelve el azul: aquí se pide confianza otra vez. */}
      <Acto fondo={NIEVE}>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Etiqueta>Cadena de custodia</Etiqueta>
            <Titulo>Trazabilidad del 100%. De quien lo crea a quien lo verifica.</Titulo>
            <p className="mt-6 leading-relaxed text-gray-600">
              Cada documento deja constancia de quién lo hizo, quién lo aprobó y a
              qué hora, en un historial que no se altera. Cuando sale, va sellado con
              su huella digital y su código único impreso dentro del PDF: si alguien
              le cambia un dato, deja de coincidir consigo mismo y se nota.
            </p>

            <div className="mt-8">
              <CadenaCustodia />
            </div>

            {/* EL GIRO QUE PEDÍA ESTE PÁRRAFO. Antes decía que «cualquiera»
                puede comprobar un documento, y eso, leído por un secretario de
                despacho, no suena a garantía: suena a que lo van a auditar. El
                mismo hecho, contado desde su lado, es exactamente lo contrario
                — es lo que lo respalda a él el día que le pregunten.

                Y no es una promesa comercial: hay una regla de arquitectura
                que prohíbe que las direcciones de verificación dejen de
                responder, porque el código va grabado en el mapa de bits de
                documentos ya radicados en SECOP II. Ver CLAUDE.md. */}
            <p className="mt-8 leading-relaxed text-gray-600">
              El día que deje el cargo —o el día que decidan no seguir con
              nosotros— cada documento que usted firmó se sigue pudiendo
              comprobar. No se vence, no se apaga y no depende de que sigamos
              trabajando juntos.
            </p>
            <p className="mt-4 leading-relaxed text-gray-600">
              Porque la pregunta nunca llega el mes que uno la espera: llega años
              después, cuando ya nadie recuerda quién archivó qué. Y entonces lo
              que lo respalda no es haber hecho bien el trabajo, sino poder
              demostrarlo — sin tres días de angustia revolviendo carpetas para
              encontrar un acta de supervisión.
            </p>
            <p className="mt-5 leading-relaxed">
              <span className="font-semibold" style={{ color: MARCA }}>Escanee el código y véalo funcionando.</span>{' '}
              <span className="text-gray-600">
                Así de fácil será comprobar un documento suyo dentro de cinco años.
              </span>
            </p>
          </div>
          <div className="flex justify-center">
            <CodigoQR modulos={modulos} lado={qr.modules.size} />
          </div>
        </div>
      </Acto>

      {/* ── ACTO 5 · Quién hace qué ─────────────────────────────────────
          Sustituye a «La cuenta» y a «Las cifras», que se retiraron. El
          argumento cambia de aritmética a personas, y gana: un secretario no
          se imagina 167 horas, pero sí se imagina a su supervisor dejando de
          revisar si es la cuenta 6 o la 7.

          TODO LO QUE SE AFIRMA AQUÍ ESTÁ VERIFICADO CONTRA EL CÓDIGO. Se
          quedaron fuera dos cosas que se habían pedido, por no ser ciertas
          hoy: los otrosíes —no existen en el sistema, cero coincidencias— y
          que el software «avise si el IBC está correcto». Lo que hace es
          calcular la base que corresponde por la regla legal y ponérsela
          delante a quien revisa, junto al mes realmente cotizado; la decisión
          la sigue tomando una persona. Prometer una validación automática
          sería más vendedor y se caería en la primera demostración. */}
      <Acto fondo={ARENA}>
        <Etiqueta>Quién hace qué</Etiqueta>
        <Titulo>Cada quien vuelve a su oficio.</Titulo>
        <p className="mt-6 text-lg leading-relaxed text-gray-600 max-w-2xl">
          No se trata de hacer el mismo papeleo más rápido. Se trata de que ya
          nadie en la alcaldía tenga que hacerlo.
        </p>

        <AlEntrar className="mt-12 grid sm:grid-cols-2 gap-4">
          {[
            {
              glifo: Iconos.navegacion.contratistas,
              quien: 'El contratista',
              titular: 'Ahora solo se ocupa de evidenciar su trabajo.',
              cuerpo: 'Sube actividades y soportes desde el celular, donde esté. No redacta informes, no arma cuentas de cobro, no cuadra consecutivos ni escribe valores en letras. Y deja de recibir devoluciones por un dato que nunca debió escribir a mano.',
            },
            {
              glifo: Iconos.navegacion.firmas,
              quien: 'El supervisor',
              titular: 'Ahora solo se dedica a supervisar lo trabajado.',
              cuerpo: 'Revisa cada obligación con su evidencia al lado, y aprueba o devuelve. No comprueba fechas, ni si es la cuenta 6 o la 7, ni redacta actas de supervisión, de pago ni de terminación: las escribe el sistema. Y al revisar la seguridad social tiene delante la base de cotización que le corresponde al contrato y el mes realmente cotizado — para que aprobar deje de ser un acto de fe.',
            },
            {
              glifo: Iconos.navegacion.contratos,
              quien: 'Contratación',
              titular: 'Monta el municipio una vez y deja de perseguir papeles.',
              cuerpo: 'Crea las secretarías, los usuarios y los contratos con sus obligaciones, sus periodos y sus soportes —CDP, CRP, RUT y certificación bancaria— en una sola ficha. Después, cada periodo queda con su paquete armado y ordenado, listo para cargar a SECOP II.',
            },
            {
              glifo: Iconos.navegacion.municipio,
              quien: 'El alcalde',
              titular: 'Toda la alcaldía en la palma de la mano.',
              cuerpo: 'Una tarjeta por secretaría con su secretario, sus contratistas y su ejecución. La ejecución mensual del año, el presupuesto por secretaría y el calendario de vencimientos. Ve los totales, no los datos de las personas: ni cédulas ni cuentas bancarias.',
            },
          ].map((a, i) => (
            <div key={a.quien}
              className="prop-entra rounded-2xl border border-[#E4DFD3] bg-white p-6 sm:p-7"
              style={{ transitionDelay: `${i * 110}ms` }}>
              <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl"
                style={{ backgroundColor: '#EAF5F0', color: VERDE_TEXTO }}>
                <Icono glifo={a.glifo} tamano="lg" />
              </span>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                {a.quien}
              </p>
              <p className="mt-2 text-xl font-bold leading-snug" style={{ color: MARCA }}>
                {a.titular}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-gray-600">{a.cuerpo}</p>
            </div>
          ))}
        </AlEntrar>
      </Acto>

      {/* ── Preguntas frecuentes ─────────────────────────────────────────
          No son relleno para buscadores: son las objeciones reales, y alimentan
          a la vez la página y el JSON-LD desde una sola lista. Van antes del
          cierre porque quien llega hasta aquí ya está evaluando, y lo que le
          falta para escribir es que le resuelvan la duda que trae. */}
      <Acto fondo={NIEVE}>
        <Etiqueta>Preguntas frecuentes</Etiqueta>
        <Titulo>Lo que preguntan antes de decidir.</Titulo>

        <AlEntrar className="mt-12 space-y-3">
          {PREGUNTAS.map(({ p, r }) => (
            <details
              key={p}
              className="prop-entra group rounded-2xl border border-[#E4EAEF] bg-white px-6 py-1.5 open:shadow-sm"
            >
              {/* El relleno vertical va en el `summary` y no en el `details`: el
                    área que responde al dedo es esta, y como renglón de texto medía
                    22px — la mitad del mínimo cómodo. Ahora pasa de 54px. */}
              <summary className="flex cursor-pointer items-start justify-between gap-4 list-none py-4">
                <h3 className="text-base sm:text-lg font-semibold leading-snug" style={{ color: MARCA }}>{p}</h3>
                <span
                  className="mt-1 shrink-0 transition-transform duration-300 group-open:rotate-45"
                  style={{ color: VERDE_TEXTO }}
                  aria-hidden="true"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="pb-5 -mt-1 text-[15px] leading-relaxed text-gray-600">{r}</p>
            </details>
          ))}
        </AlEntrar>
      </Acto>

      {/* El cierre es el ÚNICO bloque saturado de la página, y lo es por
          necesidad: sin secciones oscuras nada marcaba un destino, y una
          llamada a la acción que se confunde con el resto del recorrido no es
          un destino. El verde pleno lo resuelve sin traer de vuelta el negro,
          y de paso es el color con el que el producto lleva toda la página
          diciendo «confirmado». */}
      <section className="px-6 sm:px-8 py-24 sm:py-32" style={{ backgroundColor: VERDE }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-2xl"
            style={{ color: VERDE_TINTA }}>
            Hablemos de su municipio.
          </h2>
          <p className="mt-6 text-lg leading-relaxed max-w-xl" style={{ color: 'rgba(4,53,42,.78)' }}>
            El alcance y la inversión dependen de cuántos contratos maneja y de
            cuántas secretarías entran. Uno de nuestros asesores lo calcula con
            usted y le muestra la plataforma funcionando, con documentos reales.
          </p>

          {/* Sobre el verde pleno, el botón se vuelve tinta de marca: es el
              contraste más alto que la paleta permite sin inventar un color. */}
          {/* BotonContacto y no un <a> pelado: es el único punto de
              conversión del sitio, y la distancia entre visitas y clics es el
              número que dice si la página convence o solo se ve bien. */}
          <BotonContacto
            href={enlaceWhatsApp('Buen día. Quisiera conocer Contratista Digital para mi alcaldía.')}
            origen="cierre"
            className="mt-10 inline-flex items-center gap-3 rounded-full px-8 py-4 font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            Hablar con un asesor
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </BotonContacto>

          <div className="mt-16 pt-8 grid sm:grid-cols-4 gap-6"
            style={{ borderTop: '1px solid rgba(4,53,42,.18)' }}>
            {[
              ['Implementación', 'Configuramos el municipio y migramos los contratos en curso.'],
              ['Capacitación', 'Por rol: contratistas, supervisores y contratación.'],
              ['Acompañamiento', 'Estamos en el primer ciclo mensual completo, de principio a fin.'],
              ['Soporte', 'Y las actualizaciones van incluidas, sin cobro aparte.'],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="text-sm font-semibold" style={{ color: VERDE_TINTA }}>{t}</p>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'rgba(4,53,42,.62)' }}>{d}</p>
              </div>
            ))}
          </div>
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
              className="inline-flex items-center gap-2 -my-3 py-3 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <IconoWhatsApp />
              {WHATSAPP_LEGIBLE}
            </BotonContacto>
            <a href={ORIGEN_APP} className="-my-3 py-3 font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Ingresar a la plataforma
            </a>
          </div>
        </div>
      </footer>

      {/* Medición del embudo, solo en el sitio comercial. La aplicación queda
          fuera a propósito: son 127 usuarios reales trabajando, no visitantes. */}
      <Analytics />

      {/* Medición del embudo, solo en el sitio comercial. */}
      <Analytics />
    </main>
  )
}
