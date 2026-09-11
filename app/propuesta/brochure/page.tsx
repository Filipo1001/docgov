import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { LogoHorizontal } from '@/components/Logo'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'
import { enlaceWhatsApp, HOSTS_COMERCIALES } from '@/lib/dominio'
import {
  ExpedienteVivo, ElMomento, CodigoQR, CadenaCustodia, Tesela, Secuencia, AlEntrar,
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
 * SIN NINGÚN FONDO OSCURO, por decisión. Eso costó el motor del ritmo —el
 * vaivén oscuro→claro→oscuro que hacía de gravedad, alivio y compromiso— y lo
 * reemplaza la ALTERNANCIA DE TEMPERATURA: arena y nieve, cálido y frío, casi
 * a la misma claridad. El corte entre secciones se nota sin que ninguna pese
 * más que otra.
 *
 * Las teselas van sobre arena y no sobre nieve porque son tarjetas blancas:
 * sobre el neutro se desvanecerían.
 *
 * Y EL DESTINO LO MARCA EL VERDE. Sin secciones oscuras nada señalaba un
 * final, y una llamada a la acción que se confunde con el recorrido no es un
 * destino. El cierre es el único bloque saturado de la página — en el mismo
 * color con el que el producto lleva toda la página diciendo «confirmado».
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

/**
 * Los dos suelos del folleto, y por qué son dos.
 *
 * Al quitar las secciones oscuras se cayó el motor del ritmo: el vaivén
 * oscuro→claro→oscuro que hacía de gravedad, alivio y compromiso. Lo
 * reemplaza la ALTERNANCIA DE TEMPERATURA — un neutro frío y un cálido casi a
 * la misma claridad. El corte entre secciones se nota sin que ninguna pese
 * más que otra, que es exactamente lo que se pedía.
 *
 * Y resuelve un problema que el blanco solo no resolvía: las siete teselas son
 * tarjetas blancas, y sobre un fondo casi blanco no se ven. Sobre arena sí.
 * Por eso van ahí y no en el neutro.
 */
const ARENA = '#F5F1E9'
const NIEVE = '#FAFBFC'

const VERDE = '#10b981'
/** Verde legible como texto sobre claro; el pleno solo sirve de superficie. */
const VERDE_TEXTO = '#0B7A5C'
/** Y su recíproco: tinta sobre el verde pleno del cierre. */
const VERDE_TINTA = '#04352A'

export const metadata: Metadata = {
  title: 'Contratista Digital · Gestión documental contractual para alcaldías',
  description:
    'El contratista reporta actividades y evidencias desde cualquier dispositivo. '
    + 'El sistema genera, numera y sella cada documento del ciclo mensual, verificable por QR.',
  robots: { index: false, follow: false },
}

function Acto({ fondo = NIEVE, children }: { fondo?: string; children: React.ReactNode }) {
  return (
    <section
      className="px-6 sm:px-8 py-20 sm:py-28"
      style={{ backgroundColor: fondo }}
    >
      <div className="max-w-5xl mx-auto">{children}</div>
    </section>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: VERDE_TEXTO }}>
      {children}
    </p>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight leading-[1.12]"
      style={{ color: MARCA }}>
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
      <section className="px-6 sm:px-8 pt-7 pb-24 sm:pb-32" style={{ backgroundColor: ARENA }}>
        <div className="max-w-5xl mx-auto">
          {/* La cabecera que la página no tenía. El logo y el nombre quedan a
              la vista desde el primer píxel y no solo dentro de la portada. */}
          <header>
            <LogoHorizontal size={34} />
          </header>

          {/* Dos columnas a partir de `lg`, y no antes: la escena mide 340px de
              ancho y en una media columna de tableta quedaría espachurrada
              contra el titular. Por debajo de ese corte se apilan, y el orden
              del DOM deja el texto primero — que es el orden en que hay que
              leerlo en un teléfono. */}
          <div className="mt-14 sm:mt-20 grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
            <div>
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
            </div>

            <div className="flex justify-center lg:justify-end">
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

            {/* «No caduca» no es una promesa comercial: hay una regla de
                arquitectura que prohíbe que las URL de verificación dejen de
                responder, porque el QR va grabado en el mapa de bits de
                documentos ya radicados en SECOP II. Ver CLAUDE.md. */}
            <p className="mt-8 leading-relaxed text-gray-600">
              Esa custodia no caduca. Un acta firmada hoy se podrá comprobar dentro
              de años, sin cuenta y sin pedirle permiso a nadie.
            </p>
            <p className="mt-5 leading-relaxed">
              <span className="font-semibold" style={{ color: MARCA }}>Escanee el código.</span>{' '}
              <span className="text-gray-600">
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
          El trabajo de oficina no desaparece porque alguien lo haga más rápido.
          Desaparece porque deja de existir.
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
              cuerpo: 'Una tarjeta por secretaría con su secretario, sus contratistas y su ejecución. La ejecución mensual del año, el presupuesto por secretaría y el calendario de vencimientos. Solo lectura agregada: no expone cédulas ni datos bancarios.',
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
          <a
            href={enlaceWhatsApp('Buen día. Quisiera conocer Contratista Digital para mi alcaldía.')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-3 rounded-full px-8 py-4 font-semibold text-white transition-transform hover:scale-[1.03]"
            style={{ backgroundColor: MARCA }}
          >
            Hablar con un asesor
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>

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
    </main>
  )
}
