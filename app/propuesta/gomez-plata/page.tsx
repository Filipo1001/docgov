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
} from '@/components/folleto/Escenas'
import { GOMEZ_PLATA } from './datos'

/**
 * Propuesta para la Alcaldía Municipal de Gómez Plata.
 *
 * Es la portada del sitio, personalizada. Comparte con ella las escenas
 * —`components/folleto/Escenas`— y el recorrido, de modo que lo que el alcalde
 * ve aquí es lo mismo que verá cualquiera que entre al dominio: si la propuesta
 * y el producto se contaran distinto, la primera demostración lo delataría.
 *
 * LO QUE CAMBIA RESPECTO A LA PORTADA:
 *
 *  · El escudo del municipio y el nombre del alcalde, arriba. La entidad va
 *    primero y la persona debajo: se propone a una alcaldía, no a un señor.
 *  · EL PRECIO, al final. En la portada no va —se decide con datos del
 *    municipio— pero aquí ya están esos datos, así que aquí sí se dice.
 *  · Se van las preguntas frecuentes: alimentan al buscador, y esto no se
 *    busca, se entrega.
 *  · NO SE INDEXA. Lleva el nombre del alcalde y un precio concreto: no es
 *    material público, es un documento dirigido.
 *
 * SIN VIGENCIA, por decisión: el plazo se acuerda en la conversación y
 * escribirlo aquí sería comprometer algo que todavía no está hablado.
 *
 * El escudo se guarda en el repositorio y no se enlaza al sitio del municipio:
 * un enlace a un servidor ajeno se cae el día que ellos reorganicen su web, y
 * sería justo el día de la reunión.
 */

export const metadata: Metadata = {
  title: 'Propuesta · Alcaldía Municipal de Gómez Plata',
  description: 'Contratista Digital para la Alcaldía Municipal de Gómez Plata.',
  robots: { index: false, follow: false },
}

const ARENA = '#F5F1E9'
const NIEVE = '#FAFBFC'
const VERDE = '#10b981'
const VERDE_TEXTO = '#0B7A5C'
const VERDE_TINTA = '#04352A'
/** Panel del precio recurrente. Ver el comentario de esa sección. */
const VERDE_PANEL = '#E9F5F0'

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

export default function GomezPlataPage() {
  const qr = QRCode.create(destinoQR(), { errorCorrectionLevel: 'M' })
  const modulos = Array.from(qr.modules.data).map(Boolean)

  return (
    <main className="bg-white">
      {/* ── La portada, dirigida ─────────────────────────────────────── */}
      <section className="px-6 sm:px-8 pt-7 pb-24 sm:pb-32" style={{ backgroundColor: ARENA }}>
        <div className="max-w-5xl mx-auto">
          <header className="flex items-center justify-between gap-4">
            <LogoHorizontal size={34} />
            <a
              href="/propuesta/gomez-plata/pdf"
              className="shrink-0 -my-3 py-3 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Descargar en PDF
            </a>
          </header>

          {/* El escudo va en tarjeta blanca a propósito: la imagen oficial del
              municipio trae fondo blanco opaco —cero transparencia— y sobre el
              arena aparecería como un recuadro pegado. En tarjeta se lee como
              lo que es, un sello institucional. */}
          <div className="mt-12 flex flex-wrap items-center gap-5">
            <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
              {/* Etiqueta <img> normal y NO el componente de imagen de Next.
                  Su optimizador devuelve este PNG en blanco —es de paleta
                  indexada y algo se pierde al reprocesarlo—, y el escudo
                  aparecía como un recuadro vacío. Optimizar 7,7 KB no ahorra
                  nada; servirlo tal cual lo arregla y además garantiza que
                  llegue idéntico al archivo oficial del municipio. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={GOMEZ_PLATA.escudo}
                alt={`Escudo de la Alcaldía Municipal de ${GOMEZ_PLATA.municipio}`}
                width={150}
                height={50}
              />
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Propuesta preparada para la<br />
              <span className="font-semibold" style={{ color: MARCA }}>
                Alcaldía Municipal de {GOMEZ_PLATA.municipio}
              </span>
              <br />
              <span className="text-gray-600">
                En cabeza del señor Alcalde {GOMEZ_PLATA.alcalde}
              </span>
            </p>
          </div>

          <div className="mt-12 sm:mt-16 grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
            <div className="min-w-0">
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

      {/* ── La inversión ─────────────────────────────────────────────────
          Va al final y no antes: un precio leído sin haber visto todavía qué
          se compra no tiene con qué compararse. Dos pagos separados y con
          alcance propio, porque son dos cosas distintas —montar y operar— y
          juntarlos en una sola cifra mensual escondería que el primero no se
          repite. */}
      <Acto fondo={ARENA}>
        <Etiqueta>La inversión</Etiqueta>
        <Titulo>Lo que cuesta, para {GOMEZ_PLATA.municipio}.</Titulo>

        <AlEntrar className="mt-12 grid sm:grid-cols-2 gap-4">
          <div className="prop-entra rounded-2xl border border-[#E4DFD3] bg-white p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              Primer mes · una sola vez
            </p>
            <p className="mt-4 text-4xl font-bold tracking-tight" style={{ color: MARCA }}>
              $3.500.000
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900">Implementación</p>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              Configuración del municipio y sus secretarías, creación de los usuarios,
              cargue de los contratos vigentes, adaptación de los documentos al formato
              de {GOMEZ_PLATA.municipio} y capacitación por rol. No se repite.
            </p>
          </div>

          {/* EN VERDE Y NO EN NEGRO, y es una corrección deliberada. Esta
              tarjeta llevaba el fondo de tinta de marca, casi negro, y un
              bloque oscuro encima de una cifra se lee como una factura:
              comunica peso, cierre, gasto. Es además la cifra con la que el
              municipio va a convivir todos los meses, así que era justo la que
              menos convenía cargar.

              El verde es el color con el que este producto lleva toda la
              página diciendo «confirmado» — y el mismo número dentro de él se
              lee como una decisión tomada y no como una carga. En panel tenue
              con la cifra en verde oscuro, no en verde pleno: el pleno está
              reservado al cierre, que es el único destino de la página, y
              gastarlo aquí le quitaría fuerza allí. */}
          <div className="prop-entra rounded-2xl p-7 border-2"
            style={{ backgroundColor: VERDE_PANEL, borderColor: VERDE }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: VERDE_TEXTO }}>
              Cada mes
            </p>
            <p className="mt-4 text-4xl font-bold tracking-tight" style={{ color: VERDE_TEXTO }}>
              $2.400.000
            </p>
            <p className="mt-2 text-sm font-semibold" style={{ color: MARCA }}>Operación de la plataforma</p>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
              Uso ilimitado para todas las secretarías, soporte, actualizaciones,
              alojamiento y respaldos. No se cobra aparte por usuario, por documento
              ni por almacenamiento.
            </p>
          </div>
        </AlEntrar>

        <p className="mt-8 text-[13px] leading-relaxed text-gray-500 max-w-2xl">
          El primer mes suma los dos conceptos; a partir del segundo, solo la
          mensualidad. El acompañamiento del primer ciclo mensual completo va
          incluido en la implementación.
        </p>
      </Acto>

      {/* ── El cierre ────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-8 py-24 sm:py-32" style={{ backgroundColor: VERDE }}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] max-w-2xl"
            style={{ color: VERDE_TINTA }}>
            Podemos empezar por una secretaría.
          </h2>
          <p className="mt-6 text-lg leading-relaxed max-w-xl" style={{ color: 'rgba(4,53,42,.78)' }}>
            Sin comprometer a todo el municipio desde el primer día. Cuando el primer
            ciclo mensual cierre bien, se extiende al resto.
          </p>

          <a
            href={enlaceWhatsApp(`Buen día. Escribo desde la Alcaldía Municipal de ${GOMEZ_PLATA.municipio} sobre la propuesta de Contratista Digital.`)}
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
