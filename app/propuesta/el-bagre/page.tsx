import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { LogoCD } from '@/components/Logo'
import { MARCA } from '@/lib/marca'
import { enlaceWhatsApp, ORIGEN_APP } from '@/lib/dominio'
import Revelar from '../Revelar'
import Contador from '../Contador'
import ProgresoScroll from '../ProgresoScroll'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

/**
 * Propuesta comercial para la Alcaldía de El Bagre.
 *
 * Vive en el ápice —contratistadigital.com/propuesta/el-bagre— y no en el
 * subdominio de la aplicación: el enlace se comparte con un secretario de
 * despacho, y `app.` lee como la herramienta interna de otro cliente.
 *
 * NO SE INDEXA. Es un documento dirigido a una alcaldía concreta, con su
 * nombre y su precio. Que apareciera en un buscador sería un problema
 * comercial —cualquier otro municipio vería la tarifa— y de discreción.
 *
 * ── Dos decisiones de fondo ───────────────────────────────────────────────
 *
 * EL DIAGNÓSTICO ACUSA, PERO ABSUELVE AL FINAL. Los seis «lo está haciendo
 * mal» son deliberadamente punzantes: despiertan más que una lista de
 * beneficios. Pero cierran con «ninguno es de las personas, son del método»,
 * porque un secretario que se siente juzgado deja de escuchar. Sin esa salida,
 * la sección jugaría en contra.
 *
 * LAS CIFRAS VAN AL FINAL. La prueba de que esto ya opera cierra la propuesta,
 * justo antes de la llamada a la acción, en vez de abrirla. La atribución al
 * municipio queda en una línea discreta: los números mandan, pero sin origen
 * valdrían mucho menos si alguien pregunta de dónde salen.
 */

export const metadata: Metadata = {
  title: 'Propuesta · Alcaldía de El Bagre — Contratista Digital',
  description: 'Gestión digital de contratos de prestación de servicios.',
  robots: { index: false, follow: false },
}

const VERDE = '#10b981'

/** El diagnóstico. Cuatro son de la alcaldía y dos del contratista, a propósito. */
const DIAGNOSTICO = [
  'Si le piden el expediente de un contrato y toca buscarlo en un arrume de documentos, lo está haciendo mal.',
  'Si no sabe cuántos contratistas tiene ni si están trabajando, lo está haciendo mal.',
  'Si a fin de mes sus contratistas están armando papeles en vez de trabajando, lo está haciendo mal.',
  'Si no tiene la alcaldía en la palma de la mano —en cualquier lugar, a cualquier hora—, lo está haciendo mal.',
  'Si errores de redacción y transcripción entorpecen el pago de su gente, lo está haciendo mal.',
  'Si un contratista tiene que llamar a preguntar por qué se retrasó su pago, lo está haciendo mal.',
]

const DOCUMENTOS = [
  ['Informe de actividades', 'Contratista'],
  ['Cuenta de cobro', 'Contratista'],
  ['Acta de supervisión', 'Supervisor'],
  ['Acta de pago', 'Secretaría'],
  ['Acta de terminación bilateral', 'Al cerrar el contrato'],
]

const NORMAS = [
  ['Decreto 1082 de 2015', 'Bloquea el pago sin informe y sin supervisión'],
  ['Ley 1150 de 2007, Art. 83', 'Acta de supervisión por cada periodo'],
  ['Decreto 1273 de 2018', 'No deja enviar sin planilla de seguridad social válida'],
  ['Integridad documental', 'Huella SHA-256 verificable por terceros'],
  ['Trazabilidad', 'Cada movimiento con fecha, hora y responsable'],
]

const CIFRAS: [number, string][] = [
  [122, 'contratos gestionados'],
  [508, 'periodos procesados'],
  [138, 'cuentas radicadas'],
  [184, 'históricos migrados'],
  [2966, 'evidencias cargadas'],
  [1066, 'movimientos trazados'],
]

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

/**
 * Tarjeta de rol.
 *
 * El icono sale del catálogo del proyecto y no de un emoji: los emojis los
 * dibuja cada sistema operativo a su manera —un 👔 en Android no se parece al
 * de un iPhone— y en un documento que se reenvía y se proyecta eso rompe la
 * identidad. Ver lib/iconos.ts.
 */
function Rol({ glifo, titulo, puntos }: { glifo: LucideIcon; titulo: string; puntos: string[] }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-6 h-full">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: '#F1F3F6' }}
      >
        <Icono glifo={glifo} tamano="lg" className="text-[#192031]" />
      </div>
      <h3 className="mt-4 font-semibold text-gray-900">{titulo}</h3>
      <ul className="mt-3 space-y-2.5">
        {puntos.map(p => (
          <li key={p} className="flex gap-2.5 text-sm text-gray-600 leading-relaxed">
            <span className="mt-2 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
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
      <ProgresoScroll color={VERDE} />

      {/* ── Portada ───────────────────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col justify-center px-6 py-20 text-white"
        style={{ backgroundColor: MARCA }}
      >
        <div className="max-w-3xl mx-auto w-full">
          <Revelar><LogoCD size={64} color="#FFFFFF" /></Revelar>

          <Revelar retraso={120}>
            <h1 className="mt-10 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08]">
              Que ningún contrato de El Bagre vuelva a quedarse sin expediente completo.
            </h1>
          </Revelar>

          <Revelar retraso={240}>
            <p className="mt-8 text-lg sm:text-xl text-white/70 leading-relaxed max-w-xl">
              Gestión digital de los contratos de prestación de servicios:
              los documentos, la supervisión, el archivo y la verificación.
            </p>
          </Revelar>

          <Revelar retraso={400}>
            <div className="mt-16 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marca/escudo-el-bagre.png"
                alt="Escudo del municipio de El Bagre"
                className="w-9 h-9 object-contain"
              />
              <p className="text-xs text-white/40 leading-snug">
                Propuesta preparada para la<br />Alcaldía Municipal de El Bagre
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

        <div className="mt-12 space-y-px rounded-2xl overflow-hidden border border-gray-100">
          {DIAGNOSTICO.map((t, i) => (
            <Revelar key={t} retraso={i * 80} desde="izquierda">
              <div className="flex gap-5 bg-gray-50/60 px-6 py-6">
                <span className="text-2xl font-bold tabular-nums text-gray-300 shrink-0 leading-none pt-0.5">
                  {i + 1}
                </span>
                <p className="text-gray-800 leading-relaxed">{t}</p>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={560}>
          <p className="mt-10 text-lg font-semibold text-gray-900">
            Ninguno de estos problemas es de las personas. Todos son del método.
          </p>
        </Revelar>
      </Seccion>

      {/* ── Qué es ────────────────────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>La solución</Etiqueta>
        </Revelar>
        <Revelar retraso={120}>
          <p className="text-xl sm:text-2xl leading-relaxed text-white/90">
            <span className="font-semibold text-white">Contratista Digital automatiza</span> el
            ciclo completo de los contratos de prestación de servicios de un municipio.
            El contratista carga sus evidencias desde el celular y el sistema genera
            automáticamente su informe de actividades, su cuenta de cobro y las actas
            de supervisión y de pago —sin Word, sin errores de transcripción, sin
            devoluciones—. El supervisor revisa y aprueba desde donde esté; la
            secretaría radica y descarga el paquete completo del mes en un clic.
            Cada documento sale con código QR y huella digital verificable, de modo
            que cualquier ente de control puede comprobar su autenticidad sin pedirle
            nada a la alcaldía. Todo queda en un solo lugar, trazable y listo para
            cargar a SECOP II.
          </p>
        </Revelar>
      </Seccion>

      {/* ── Cinco documentos ──────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Automatización</Etiqueta>
          <Titulo>Cinco documentos, generados solos</Titulo>
          <p className="mt-6 text-gray-600 leading-relaxed">
            El contratista solo registra sus actividades y sube sus evidencias.
            El sistema escribe todo lo demás.
          </p>
        </Revelar>

        <div className="mt-10 space-y-px rounded-2xl overflow-hidden border border-gray-100">
          {DOCUMENTOS.map(([d, q], i) => (
            <Revelar key={d} retraso={i * 80} desde="izquierda">
              <div className="flex items-center justify-between gap-4 bg-gray-50/60 px-6 py-5">
                <span className="font-medium text-gray-900">{d}</span>
                <span className="text-sm text-gray-500 text-right shrink-0">{q}</span>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={480}>
          <p className="mt-8 text-lg font-semibold text-gray-900">
            Cero Word. Cero transcripción. Cero devoluciones por un valor en letras mal escrito.
          </p>
        </Revelar>
      </Seccion>

      {/* ── La alcaldía en la palma de la mano ────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Visibilidad</Etiqueta>
          <Titulo oscura>La alcaldía en la palma de la mano</Titulo>
          <p className="mt-6 text-white/70 leading-relaxed">
            Cuántos contratistas tiene, qué está haciendo cada uno y en qué punto
            va su pago. Desde el celular, en cualquier lugar, a cualquier hora.
          </p>
        </Revelar>

        <Revelar retraso={160}>
          <div className="mt-10 rounded-2xl bg-white/[0.06] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Estado de todos los periodos, en vivo
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Borrador', 'Enviado', 'En revisión', 'Aprobado', 'Radicado'].map((e, i) => (
                <div key={e} className="flex items-center gap-2">
                  <span className="rounded-lg bg-white/10 px-3.5 py-2 text-sm">{e}</span>
                  {i < 4 && <span className="text-white/25">→</span>}
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-white/60 leading-relaxed">
              Más el valor total bajo gestión, el porcentaje de cumplimiento y qué
              está esperando su revisión en este momento.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Control antifraude ────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Control</Etiqueta>
          <Titulo>El sistema detecta evidencias repetidas</Titulo>
        </Revelar>

        <Revelar retraso={140}>
          <div className="mt-10 rounded-2xl border border-gray-100 p-6 sm:p-8">
            <p className="text-lg font-semibold text-gray-900">No solo el archivo idéntico.</p>
            <p className="mt-3 text-gray-600 leading-relaxed">
              Detecta la misma imagen aunque la hayan recortado, comprimido o vuelto
              a fotografiar de la pantalla. Si una evidencia ya se usó en otro periodo
              del mismo contrato, el supervisor lo sabe antes de aprobar.
            </p>
          </div>
        </Revelar>

        <Revelar retraso={260}>
          <div className="mt-4 rounded-2xl border border-gray-100 p-6 sm:p-8">
            <p className="text-lg font-semibold text-gray-900">La seguridad social es bloqueante.</p>
            <p className="mt-3 text-gray-600 leading-relaxed">
              No deja enviar el informe sin planilla válida, y avisa si la misma
              planilla se está reutilizando en más periodos de los que cubre.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Una sola plataforma + roles ───────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>El día a día</Etiqueta>
          <Titulo>Una sola plataforma. Se acabaron las entradas paralelas.</Titulo>
          <p className="mt-6 text-gray-600 leading-relaxed">
            Hoy un informe puede llegar por correo, por WhatsApp, impreso, en Drive o
            en una memoria USB. Cinco puertas de entrada para el mismo documento
            significan cinco lugares donde buscarlo después.{' '}
            <span className="font-semibold text-gray-900">
              Contratista Digital cierra las cinco y deja una.
            </span>
          </p>
        </Revelar>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          <Revelar retraso={100}>
            <Rol
              glifo={Iconos.navegacion.contratistas}
              titulo="El contratista"
              puntos={[
                'Carga sus evidencias desde el celular, donde esté',
                'El sistema genera su informe y su cuenta de cobro — se acabó el Word y sus malentendidos',
                'Recibe avisos automáticos de cada cambio: enviado, aprobado, devuelto',
              ]}
            />
          </Revelar>
          <Revelar retraso={200}>
            <Rol
              glifo={Iconos.estado.verificado}
              titulo="El supervisor"
              puntos={[
                'Revisa evidencias y aprueba pagos desde el móvil, sin abrir un computador',
                'Sigue la trazabilidad de cientos de contratos desde el teléfono',
                'El sistema le avisa si una evidencia ya fue usada antes',
              ]}
            />
          </Revelar>
          <Revelar retraso={300}>
            <Rol
              glifo={Iconos.navegacion.municipio}
              titulo="La secretaría"
              puntos={[
                'Radica en lote todas las cuentas aprobadas del mes, con numeración consecutiva automática',
                'Descarga el paquete completo del mes en un clic',
                'Cada periodo queda listo para cargar a SECOP II',
              ]}
            />
          </Revelar>
        </div>

        <Revelar retraso={440}>
          <div className="mt-10 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: '#F6F7F9' }}>
            <h3 className="font-semibold text-gray-900">Automatización de punta a punta</h3>
            <p className="mt-2 text-gray-600 leading-relaxed">
              El contratista sube evidencias. Todo lo demás —documentos,
              notificaciones, verificación, expediente— lo hace el sistema.
            </p>
          </div>
        </Revelar>
      </Seccion>

      {/* ── Recordatorios ─────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Seguimiento</Etiqueta>
          <Titulo>El sistema persigue, no ustedes</Titulo>
        </Revelar>

        <div className="mt-10 space-y-3">
          {[
            ['Día 25', 'Aviso a quien tiene el informe en borrador'],
            ['Día 28', 'Recordatorio urgente'],
            ['Día 2', 'Aviso de plazo vencido'],
            ['Cada 5 días', 'Cuentas aprobadas sin radicar → aviso a secretaría'],
            ['60 y 30 días antes', 'Contratos por vencer → aviso a supervisión y administración'],
          ].map(([c, t], i) => (
            <Revelar key={c} retraso={i * 90}>
              <div className="flex gap-5 items-start">
                <span
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white w-36 text-center"
                  style={{ backgroundColor: MARCA }}
                >
                  {c}
                </span>
                <span className="text-gray-700 pt-1.5 text-sm">{t}</span>
              </div>
            </Revelar>
          ))}
        </div>
      </Seccion>

      {/* ── Verificación QR ───────────────────────────────────────── */}
      <Seccion oscura>
        <Revelar>
          <Etiqueta oscura>Verificación</Etiqueta>
          <Titulo oscura>Cualquiera comprueba la autenticidad. Sin pedirle nada a la alcaldía.</Titulo>
        </Revelar>

        <div className="mt-12 flex flex-col sm:flex-row items-center gap-10">
          <Revelar retraso={150} desde="zoom">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="Código QR de verificación de documentos"
              className="w-44 h-44 rounded-2xl bg-white p-2 shrink-0"
            />
          </Revelar>
          <Revelar retraso={280} className="flex-1">
            <p className="text-white/70 leading-relaxed">
              Cada documento sale con un código único y una huella digital SHA-256.
              Escanee este código con la cámara de su celular: así verifica un
              documento un auditor, un banco o un ente de control.
            </p>
          </Revelar>
        </div>
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
            <Revelar key={norma} retraso={i * 80} desde="izquierda">
              <div className="grid sm:grid-cols-[1fr_1.4fr] gap-1 sm:gap-6 bg-gray-50/60 px-6 py-5">
                <span className="font-semibold text-gray-900 text-sm">{norma}</span>
                <span className="text-sm text-gray-600">{que}</span>
              </div>
            </Revelar>
          ))}
        </div>
      </Seccion>

      {/* ── Inversión ─────────────────────────────────────────────── */}
      <Seccion>
        <Revelar>
          <Etiqueta>Inversión</Etiqueta>
        </Revelar>

        <Revelar retraso={100} desde="zoom">
          <div className="mt-4 text-center py-10">
            <p className="text-5xl sm:text-6xl font-bold tracking-tight text-gray-900">
              $4.990.000
            </p>
            <p className="mt-3 text-lg text-gray-500">mensuales</p>
            <p className="mt-1 text-sm text-gray-400">Implementación a convenir</p>
          </div>
        </Revelar>

        <Revelar retraso={240}>
          <div className="rounded-2xl border border-gray-100 p-6">
            <p className="text-sm font-semibold text-gray-900">La mensualidad incluye</p>
            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm text-gray-600">
              {[
                'La plataforma completa, sin límite de usuarios',
                'Todas las secretarías y dependencias',
                'Soporte durante toda la vigencia',
                'Actualizaciones sin costo adicional',
                'Alojamiento y respaldo de la información',
                'Verificación pública de documentos',
              ].map(t => (
                <div key={t} className="flex gap-2.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </Revelar>

        {/* La cuenta la ata quien tenga que atarla. Sin cifras y sin comparar. */}
        <Revelar retraso={360}>
          <p className="mt-8 text-xs text-gray-400 leading-relaxed">
            Para dimensionar: un proceso de responsabilidad fiscal se resuelve con
            el patrimonio del funcionario, no con el presupuesto del municipio.
          </p>
        </Revelar>
      </Seccion>

      {/* ── Puesta en marcha ──────────────────────────────────────── */}
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
              Sin comprometer todo el municipio desde el primer día. Cuando el primer
              ciclo cierre bien, se extiende al resto.
            </p>
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
              <div className="bg-white/[0.06] p-6 h-full">
                <Contador valor={n} className="block text-3xl sm:text-4xl font-bold tracking-tight" />
                <p className="mt-1 text-sm text-white/50 leading-snug">{t}</p>
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
            <p className="text-xs text-white/40">
              Operación real del municipio de Fredonia, Antioquia.
            </p>
          </div>
        </Revelar>

        <Revelar retraso={620}>
          <div className="mt-10 rounded-2xl bg-white/[0.06] p-6">
            <p className="text-white/70 leading-relaxed">
              <span className="font-semibold text-white">Su historial no se queda afuera.</span>{' '}
              Esos 184 periodos históricos son información anterior que entró al
              sistema. No se empieza de cero.
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
              <span className="w-2 h-2 rounded-full latido" style={{ backgroundColor: VERDE }} />
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
