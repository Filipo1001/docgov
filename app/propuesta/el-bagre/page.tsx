import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import { enlaceWhatsApp, ORIGEN_APP } from '@/lib/dominio'
import Revelar from '../Revelar'

/**
 * Propuesta comercial para la Alcaldía de El Bagre.
 *
 * Vive en el ápice —contratistadigital.com/propuesta/el-bagre— y no en el
 * subdominio de la aplicación: el enlace se comparte con un secretario de
 * despacho, y `app.` lee como la herramienta interna de otro cliente.
 *
 * NO SE INDEXA. Es un documento dirigido a una alcaldía concreta, con su
 * nombre y su precio. Que aparezca en un buscador sería un problema comercial
 * —cualquier otro municipio vería la tarifa— y de discreción.
 *
 * EL PRECIO SE PRESENTA POR CONTRATISTA, no en total. El número de contratistas
 * de El Bagre es aproximado, así que un total impreso podría estar mal y además
 * invita a negociar contra una cifra grande. Por contratista, la propuesta
 * escala sola y la cifra que se ve es pequeña.
 */

export const metadata: Metadata = {
  title: 'Propuesta · Alcaldía de El Bagre — Contratista Digital',
  description: 'Gestión digital de contratos de prestación de servicios.',
  robots: { index: false, follow: false },
}

const VERDE = '#10b981'

/** Datos verificables de la operación en Fredonia. */
const CIFRAS_FREDONIA = [
  { n: '122', t: 'contratos gestionados' },
  { n: '508', t: 'periodos procesados' },
  { n: '138', t: 'cuentas radicadas' },
  { n: '184', t: 'históricos migrados' },
  { n: '2.966', t: 'evidencias cargadas' },
  { n: '1.066', t: 'movimientos trazados' },
]

const DOCUMENTOS = [
  { d: 'Informe de actividades', q: 'Contratista' },
  { d: 'Cuenta de cobro', q: 'Contratista' },
  { d: 'Acta de supervisión', q: 'Supervisor' },
  { d: 'Acta de pago', q: 'Secretaría' },
  { d: 'Acta de terminación bilateral', q: 'Al cerrar el contrato' },
]

const NORMAS = [
  ['Decreto 1082 de 2015', 'Bloquea el pago sin informe y sin supervisión'],
  ['Ley 1150 de 2007, Art. 83', 'Acta de supervisión por cada periodo'],
  ['Decreto 1273 de 2018', 'No deja enviar sin planilla de seguridad social válida'],
  ['Integridad documental', 'Huella SHA-256 verificable por terceros'],
  ['Trazabilidad', 'Cada movimiento con fecha, hora y responsable'],
]

// ── Piezas ──────────────────────────────────────────────────────────────────

function Seccion({
  children,
  oscura = false,
  id,
}: {
  children: React.ReactNode
  oscura?: boolean
  id?: string
}) {
  return (
    <section
      id={id}
      className={`px-6 py-20 sm:py-28 ${oscura ? 'text-white' : 'bg-white text-gray-900'}`}
      style={oscura ? { backgroundColor: MARCA } : undefined}
    >
      <div className="max-w-3xl mx-auto">{children}</div>
    </section>
  )
}

function Etiqueta({ children, oscura = false }: { children: React.ReactNode; oscura?: boolean }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] mb-4 ${oscura ? 'text-white/40' : 'text-gray-400'}`}>
      {children}
    </p>
  )
}

function Titulo({ children, oscura = false }: { children: React.ReactNode; oscura?: boolean }) {
  return (
    <h2 className={`text-3xl sm:text-4xl font-bold tracking-tight leading-[1.15] ${oscura ? 'text-white' : 'text-gray-900'}`}>
      {children}
    </h2>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────

export default async function PropuestaElBagre() {
  // QR real, generado en el servidor: apunta al verificador público. En la
  // reunión se escanea desde la proyección y valida de verdad — es el momento
  // que más convence, y un QR de adorno lo arruinaría.
  const qr = await QRCode.toDataURL(`${ORIGEN_APP}/verificar`, {
    margin: 1,
    width: 480,
    color: { dark: MARCA, light: '#FFFFFF' },
  })

  return (
    <main className="bg-white">

      {/* ── Portada ───────────────────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col justify-center px-6 py-20 text-white"
        style={{ backgroundColor: MARCA }}
      >
        <div className="max-w-3xl mx-auto w-full">
          <Revelar>
            <LogoCD size={64} color="#FFFFFF" />
          </Revelar>

          <Revelar retraso={120}>
            <h1 className="mt-10 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08]">
              Que ningún contrato de El Bagre vuelva a quedarse sin expediente completo.
            </h1>
          </Revelar>

          <Revelar retraso={240}>
            <p className="mt-8 text-lg sm:text-xl text-white/70 leading-relaxed max-w-xl">
              Contratista Digital automatiza el ciclo completo de los contratos de
              prestación de servicios: los documentos, la supervisión, el archivo
              y la verificación.
            </p>
          </Revelar>

          <Revelar retraso={360}>
            <div className="mt-12 inline-flex items-center gap-3 rounded-full border border-white/20 px-5 py-2.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VERDE }} />
              <span className="text-sm text-white/80">
                Funcionando hoy en el municipio de Fredonia, Antioquia
              </span>
            </div>
          </Revelar>

          <Revelar retraso={480}>
            <p className="mt-16 text-xs text-white/30">
              Propuesta preparada para la Alcaldía Municipal de El Bagre
            </p>
          </Revelar>
        </div>
      </section>

      {/* ── La pregunta ───────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>La pregunta</Etiqueta>
          <p className="text-2xl sm:text-4xl font-bold tracking-tight leading-[1.2] text-gray-900">
            ¿Cuánto tardaría hoy su despacho en entregar el expediente completo
            de un contrato de hace ocho meses?
          </p>
          <p className="mt-8 text-gray-500 leading-relaxed">
            Y cuando lo arme: ¿estarán todos los informes, todas las actas de
            supervisión, todas las planillas?
          </p>
        </Revelar>
      </Seccion>

      {/* ── El problema ───────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>El problema</Etiqueta>
          <Titulo>Dos escenas que usted ya conoce</Titulo>
        </Revelar>

        <div className="mt-12 space-y-8">
          <Revelar retraso={100}>
            <div className="border-l-2 border-gray-200 pl-6">
              <h3 className="font-semibold text-gray-900">La cuenta de cobro que vuelve</h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                Llega en Word. El valor en letras dice «un millón doscientos mil»
                pero la cifra dice un millón doscientos cincuenta. Se devuelve. Son
                dos minutos de error y varios días de retraso en el pago de alguien
                que vive de ese ingreso. Multiplíquelo por todos sus contratistas y
                por doce meses.
              </p>
            </div>
          </Revelar>

          <Revelar retraso={200}>
            <div className="border-l-2 border-gray-200 pl-6">
              <h3 className="font-semibold text-gray-900">El expediente que se arma a mano</h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                El informe estaba en un correo, las evidencias en un WhatsApp, la
                planilla impresa en una carpeta, y el acta la firmó alguien que ya
                no trabaja aquí.
              </p>
            </div>
          </Revelar>

          <Revelar retraso={300}>
            <p className="text-lg font-semibold text-gray-900 pt-4">
              Ninguno de los dos problemas es de las personas. Son del método.
            </p>
          </Revelar>
        </div>
      </Seccion>

      {/* ── Los cinco documentos ──────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Lo que hace</Etiqueta>
          <Titulo oscura>Cinco documentos, generados solos</Titulo>
          <p className="mt-6 text-white/70 leading-relaxed">
            El contratista solo registra sus actividades y sube sus evidencias
            desde el celular. El sistema escribe todo lo demás.
          </p>
        </Revelar>

        <div className="mt-12 space-y-px rounded-2xl overflow-hidden">
          {DOCUMENTOS.map((d, i) => (
            <Revelar key={d.d} retraso={i * 90}>
              <div className="flex items-center justify-between gap-4 bg-white/[0.06] px-6 py-5">
                <span className="font-medium">{d.d}</span>
                <span className="text-sm text-white/50 text-right shrink-0">{d.q}</span>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={500}>
          <p className="mt-10 text-xl font-semibold leading-snug">
            Cero Word. Cero transcripción. Cero devoluciones por un valor en
            letras mal escrito.
          </p>
        </Revelar>
      </Seccion>

      {/* ── La cuenta de cobro ────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>En detalle</Etiqueta>
          <Titulo>La cuenta de cobro, sin errores posibles</Titulo>
        </Revelar>

        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {[
            ['El valor en letras', 'Lo escribe el sistema, no una persona'],
            ['Las fechas', 'Salen del contrato'],
            ['El número de contrato', 'No se digita'],
            ['Los datos bancarios', 'Vienen del expediente del contratista'],
          ].map(([t, d], i) => (
            <Revelar key={t} retraso={i * 90}>
              <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5 h-full">
                <p className="font-semibold text-gray-900">{t}</p>
                <p className="mt-1 text-sm text-gray-500">{d}</p>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={400}>
          <p className="mt-8 text-lg font-semibold text-gray-900">
            La categoría de error más común simplemente deja de existir.
          </p>
          <p className="mt-4 text-gray-600 leading-relaxed">
            Y para quien está obligado a facturar electrónicamente, la factura
            sustituye automáticamente a la cuenta de cobro — sin que nadie tenga
            que acordarse de la excepción.
          </p>
        </Revelar>
      </Seccion>

      {/* ── Expediente y otrosíes ─────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>El contrato completo</Etiqueta>
          <Titulo>No solo los informes del mes</Titulo>
        </Revelar>

        <Revelar retraso={120}>
          <div className="mt-10 flex flex-wrap gap-2">
            {['Contrato firmado', 'CDP', 'RP', 'RUT', 'Certificación bancaria', 'Póliza', 'Otros'].map(d => (
              <span key={d} className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700">
                {d}
              </span>
            ))}
          </div>
        </Revelar>

        <Revelar retraso={220}>
          <p className="mt-8 text-gray-600 leading-relaxed">
            Y las obligaciones contractuales cargadas una sola vez, contra las que
            se registra cada actividad del contratista.
          </p>
        </Revelar>

        <Revelar retraso={320}>
          <div className="mt-10 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: '#F6F7F9' }}>
            <h3 className="font-semibold text-gray-900">El contrato cambia y el sistema lo sabe</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Adición', 'Prórroga', 'Modificatorio', 'Aclaratorio'].map(t => (
                <span key={t} className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-sm text-gray-700">
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-gray-600 leading-relaxed">
              Los documentos siguientes se generan con la información vigente, y el
              acta de terminación cita los otrosíes que correspondan.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Control antifraude ────────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Control</Etiqueta>
          <Titulo oscura>El sistema detecta evidencias repetidas</Titulo>
          <p className="mt-6 text-white/70 leading-relaxed">
            Si una fotografía ya se usó en otro periodo del mismo contrato, el
            supervisor lo sabe antes de aprobar.
          </p>
        </Revelar>

        <Revelar retraso={150}>
          <div className="mt-10 rounded-2xl bg-white/[0.06] p-6 sm:p-8">
            <p className="text-lg font-semibold leading-snug">
              No solo el archivo idéntico.
            </p>
            <p className="mt-3 text-white/70 leading-relaxed">
              Detecta la misma imagen aunque la hayan recortado, comprimido o
              vuelto a fotografiar de la pantalla.
            </p>
          </div>
        </Revelar>

        <Revelar retraso={280}>
          <div className="mt-6 rounded-2xl bg-white/[0.06] p-6 sm:p-8">
            <p className="text-lg font-semibold leading-snug">
              Y la seguridad social es bloqueante.
            </p>
            <p className="mt-3 text-white/70 leading-relaxed">
              No deja enviar el informe sin planilla válida, y avisa si la misma
              planilla se está reutilizando en más periodos de los que cubre.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Verificación QR ───────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Verificación</Etiqueta>
          <Titulo>Cualquiera comprueba la autenticidad. Sin pedirle nada a la alcaldía.</Titulo>
        </Revelar>

        <div className="mt-12 flex flex-col sm:flex-row items-center gap-10">
          <Revelar retraso={150}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="Código QR de verificación de documentos"
              className="w-44 h-44 rounded-2xl border border-gray-200 shrink-0"
            />
          </Revelar>

          <Revelar retraso={280} className="flex-1">
            <p className="text-gray-600 leading-relaxed">
              Cada documento sale con un código único y una huella digital
              SHA-256. Escanee este código con la cámara de su celular: así
              verifica un documento un auditor, un banco o un ente de control.
            </p>
            <p className="mt-6 text-3xl font-bold text-gray-900">251</p>
            <p className="text-sm text-gray-500">documentos ya emitidos con verificación</p>
          </Revelar>
        </div>
      </Seccion>

      {/* ── Fredonia ──────────────────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Caso de éxito</Etiqueta>
          <Titulo oscura>Municipio de Fredonia, Antioquia</Titulo>
        </Revelar>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-px rounded-2xl overflow-hidden">
          {CIFRAS_FREDONIA.map((c, i) => (
            <Revelar key={c.t} retraso={i * 80}>
              <div className="bg-white/[0.06] p-6 h-full">
                <p className="text-3xl sm:text-4xl font-bold tracking-tight">{c.n}</p>
                <p className="mt-1 text-sm text-white/50 leading-snug">{c.t}</p>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={500}>
          <p className="mt-10 text-xl font-semibold">
            No es un piloto. Es la operación diaria de un municipio antioqueño.
          </p>
        </Revelar>

        <Revelar retraso={600}>
          <div className="mt-8 rounded-2xl bg-white/[0.06] p-6">
            <p className="text-white/70 leading-relaxed">
              <span className="font-semibold text-white">Su historial no se queda afuera.</span>{' '}
              En Fredonia se migraron 184 periodos históricos. Lo que ya tienen
              entra al sistema: no empiezan de cero.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Por rol ───────────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>El día a día</Etiqueta>
          <Titulo>Cada quien ve lo suyo</Titulo>
        </Revelar>

        <div className="mt-12 space-y-4">
          {[
            ['Contratista', 'Carga sus evidencias desde el celular. Sus cinco documentos se generan solos. Un asistente de redacción le corrige ortografía y tildes antes de enviar.'],
            ['Supervisor', 'Revisa y aprueba desde el móvil, sin abrir un computador. Ve la evidencia al lado de cada obligación, y el sistema le avisa de imágenes repetidas.'],
            ['Asesor jurídico', 'Revisión previa por dependencia, antes de que el informe llegue a secretaría.'],
            ['Secretaría', 'Radica en lote todas las cuentas del mes con numeración consecutiva automática, y descarga el paquete completo en un clic.'],
            ['Contratación', 'Crea el contrato y la cuenta del contratista en un solo paso.'],
          ].map(([rol, texto], i) => (
            <Revelar key={rol} retraso={i * 90}>
              <div className="rounded-2xl border border-gray-100 p-6">
                <h3 className="font-semibold text-gray-900">{rol}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed">{texto}</p>
              </div>
            </Revelar>
          ))}
        </div>
      </Seccion>

      {/* ── Una sola plataforma + recordatorios ───────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Orden</Etiqueta>
          <Titulo>Una sola puerta de entrada</Titulo>
          <p className="mt-6 text-gray-600 leading-relaxed">
            Hoy un informe puede llegar por correo, por WhatsApp, impreso, en
            Drive o en una memoria USB. Cinco puertas de entrada significan cinco
            lugares donde buscarlo después.
          </p>
        </Revelar>

        <Revelar retraso={180}>
          <div className="mt-10 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: '#F6F7F9' }}>
            <h3 className="font-semibold text-gray-900">Y el sistema persigue, no ustedes</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-gray-600">
              {[
                'Día 25 — aviso a quien tiene el informe en borrador',
                'Día 28 — recordatorio urgente',
                'Día 2 — aviso de plazo vencido',
                'Cuentas aprobadas sin radicar hace más de 5 días → aviso a secretaría',
                'Contratos que vencen en 60 y 30 días → aviso a supervisor y administración',
              ].map(t => (
                <li key={t} className="flex gap-3">
                  <span className="mt-2 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </Revelar>

        <Revelar retraso={300}>
          <div className="mt-6 rounded-2xl border border-gray-100 p-6 sm:p-8">
            <h3 className="font-semibold text-gray-900">Listo para SECOP II</h3>
            <p className="mt-2 text-gray-600 leading-relaxed">
              Cada periodo genera su paquete descargable —informe, cuenta de cobro
              y planilla, con los nombres correctos— listo para cargar. Y la
              descarga masiva del mes completo para el archivo.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Cumplimiento ──────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Cumplimiento</Etiqueta>
          <Titulo>Control, no promesas</Titulo>
          <p className="mt-6 text-gray-600 leading-relaxed">
            Todo lo de esta tabla se puede demostrar en vivo, hoy.
          </p>
        </Revelar>

        <div className="mt-10 space-y-px rounded-2xl overflow-hidden border border-gray-100">
          {NORMAS.map(([norma, que], i) => (
            <Revelar key={norma} retraso={i * 80}>
              <div className="grid sm:grid-cols-[1fr_1.4fr] gap-1 sm:gap-6 bg-gray-50/60 px-6 py-5">
                <span className="font-semibold text-gray-900 text-sm">{norma}</span>
                <span className="text-sm text-gray-600">{que}</span>
              </div>
            </Revelar>
          ))}
        </div>
      </Seccion>

      {/* ── El riesgo ─────────────────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Lo que de verdad está en juego</Etiqueta>
          <Titulo oscura>Un expediente incompleto es un hallazgo</Titulo>
        </Revelar>

        <Revelar retraso={150}>
          <p className="mt-8 text-lg text-white/80 leading-relaxed">
            Un proceso de responsabilidad fiscal puede terminar en que el
            funcionario reponga el valor del contrato{' '}
            <span className="text-white font-semibold">con su propio patrimonio</span>,
            más sanción disciplinaria e inhabilidad.
          </p>
        </Revelar>

        <Revelar retraso={300}>
          <div className="mt-10 border-l-2 pl-6" style={{ borderColor: VERDE }}>
            <p className="text-xl sm:text-2xl font-semibold leading-snug">
              Un solo contrato de treinta millones sin soporte completo expone al
              supervisor a más de lo que cuesta la plataforma en un año.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Inversión ─────────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Inversión</Etiqueta>
        </Revelar>

        <Revelar retraso={100}>
          <div className="mt-4 text-center py-10">
            <p className="text-6xl sm:text-7xl font-bold tracking-tight text-gray-900">
              $23.800
            </p>
            <p className="mt-3 text-lg text-gray-500">por contratista, al mes</p>
          </div>
        </Revelar>

        <Revelar retraso={220}>
          <p className="text-center text-lg text-gray-700 leading-relaxed max-w-xl mx-auto">
            Menos de lo que cuesta <span className="font-semibold">una hora</span> de
            un profesional. Con sus cinco documentos generados, verificables y
            archivados.
          </p>
        </Revelar>

        <Revelar retraso={340}>
          <div className="mt-12 rounded-2xl border border-gray-100 p-6">
            <p className="text-sm font-semibold text-gray-900">Incluye</p>
            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm text-gray-600">
              {[
                'Implementación y puesta en marcha',
                'Migración de su historial',
                'Capacitación a todos los roles',
                'Soporte durante toda la vigencia',
                'Actualizaciones sin costo',
                'Alojamiento y respaldo',
              ].map(t => (
                <div key={t} className="flex gap-2.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Cómo empezamos ────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Puesta en marcha</Etiqueta>
          <Titulo>Cuatro semanas</Titulo>
        </Revelar>

        <div className="mt-12 space-y-4">
          {[
            ['Semana 1', 'Configuración del municipio, dependencias y usuarios'],
            ['Semana 2', 'Carga de contratos vigentes y migración del historial'],
            ['Semana 3', 'Capacitación por rol: contratistas, supervisores y secretaría'],
            ['Semana 4', 'Primer ciclo completo acompañado, de principio a fin'],
          ].map(([s, t], i) => (
            <Revelar key={s} retraso={i * 100}>
              <div className="flex gap-5 items-start">
                <span
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: MARCA }}
                >
                  {s}
                </span>
                <span className="text-gray-700 pt-1.5">{t}</span>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={500}>
          <div className="mt-12 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: '#F6F7F9' }}>
            <p className="font-semibold text-gray-900">Podemos empezar con una sola secretaría</p>
            <p className="mt-2 text-gray-600 leading-relaxed">
              Sin comprometer todo el municipio desde el primer día. Cuando el
              primer ciclo cierre bien, se extiende al resto.
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
              Hablemos de cómo se vería el primer ciclo en El Bagre.
            </p>
          </Revelar>

          <Revelar retraso={200}>
            <a
              href={enlaceWhatsApp('Buen día. Soy de la Alcaldía de El Bagre y quisiera conocer más sobre Contratista Digital.')}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex items-center gap-3 rounded-xl bg-white px-7 py-4 font-semibold transition-transform hover:scale-[1.02]"
              style={{ color: MARCA }}
            >
              Escribir por WhatsApp
            </a>
          </Revelar>

          <Revelar retraso={320}>
            <p className="mt-16 text-xs text-white/30">
              Contratista Digital · Propuesta para la Alcaldía Municipal de El Bagre
            </p>
          </Revelar>
        </div>
      </section>
    </main>
  )
}
