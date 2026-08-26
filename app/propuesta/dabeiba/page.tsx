import fs from 'node:fs'
import path from 'node:path'
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
 * Propuesta comercial para la Alcaldía de Dabeiba.
 *
 * Vive en el ápice —contratistadigital.com/propuesta/dabeiba— y no en el
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
 *
 * ── Diferencias con la propuesta de El Bagre ─────────────────────────────
 *
 * CIFRAS AL DÍA. Las de El Bagre se consultaron a producción a mediados de
 * agosto y ya envejecieron: los periodos pasaron de 508 a 625 y las evidencias
 * de 2.966 a 3.853. Aquí van las del 26 de agosto de 2026. Una cifra vieja en
 * una propuesta comercial vale menos que no ponerla, porque quien pregunte de
 * dónde sale se encuentra con otro número.
 *
 * ESPACIADO PENSADO PARA EL TELÉFONO. La propuesta se abre desde un enlace que
 * alguien reenvía por WhatsApp, así que la primera lectura casi siempre es en
 * móvil. Las secciones respiran menos en pantalla pequeña (py-14 en vez de
 * py-20) y las etiquetas de fecha dejan de competir por el ancho: apiladas
 * abajo, en línea a partir de `sm`.
 *
 * EL ESCUDO ES OPCIONAL. Se dibuja solo si el archivo existe. Un escudo roto
 * en la portada de una propuesta es peor que no ponerlo, y así la página se
 * puede publicar antes de tener la imagen definitiva del municipio.
 */

export const metadata: Metadata = {
  title: 'Propuesta · Alcaldía de Dabeiba — Contratista Digital',
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
  'Si le devuelven cuentas de cobro por errores de redacción o de transcripción, lo está haciendo mal.',
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

/** Consultadas a producción el 26 de agosto de 2026. Reverificar antes de reusar. */
const CIFRAS: [number, string][] = [
  [125, 'contratos gestionados'],
  [625, 'periodos procesados'],
  [269, 'documentos verificables'],
  [238, 'históricos migrados'],
  [3853, 'evidencias cargadas'],
  [1232, 'movimientos trazados'],
]

/** El escudo del municipio, si ya se cargó. Ver la nota de cabecera. */
const ESCUDO = '/marca/escudo-dabeiba.png'
function hayEscudo(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'marca', 'escudo-dabeiba.png'))
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
      className={`px-6 py-14 sm:py-24 lg:py-28 ${oscura ? 'text-white' : 'bg-white text-gray-900'}`}
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

export default async function PropuestaDabeiba() {
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
    <main className="bg-white">
      <ProgresoScroll color={VERDE} />

      {/* ── Portada ───────────────────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col justify-center px-6 py-16 sm:py-20 text-white"
        style={{ backgroundColor: MARCA }}
      >
        <div className="max-w-3xl mx-auto w-full">
          <Revelar><LogoCD size={64} color="#FFFFFF" /></Revelar>

          <Revelar retraso={120}>
            <h1 className="mt-10 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08]">
              Que ningún contrato de Dabeiba vuelva a quedarse sin expediente completo.
            </h1>
          </Revelar>

          <Revelar retraso={240}>
            <p className="mt-8 text-lg sm:text-xl text-white/70 leading-relaxed max-w-xl">
              Gestión digital de los contratos de prestación de servicios:
              los documentos, la supervisión, el archivo y la verificación.
            </p>
          </Revelar>

          <Revelar retraso={400}>
            <div className="mt-12 sm:mt-16 flex items-center gap-3">
              {escudo && (
                /* El de El Bagre va a 36 px porque su original mide 48×48 y
                   ampliarlo se pixela. Este llega a 200×200 desde el sitio
                   oficial del municipio, así que aguanta 48 px y a ese tamaño
                   sí se distinguen los cuarteles. Sigue siendo un sello
                   discreto, que es el uso que le corresponde. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ESCUDO}
                  alt="Escudo del municipio de Dabeiba"
                  className="w-12 h-12 object-contain"
                />
              )}
              <p className="text-xs text-white/40 leading-snug">
                Propuesta preparada para la<br />Alcaldía Municipal de Dabeiba
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
            secretaría descarga el paquete completo del mes en un clic, con cada
            cuenta lista para pago.
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
            Cero Word. Cero transcripción. Cero cuentas de cobro devueltas por un valor en letras mal escrito.
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
                'Cierra en lote todas las cuentas aprobadas del mes; si el municipio numera, la numeración consecutiva es automática',
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
            ['Cada 5 días', 'Cuentas aprobadas sin cerrar → aviso a secretaría'],
            ['60 y 30 días antes', 'Contratos por vencer → aviso a supervisión y administración'],
          ].map(([c, t], i) => (
            <Revelar key={c} retraso={i * 90}>
              {/* Apilado en móvil. La etiqueta medía 144 px fijos y dejaba 163 px
                  para el texto en una pantalla de 375: cada renglón se partía en
                  tres. En línea a partir de `sm`, donde sí hay ancho. */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-5 sm:items-start">
                <span
                  className="self-start shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white sm:w-36 sm:text-center"
                  style={{ backgroundColor: MARCA }}
                >
                  {c}
                </span>
                <span className="text-gray-700 sm:pt-1.5 text-sm">{t}</span>
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

        {/* Dos pagos separados y con alcance propio. Antes la implementación
            figuraba como «a convenir» y a la vez como incluida en la
            mensualidad: dos afirmaciones que no podían ser ciertas a la vez. */}
        <Revelar retraso={100} desde="zoom">
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-100 p-6 sm:p-7 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                Pago único
              </p>
              <p className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
                $5.000.000
              </p>
              <p className="mt-2 text-sm text-gray-500">Implementación</p>
            </div>
            <div className="rounded-2xl p-6 sm:p-7 text-center text-white" style={{ backgroundColor: MARCA }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Cada mes
              </p>
              <p className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
                $3.900.000
              </p>
              <p className="mt-2 text-sm text-white/60">Operación de la plataforma</p>
            </div>
          </div>
        </Revelar>

        <Revelar retraso={240}>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-100 p-6">
              <p className="text-sm font-semibold text-gray-900">La implementación incluye</p>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                {[
                  'Creación de los usuarios de todas las secretarías',
                  'Cargue inicial de los contratos vigentes y su historial',
                  'Desarrollos a la medida para el entorno de Dabeiba',
                ].map(t => (
                  <div key={t} className="flex gap-2.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 p-6">
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

        {/* Vigencia. Se enuncia igual que en las actas que la propia plataforma
            genera, para que el contrato y el sistema digan lo mismo. */}
        <Revelar retraso={320}>
          <div className="mt-4 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: '#F6F7F9' }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Vigencia</p>
            <p className="mt-3 text-lg font-semibold text-gray-900">
              Desde la suscripción del acta de inicio y hasta el 31 de diciembre de 2026.
            </p>
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
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-5 sm:items-start">
                <span
                  className="self-start shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: MARCA }}
                >
                  {s}
                </span>
                <span className="text-gray-700 sm:pt-1.5">{t}</span>
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

      {/* ── Al terminar el contrato ───────────────────────────────
          Va antes de las cifras y no al final escondido: quien firma quiere
          saber qué pasa con su información ANTES de que le impresionen los
          números, no después. Decirlo de frente es un argumento, no un riesgo. */}
      <Seccion>
        <Revelar>
          <Etiqueta>Al terminar el contrato</Etiqueta>
          <Titulo>La información es del municipio</Titulo>
          <p className="mt-6 text-gray-600 leading-relaxed">
            Lo que pasa el 31 de diciembre queda escrito desde ahora, no se
            resuelve después.
          </p>
        </Revelar>

        <div className="mt-10 space-y-3">
          {[
            ['Consulta por 3 meses',
             'La plataforma sigue disponible en modo consulta durante los tres meses siguientes a la terminación, sin permitir la creación de nuevos contratos ni periodos.'],
            ['Entrega en 30 días hábiles',
             'La totalidad de la información se entrega en dos formatos: los documentos en PDF, organizados por contrato y periodo, y los datos en formato abierto (XLSX y CSV).'],
            ['Con acta de entrega',
             'Se entrega al supervisor del contrato o a quien la Alcaldía designe por escrito, mediante acta firmada.'],
            ['Verificación indefinida',
             'Los códigos QR de los documentos ya emitidos siguen resolviendo de forma indefinida y sin costo. Un acta firmada en 2026 se podrá verificar años después.'],
            ['Conservar o eliminar, lo decide la Alcaldía',
             'Vencido el plazo de consulta, la información se conserva o se elimina según instrucción escrita de la Alcaldía y sus tablas de retención documental, conforme a la Ley 1581 de 2012.'],
          ].map(([t, d], i) => (
            <Revelar key={t} retraso={i * 80} desde="izquierda">
              <div className="rounded-2xl border border-gray-100 p-6">
                <p className="font-semibold text-gray-900">{t}</p>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{d}</p>
              </div>
            </Revelar>
          ))}
        </div>

        <Revelar retraso={440}>
          <div className="mt-8 rounded-2xl p-6 sm:p-8" style={{ backgroundColor: '#F6F7F9' }}>
            <p className="text-gray-700 leading-relaxed">
              <span className="font-semibold text-gray-900">Sobre la verificación, una precisión técnica.</span>{' '}
              El código QR va impreso dentro de cada PDF: la dirección queda
              grabada en la imagen y no se puede reescribir después. Por eso el
              compromiso de mantenerla activa es indefinido y no depende de que
              el contrato siga vigente — de lo contrario, el día que un ente de
              control escanee un documento de 2026 no cargaría nada.
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
              <div className="bg-white/[0.06] p-5 sm:p-6 h-full">
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
              Hablemos de cómo se vería el primer ciclo en Dabeiba.
            </p>
          </Revelar>

          <Revelar retraso={200}>
            <a
              href={enlaceWhatsApp('Buen día. Soy de la Alcaldía de Dabeiba y quisiera conocer más sobre Contratista Digital.')}
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
              Contratista Digital · Propuesta para la Alcaldía Municipal de Dabeiba
            </p>
          </Revelar>
        </div>
      </section>
    </main>
  )
}
