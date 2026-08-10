/**
 * app/maqueta-iconos/page.tsx — Maqueta comparativa de la propuesta de
 * iconografía. TEMPORAL: se borra al aprobar la dirección.
 *
 * Existe para decidir viendo, no leyendo. Reproduce piezas reales de la
 * aplicación —el menú, la lista de documentos de un periodo, los estados— con
 * lo que hay hoy al lado de lo propuesto.
 *
 * Estática y sin sesión: se despliega en preview y se abre con el enlace.
 */

import type { Metadata } from 'next'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'
import { LogoCD } from '@/components/Logo'
import type { LucideIcon } from '@/lib/iconos'

export const dynamic = 'force-static'
export const metadata: Metadata = {
  title: 'Maqueta de iconografía',
  robots: { index: false, follow: false },
}

// ── Datos reales del sistema ─────────────────────────────────────────────

/** Menú de administrador, tal como está hoy en lib/constants.ts. */
const MENU: Array<{ label: string; emoji: string; glifo: LucideIcon }> = [
  { label: 'Inicio', emoji: '🏠', glifo: Iconos.navegacion.inicio },
  { label: 'Usuarios', emoji: '👥', glifo: Iconos.navegacion.usuarios },
  { label: 'Firmas', emoji: '✍️', glifo: Iconos.navegacion.firmas },
  { label: 'Contratos', emoji: '📄', glifo: Iconos.navegacion.contratos },
  { label: 'Agosto 2026', emoji: '📋', glifo: Iconos.navegacion.informes },
  { label: 'Dependencias', emoji: '🏢', glifo: Iconos.navegacion.dependencias },
  { label: 'Municipio', emoji: '🏛️', glifo: Iconos.navegacion.municipio },
  { label: 'Históricos', emoji: '🔒', glifo: Iconos.navegacion.historicos },
  { label: 'Configuración', emoji: '⚙️', glifo: Iconos.navegacion.configuracion },
]

/** Documentos del periodo, tal como se listan hoy. */
const DOCUMENTOS: Array<{ nombre: string; nota: string; emoji: string; glifo: LucideIcon }> = [
  { nombre: 'Informe de Actividades', nota: 'Generado del periodo', emoji: '📄', glifo: Iconos.documentos.informe },
  { nombre: 'Cuenta de Cobro', nota: 'Con firma sellada', emoji: '💰', glifo: Iconos.documentos.cuentaCobro },
  { nombre: 'Planilla de Seguridad Social', nota: 'Adjuntada por el contratista', emoji: '🏥', glifo: Iconos.documentos.planilla },
  { nombre: 'Certificación de Retención', nota: 'Bajo la gravedad de juramento', emoji: '🧾', glifo: Iconos.documentos.certificacion },
  { nombre: 'Acta de Supervisión', nota: '✓ Firmada', emoji: '📋', glifo: Iconos.documentos.actaSupervision },
  { nombre: 'Acta de Terminación', nota: 'Terminación bilateral', emoji: '🤝', glifo: Iconos.documentos.actaTerminacion },
]

const ESTADOS: Array<{ texto: string; emoji: string; glifo: LucideIcon; color: string }> = [
  { texto: 'Aprobado', emoji: '✅', glifo: Iconos.estado.aprobado, color: 'text-emerald-600' },
  { texto: 'Devuelto', emoji: '❌', glifo: Iconos.estado.rechazado, color: 'text-red-600' },
  { texto: 'Pendiente de revisión', emoji: '⏳', glifo: Iconos.estado.enEspera, color: 'text-amber-600' },
  { texto: 'Periodo bloqueado', emoji: '🔒', glifo: Iconos.estado.bloqueado, color: 'text-gray-500' },
]

// ── Piezas de la maqueta ─────────────────────────────────────────────────

function Panel({ titulo, variante, children }: { titulo: string; variante: 'antes' | 'despues'; children: React.ReactNode }) {
  const esAntes = variante === 'antes'
  return (
    <div className={`rounded-2xl border ${esAntes ? 'border-gray-200 bg-gray-50/60' : 'border-gray-900/10 bg-white shadow-sm'}`}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${esAntes ? 'bg-gray-300' : 'bg-emerald-500'}`} />
        <span className={`text-[11px] font-bold tracking-[0.12em] uppercase ${esAntes ? 'text-gray-400' : 'text-gray-900'}`}>
          {titulo}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Seccion({ n, titulo, descripcion, children }: { n: string; titulo: string; descripcion: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <div className="mb-6">
        <p className="text-xs font-bold tracking-[0.15em] text-gray-400">{n}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight" style={{ color: MARCA }}>{titulo}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 max-w-2xl">{descripcion}</p>
      </div>
      {children}
    </section>
  )
}

export default function MaquetaIconos() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {/* Cabecera */}
      <header className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center gap-2.5 mb-6">
            <LogoCD size={30} />
            <span className="font-bold tracking-tight" style={{ color: MARCA }}>Contratista Digital</span>
          </div>
          <p className="text-xs font-bold tracking-[0.15em] text-gray-400">PROPUESTA DE DIRECCIÓN VISUAL</p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: MARCA }}>
            Sistema de iconografía
          </h1>
          <p className="mt-4 text-base leading-relaxed text-gray-600 max-w-2xl">
            Lucide, trazo 1.5, monocromo. A la izquierda lo que hay hoy; a la derecha lo propuesto.
            Son piezas reales de la aplicación, no ejemplos inventados.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">

        {/* ── 1. Navegación ─────────────────────────────────── */}
        <Seccion
          n="01"
          titulo="La barra lateral"
          descripcion="Es lo primero que ve cualquiera al entrar y lo que más veces se mira al día. Hoy son nueve emojis a todo color contra una tipografía gris; el resultado es que el color va donde no hay jerarquía."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Panel titulo="Hoy" variante="antes">
              <nav className="space-y-1">
                {MENU.map((m, i) => (
                  <div
                    key={m.label}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
                      i === 3 ? 'bg-gray-900 text-white' : 'text-gray-600'
                    }`}
                  >
                    <span>{m.emoji}</span>
                    <span className="flex-1">{m.label}</span>
                    {i === 4 && <span className="text-[11px] font-bold bg-red-500 text-white rounded-full px-2 py-0.5">7</span>}
                  </div>
                ))}
              </nav>
            </Panel>

            <Panel titulo="Propuesto" variante="despues">
              <nav className="space-y-1">
                {MENU.map((m, i) => (
                  <div
                    key={m.label}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
                      i === 3 ? 'text-white' : 'text-gray-600'
                    }`}
                    style={i === 3 ? { backgroundColor: MARCA } : undefined}
                  >
                    <Icono glifo={m.glifo} tamano="md" className={i === 3 ? 'text-white' : 'text-gray-400'} />
                    <span className="flex-1">{m.label}</span>
                    {i === 4 && (
                      <span className="text-[11px] font-bold text-white rounded-full px-2 py-0.5" style={{ backgroundColor: MARCA }}>7</span>
                    )}
                  </div>
                ))}
              </nav>
            </Panel>
          </div>
          <p className="mt-4 text-sm text-gray-500 max-w-2xl">
            El icono pasa a gris y solo se enciende en el ítem activo, heredando el color del texto.
            La atención va a dónde estás, no a nueve puntos de color compitiendo. El contador
            adopta la tinta de marca en lugar del rojo de alarma.
          </p>
        </Seccion>

        {/* ── 2. Documentos ─────────────────────────────────── */}
        <Seccion
          n="02"
          titulo="Documentos del periodo"
          descripcion="Seis documentos con seis emojis sin relación entre sí: un maletín médico para la planilla, un saco de dinero para la cuenta de cobro, un apretón de manos para el acta. Cada uno viene de un universo visual distinto."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Panel titulo="Hoy" variante="antes">
              <div className="space-y-2">
                {DOCUMENTOS.map(d => (
                  <div key={d.nombre} className="flex items-center gap-3 px-4 py-3 bg-gray-100/70 rounded-xl">
                    <span className="text-lg shrink-0">{d.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{d.nombre}</p>
                      <p className="text-xs text-gray-400">{d.nota}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel titulo="Propuesto" variante="despues">
              <div className="space-y-2">
                {DOCUMENTOS.map(d => (
                  <div key={d.nombre} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                    <Icono glifo={d.glifo} tamano="md" className="shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{d.nombre}</p>
                      <p className="text-xs text-gray-400">{d.nota.replace('✓ ', '')}</p>
                    </div>
                    <Icono glifo={Iconos.documentos.descargar} tamano="sm" className="shrink-0 text-gray-300" />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <p className="mt-4 text-sm text-gray-500 max-w-2xl">
            Los seis iconos comparten rejilla y grosor, así que se leen como una familia: una lista
            de documentos, no seis cosas distintas. Y aparece la acción —descargar— que antes había
            que adivinar.
          </p>
        </Seccion>

        {/* ── 3. Estados ────────────────────────────────────── */}
        <Seccion
          n="03"
          titulo="Retroalimentación de estado"
          descripcion="Este es el hallazgo más serio de la auditoría. Los ✓ ✅ ❌ ⚠ no son adorno: son la aplicación diciéndole a alguien si su informe fue aprobado o devuelto. Y son caracteres de texto que el sistema operativo del usuario dibuja a su manera."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Panel titulo="Hoy" variante="antes">
              <div className="space-y-3">
                {ESTADOS.map(e => (
                  <div key={e.texto} className="flex items-center gap-2 text-sm text-gray-700">
                    <span>{e.emoji}</span>
                    <span>{e.texto}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel titulo="Propuesto" variante="despues">
              <div className="space-y-3">
                {ESTADOS.map(e => (
                  <div key={e.texto} className="flex items-center gap-2 text-sm text-gray-700">
                    <Icono glifo={e.glifo} tamano="sm" className={e.color} />
                    <span>{e.texto}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                {[
                  ['Aprobado', 'bg-emerald-50 text-emerald-700 border-emerald-200', Iconos.estado.aprobado],
                  ['Devuelto', 'bg-red-50 text-red-700 border-red-200', Iconos.estado.rechazado],
                  ['En revisión', 'bg-amber-50 text-amber-700 border-amber-200', Iconos.estado.enEspera],
                  ['Radicado', 'bg-gray-50 text-gray-600 border-gray-200', Iconos.estado.verificado],
                ].map(([texto, clases, glifo]) => (
                  <span key={texto as string} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${clases}`}>
                    <Icono glifo={glifo as LucideIcon} tamano="sm" />
                    {texto as string}
                  </span>
                ))}
              </div>
            </Panel>
          </div>
          <p className="mt-4 text-sm text-gray-500 max-w-2xl">
            Aquí el color sí significa algo, y por eso se queda. La diferencia es que ahora es
            deliberado: verde, ámbar y rojo son los tres únicos casos en que un icono lleva color.
          </p>
        </Seccion>

        {/* ── 4. Paleta ─────────────────────────────────────── */}
        <Seccion
          n="04"
          titulo="De once familias de color a cuatro roles"
          descripcion="La aplicación usa hoy once familias: rojo, azul, esmeralda, ámbar, verde, índigo, naranja, morado, cian… Hay dos verdes y dos naranjas haciendo el mismo trabajo. Y la marca aparece 6 veces frente a las 47 de blue-600."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Panel titulo="Hoy — 11 familias" variante="antes">
              <div className="grid grid-cols-4 gap-3">
                {[
                  ['red', '#dc2626', '197'], ['blue', '#2563eb', '174'], ['emerald', '#059669', '143'],
                  ['amber', '#d97706', '118'], ['green', '#16a34a', '37'], ['indigo', '#4f46e5', '19'],
                  ['orange', '#ea580c', '12'], ['purple', '#9333ea', '9'], ['cyan', '#0891b2', '2'],
                ].map(([n, c, uso]) => (
                  <div key={n as string}>
                    <div className="h-12 rounded-lg" style={{ backgroundColor: c as string }} />
                    <p className="mt-1.5 text-[10px] font-medium text-gray-500">{n as string}</p>
                    <p className="text-[10px] text-gray-400">{uso as string} usos</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel titulo="Propuesto — 4 roles" variante="despues">
              <div className="grid grid-cols-4 gap-3">
                {[
                  ['Marca', MARCA, 'Acciones primarias, estado activo'],
                  ['Éxito', '#059669', 'Aprobado, verificado'],
                  ['Atención', '#d97706', 'Pendiente, advertencia'],
                  ['Error', '#dc2626', 'Devuelto, destructivo'],
                ].map(([n, c, uso]) => (
                  <div key={n as string}>
                    <div className="h-12 rounded-lg" style={{ backgroundColor: c as string }} />
                    <p className="mt-1.5 text-[10px] font-bold text-gray-700">{n as string}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{uso as string}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
                Todo lo demás es la escala de grises, que ya domina la interfaz con 1.199 usos.
                Un solo verde, un solo naranja, y la tinta de marca ocupando el lugar del azul
                genérico.
              </p>
            </Panel>
          </div>
        </Seccion>

        {/* ── 5. Detalles ───────────────────────────────────── */}
        <Seccion
          n="05"
          titulo="Los detalles que delatan"
          descripcion="Cosas pequeñas que, sumadas, son la diferencia entre un producto cuidado y uno que parece improvisado."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Panel titulo="Hoy" variante="antes">
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Avatar sin foto</p>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center font-bold text-white">FR</div>
                    <span className="text-sm text-gray-500">Degradado azul, fuera de marca</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Radios de esquina</p>
                  <div className="flex items-end gap-2">
                    {['sm', 'md', 'lg', 'xl', '2xl', '3xl'].map(r => (
                      <div key={r} className={`w-12 h-12 bg-gray-200 rounded-${r} flex items-end justify-center pb-1`}>
                        <span className="text-[9px] text-gray-500">{r}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">Seis radios en uso, tres de ellos con 1–3 apariciones</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Botón solo con icono</p>
                  <button className="w-9 h-9 rounded-lg bg-gray-100 text-base">🗑</button>
                  <p className="mt-2 text-xs text-gray-400">Sin nombre accesible: un lector de pantalla no lo anuncia</p>
                </div>
              </div>
            </Panel>

            <Panel titulo="Propuesto" variante="despues">
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Avatar sin foto</p>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: MARCA }}>FR</div>
                    <span className="text-sm text-gray-500">Tinta de marca, sólido</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Radios de esquina</p>
                  <div className="flex items-end gap-2">
                    <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-end justify-center pb-1"><span className="text-[9px] text-gray-500">xl</span></div>
                    <div className="w-12 h-12 bg-gray-200 rounded-2xl flex items-end justify-center pb-1"><span className="text-[9px] text-gray-500">2xl</span></div>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">Dos: <strong>xl</strong> para controles, <strong>2xl</strong> para tarjetas</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Botón solo con icono</p>
                  <button className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 transition-colors inline-flex items-center justify-center">
                    <Icono glifo={Iconos.accion.eliminar} tamano="sm" etiqueta="Eliminar evidencia" />
                  </button>
                  <p className="mt-2 text-xs text-gray-400">Con nombre accesible obligatorio en el componente</p>
                </div>
              </div>
            </Panel>
          </div>
        </Seccion>

        {/* ── 6. La escala ──────────────────────────────────── */}
        <Seccion
          n="06"
          titulo="La escala completa"
          descripcion="Tres tamaños y ninguno intermedio. El grosor sube a 1.75 en 16 px porque a ese tamaño un trazo de 1.5 se desvanece en pantallas sin retina, que son las de buena parte de las alcaldías."
        >
          <div className="rounded-2xl border border-gray-900/10 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end gap-10">
              {([['sm', '16 px', 'En línea, tablas densas'], ['md', '20 px', 'Navegación, listas'], ['lg', '24 px', 'Cabeceras, estados vacíos']] as const).map(([t, px, uso]) => (
                <div key={t}>
                  <div className="flex items-end gap-3 h-8">
                    {[Iconos.navegacion.contratos, Iconos.documentos.cuentaCobro, Iconos.estado.aprobado, Iconos.accion.buscar].map((g, i) => (
                      <Icono key={i} glifo={g} tamano={t} className="text-gray-700" />
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-bold text-gray-900">{t} · {px}</p>
                  <p className="text-xs text-gray-400">{uso}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Catálogo por dominio</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-5 gap-x-4">
                {[
                  ...Object.entries(Iconos.navegacion).map(([k, v]) => [k, v, 'Navegación'] as const),
                  ...Object.entries(Iconos.documentos).map(([k, v]) => [k, v, 'Documentos'] as const),
                  ...Object.entries(Iconos.estado).map(([k, v]) => [k, v, 'Estado'] as const),
                  ...Object.entries(Iconos.accion).map(([k, v]) => [k, v, 'Acción'] as const),
                  ...Object.entries(Iconos.dominio).map(([k, v]) => [k, v, 'Dominio'] as const),
                ].map(([nombre, glifo], i) => (
                  <div key={`${nombre}-${i}`} className="flex flex-col items-center gap-1.5 text-center">
                    <Icono glifo={glifo as LucideIcon} tamano="md" className="text-gray-700" />
                    <span className="text-[10px] text-gray-400 leading-tight">{nombre as string}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Seccion>

        <footer className="pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            Maqueta temporal. No se despliega a producción y se elimina al aprobar la dirección.
          </p>
        </footer>
      </div>
    </main>
  )
}
