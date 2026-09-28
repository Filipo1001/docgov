'use client'

/**
 * El aviso completo, con jerarquía.
 *
 * EL PROBLEMA QUE RESUELVE. El panel de la campana recorta el mensaje a dos
 * líneas —unos 90 caracteres— y 479 de las 2.489 notificaciones emitidas pasan
 * de ahí. El cruce era el peor posible: las largas son las de gestión
 * (`expediente_incompleto` promedia 352 caracteres, `revision_pendiente` 267) y
 * son precisamente las 60 que no tienen `periodo_id`, así que el clic no llevaba
 * a ninguna parte. Un aviso real de 566 caracteres enumeraba diez contratos y
 * cerraba con «tienes que habilitarles el envío tardío»; de todo eso se veían
 * los primeros noventa caracteres.
 *
 * ── Por qué manda la cifra ───────────────────────────────────────────────
 *
 * El primer intento resolvió la legibilidad y nada más: todo el aviso en el
 * mismo gris de 11 a 13 píxeles, título, lista y pie pesando igual. Se podía
 * leer, pero había que leerlo entero para saber si importaba.
 *
 * Estos avisos abren contando —«11 van a pasar su primera cuenta sin el
 * contrato»— y esa cifra es la prioridad: dice si es un caso aislado o medio
 * municipio. Va arriba y grande. Después, lo único accionable. Después, la
 * lista. El párrafo que lo explica todo queda al final, porque para entonces ya
 * está entendido.
 *
 * ── Lo que falta se dice, no se disimula ─────────────────────────────────
 *
 * El cron guarda solo los ocho o diez primeros contratos y anota «y 3 más»;
 * esos tres no existen en la base. Antes era una línea gris al pie de la lista.
 * Ahora es una fila de la propia lista, punteada: ocupa el lugar de lo que
 * falta en vez de excusarlo aparte.
 *
 * ── Por qué va en un portal y no donde se escribe ────────────────────────
 *
 * La campana vive dentro del <aside> de app/dashboard/layout.tsx, y ese aside
 * lleva `transform` para deslizarse en móvil. Un transform distinto de `none`
 * convierte al elemento en el bloque contenedor de todo `position: fixed` que
 * cuelgue de él: el `inset-0` de esta capa dejaba de medirse contra la pantalla
 * y pasaba a medirse contra la barra lateral —256 px—, así que el modal salía
 * aplastado en una franja a la izquierda. Y como el aside conserva el transform
 * en escritorio (`md:translate-x-0`), no era un problema solo del teléfono.
 *
 * El portal lo cuelga de <body>, fuera del alcance de ese transform. Es la
 * única forma de que una capa a pantalla completa sea de verdad a pantalla
 * completa desde dentro de la barra.
 *
 * ── El teléfono no es el escritorio estrechado ───────────────────────────
 *
 * En móvil es una hoja que sube del borde inferior, con asa, y se cierra
 * arrastrándola hacia abajo —el gesto que ya espera cualquiera que use un
 * teléfono— o con el botón. Las filas de contrato se apilan en dos renglones
 * para que ningún nombre se recorte. En escritorio es una tarjeta centrada que
 * crece en el sitio y las filas vuelven a una sola línea.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { Notificacion } from '@/lib/types'
import { interpretar } from '@/lib/notificacion-detalle'
import { resolverContratos } from '@/app/actions/notificaciones'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

// ─── Severidad ────────────────────────────────────────────────────────────────
// El color es lo único que no decora: separa lo que te exige algo de lo que
// solo te informa. Cuatro tonos y ni uno más — con más, ninguno significa nada.

type Severidad = 'exige' | 'falla' | 'cierra' | 'informa'

interface Paleta {
  /** Barra de acento: 3 px saturados en el borde superior. */
  acento: string
  /** Banda del encabezado, teñida apenas. */
  banda: string
  /** Pastilla del icono. */
  pastilla: string
  glifo: string
  /** Panel de la instrucción. */
  panel: string
  panelBorde: string
  /** La cifra protagonista. */
  cifra: string
}

const PALETAS: Record<Severidad, Paleta> = {
  exige: {
    acento: 'bg-amber-400', banda: 'bg-amber-50/60', pastilla: 'bg-amber-100',
    glifo: 'text-amber-700', panel: 'bg-amber-50', panelBorde: 'border-amber-200/70',
    cifra: 'text-amber-600',
  },
  falla: {
    acento: 'bg-rose-400', banda: 'bg-rose-50/60', pastilla: 'bg-rose-100',
    glifo: 'text-rose-700', panel: 'bg-rose-50', panelBorde: 'border-rose-200/70',
    cifra: 'text-rose-600',
  },
  cierra: {
    acento: 'bg-emerald-400', banda: 'bg-emerald-50/60', pastilla: 'bg-emerald-100',
    glifo: 'text-emerald-700', panel: 'bg-emerald-50', panelBorde: 'border-emerald-200/70',
    cifra: 'text-emerald-600',
  },
  informa: {
    acento: 'bg-slate-300', banda: 'bg-slate-50', pastilla: 'bg-slate-100',
    glifo: 'text-slate-600', panel: 'bg-slate-50', panelBorde: 'border-slate-200',
    cifra: 'text-slate-600',
  },
}

/** El antetítulo dice de qué va el aviso antes de leer el título. */
const ROTULOS: Record<Severidad, string> = {
  exige: 'Requiere tu gestión',
  falla: 'Devuelto',
  cierra: 'Completado',
  informa: 'Para tu información',
}

function severidadDe(tipo: string): { glifo: LucideIcon; severidad: Severidad } {
  switch (tipo) {
    case 'aprobado':                 return { glifo: Iconos.estado.aprobado,      severidad: 'cierra' }
    case 'radicado':                 return { glifo: Iconos.estado.verificado,    severidad: 'cierra' }
    case 'rechazado':
    case 'planilla_rechazada':       return { glifo: Iconos.estado.rechazado,     severidad: 'falla' }
    case 'devuelto_sin_corregir':
    case 'devuelto_estancado':       return { glifo: Iconos.estado.advertencia,   severidad: 'falla' }
    case 'expediente_incompleto':
    case 'radicacion_pendiente':
    case 'revision_pendiente':
    case 'primer_informe_pendiente':
    case 'contrato_vencimiento':     return { glifo: Iconos.estado.advertencia,   severidad: 'exige' }
    case 'recordatorio':             return { glifo: Iconos.estado.enEspera,      severidad: 'exige' }
    case 'revision':                 return { glifo: Iconos.accion.ver,           severidad: 'informa' }
    case 'enviado':
    case 'enviado_confirmacion':     return { glifo: Iconos.accion.enviar,        severidad: 'informa' }
    default:                         return { glifo: Iconos.aviso.notificaciones, severidad: 'informa' }
  }
}

/** «17 de septiembre de 2026 · 7:00 a. m.» — la fecha exacta, no «hace 10 días». */
function fechaCompleta(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  return `${dia} · ${hora}`
}

/** Cerrar arrastrando: pasado este recorrido, la hoja se va. */
const UMBRAL_CIERRE = 110

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NotificacionDetalleModal({
  notificacion,
  onCerrar,
  onMarcarNoLeida,
}: {
  notificacion: Notificacion | null
  onCerrar: () => void
  onMarcarNoLeida: (id: string) => void
}) {
  const router = useRouter()
  const [ids, setIds] = useState<Record<string, string>>({})
  const [arrastre, setArrastre] = useState(0)
  // El portal necesita un DOM; en el render del servidor no lo hay.
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  const inicioY = useRef<number | null>(null)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  const detalle = notificacion ? interpretar(notificacion.mensaje) : null

  // Los números de contrato del mensaje → ids, para que cada fila sea un enlace.
  useEffect(() => {
    setIds({})
    setArrastre(0)
    if (!notificacion) return
    const d = interpretar(notificacion.mensaje)
    if (!d.bloques.length) return
    const numeros = d.bloques.flatMap(b => b.items.map(i => i.contrato))
    let vivo = true
    resolverContratos(numeros).then(m => { if (vivo) setIds(m) }).catch(() => {})
    return () => { vivo = false }
  }, [notificacion])

  // Escape cierra; el foco entra en la hoja y vuelve de donde salió al cerrarla.
  // Y se bloquea el desplazamiento del fondo: una hoja abierta sobre una página
  // que se sigue moviendo detrás es de las cosas que más delatan un modal mal
  // hecho en un teléfono.
  useEffect(() => {
    if (!notificacion) return
    const previo = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarRef.current?.focus()

    function onTecla(e: KeyboardEvent) { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', onTecla)
    return () => {
      document.removeEventListener('keydown', onTecla)
      document.body.style.overflow = overflow
      previo?.focus?.()
    }
  }, [notificacion, onCerrar])

  // ── Arrastre para cerrar (solo hacia abajo, solo desde el asa) ──
  const alMover = useCallback((e: PointerEvent) => {
    if (inicioY.current === null) return
    setArrastre(Math.max(0, e.clientY - inicioY.current))
  }, [])

  const alSoltar = useCallback((e: PointerEvent) => {
    const recorrido = inicioY.current === null ? 0 : Math.max(0, e.clientY - inicioY.current)
    inicioY.current = null
    window.removeEventListener('pointermove', alMover)
    window.removeEventListener('pointerup', alSoltar)
    if (recorrido > UMBRAL_CIERRE) onCerrar()
    else setArrastre(0)
  }, [alMover, onCerrar])

  function iniciarArrastre(e: React.PointerEvent) {
    inicioY.current = e.clientY
    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
  }

  if (!notificacion || !detalle || !montado) return null

  const { glifo, severidad } = severidadDe(notificacion.tipo)
  const p = PALETAS[severidad]
  const periodo = notificacion.periodo as
    | { id: string; mes: string; anio: number; contrato_id?: string; contrato?: { numero: string } }
    | undefined
  const contratoDelPeriodo = periodo?.contrato_id

  // La cifra protagonista sale del primer bloque que la traiga. Un aviso que no
  // cuenta nada —la mayoría— no la pinta: inventar un «1» gigante sería ruido.
  const principal = detalle.bloques.find(b => b.cantidad !== null) ?? null
  const totalItems = detalle.bloques.reduce((n, b) => n + b.items.length + b.omitidos, 0)

  function irA(ruta: string) {
    onCerrar()
    router.push(ruta)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] sm:p-4 upload-overlay-enter"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={notificacion.titulo}
    >
      <div
        className="hoja-entra bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[86vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={arrastre ? { transform: `translateY(${arrastre}px)`, animation: 'none' } : undefined}
      >
        {/* Barra de acento: la severidad se ve antes de leer una palabra. */}
        <div className={`h-1 ${p.acento} shrink-0`} />

        {/* ── Asa: solo en móvil, y es la zona por la que se arrastra ── */}
        <div
          className="sm:hidden shrink-0 pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={iniciarArrastre}
        >
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* ── Encabezado ── */}
        <div className={`${p.banda} px-5 sm:px-7 pt-4 sm:pt-6 pb-5 shrink-0 border-b border-slate-100`}>
          <div className="flex items-start gap-3.5">
            <div className={`w-11 h-11 rounded-2xl ${p.pastilla} flex items-center justify-center shrink-0`}>
              <Icono glifo={glifo} tamano="md" className={p.glifo} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">
                {ROTULOS[severidad]}
              </p>
              <h2 className="text-lg sm:text-xl font-bold text-[#192031] leading-tight tracking-tight mt-1 text-balance">
                {notificacion.titulo}
              </h2>
            </div>
            <button
              ref={cerrarRef}
              onClick={onCerrar}
              className="shrink-0 -mr-2 -mt-1 w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none transition-colors"
            >
              <Icono glifo={Iconos.accion.cerrar} tamano="md" etiqueta="Cerrar" />
            </button>
          </div>

          {/* Metadatos: pequeños, al pie de la banda, nunca compitiendo. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3.5 text-[11px] text-slate-500 sm:pl-[58px]">
            <span>{fechaCompleta(notificacion.created_at)}</span>
            {periodo && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-medium text-slate-600">
                  {periodo.contrato?.numero ? `Contrato ${periodo.contrato.numero} — ` : ''}
                  {periodo.mes} {periodo.anio}
                </span>
              </>
            )}
            {notificacion.email_estado === 'enviado' && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1">
                  <Icono glifo={Iconos.aviso.correo} tamano="sm" className="text-slate-400" />
                  También por correo
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Cuerpo ── */}
        <div className="overflow-y-auto flex-1 overscroll-contain">

          {/* 1 · La cifra. Lo primero que se lee y lo que fija la prioridad. */}
          {principal && (
            <div className="px-5 sm:px-7 pt-6 pb-1 flex items-baseline gap-4">
              <span className={`text-[44px] sm:text-5xl font-bold leading-none tabular-nums tracking-tighter ${p.cifra}`}>
                {principal.cantidad}
              </span>
              <p className="text-sm sm:text-[15px] text-slate-600 leading-snug flex-1 min-w-0 pb-1">
                {principal.resumen}
              </p>
            </div>
          )}

          {/* 2 · La acción. El cron la escribe al final; aquí sube. */}
          {detalle.instruccion && (
            <div className="px-5 sm:px-7 pt-5">
              <div className={`rounded-2xl ${p.panel} border ${p.panelBorde} px-4 sm:px-5 py-4`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 mb-1.5">
                  Qué hay que hacer
                </p>
                <p className="text-sm text-[#192031] leading-relaxed font-medium">
                  {detalle.instruccion}
                </p>
              </div>
            </div>
          )}

          {/* 3 · La lista, como tabla. Un contrato por fila, tocable. */}
          {detalle.bloques.map((bloque, i) => (
            <div key={i} className="px-5 sm:px-7 pt-6">
              <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">
                  {detalle.bloques.length > 1 ? bloque.resumen : 'Contratos'}
                </p>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  {bloque.items.length + bloque.omitidos}
                </span>
              </div>

              <ul className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
                {bloque.items.map((item, j) => {
                  const id = ids[item.contrato]
                  const fila = (
                    <div className="flex items-center gap-3 px-3 sm:px-4 py-3">
                      <span className="shrink-0 min-w-[2.75rem] px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold tabular-nums text-center">
                        {item.contrato}
                      </span>
                      {/* En móvil el nombre y el mes se apilan: así no se corta
                          ningún nombre, que es medio directorio del municipio. */}
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span className="text-[13px] sm:text-sm text-[#192031] font-medium leading-snug">
                          {item.nombre}
                        </span>
                        {item.extra && (
                          <span className="text-[11px] text-slate-500 sm:shrink-0 mt-0.5 sm:mt-0">
                            {item.extra}
                          </span>
                        )}
                      </div>
                      <Icono
                        glifo={Iconos.accion.avanzar}
                        tamano="sm"
                        className={id ? 'text-slate-300 shrink-0' : 'text-transparent shrink-0'}
                      />
                    </div>
                  )
                  return (
                    <li key={j}>
                      {id ? (
                        <button
                          onClick={() => irA(`/dashboard/contratos/${id}`)}
                          className="w-full text-left hover:bg-slate-50 active:bg-slate-100 focus-visible:bg-slate-50 focus-visible:outline-none transition-colors"
                        >
                          {fila}
                        </button>
                      ) : fila}
                    </li>
                  )
                })}

                {/* Lo que el cron contó pero no escribió, en el lugar que ocupa. */}
                {bloque.omitidos > 0 && (
                  <li className="px-3 sm:px-4 py-3 bg-slate-50/60">
                    <div className="flex items-center gap-3">
                      <span className="shrink-0 min-w-[2.75rem] px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-400 text-xs font-bold tabular-nums text-center">
                        +{bloque.omitidos}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-snug">
                        El aviso los contó pero no alcanzó a nombrarlos. Están en la
                        lista de contratos, filtrando por lo que falta.
                      </span>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          ))}

          {/* 4 · El párrafo completo, al final: para entonces ya está entendido. */}
          {principal && (
            <div className="px-5 sm:px-7 pt-6">
              <details className="group">
                <summary className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer list-none inline-flex items-center gap-1.5 transition-colors">
                  <Icono
                    glifo={Iconos.accion.desplegar}
                    tamano="sm"
                    className="transition-transform group-open:rotate-180"
                  />
                  Ver el aviso tal como llegó
                </summary>
                <p className="text-[12px] text-slate-500 leading-relaxed mt-2.5 whitespace-pre-line">
                  {notificacion.mensaje}
                </p>
              </details>
            </div>
          )}

          {/* Mensaje sin estructura: tal cual se escribió, saltos incluidos.
              Son las devoluciones que redacta la secretaría, con sus puntos
              numerados. Aquí el texto ES el contenido, no hay nada que extraer. */}
          {!detalle.bloques.length && detalle.parrafos.length > 0 && (
            <div className="px-5 sm:px-7 pt-6 space-y-3">
              {detalle.parrafos.map((parrafo, i) => (
                <p key={i} className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {parrafo}
                </p>
              ))}
            </div>
          )}

          {!detalle.bloques.length && !detalle.parrafos.length && (
            <div className="px-5 sm:px-7 pt-8 pb-2 text-center">
              <p className="text-sm text-slate-400">Este aviso llegó sin mensaje.</p>
            </div>
          )}

          <div className="h-7" />
        </div>

        {/* ── Pie: pegado abajo, con respeto por el notch ── */}
        <div className="shrink-0 border-t border-slate-100 bg-white/95 backdrop-blur px-5 sm:px-7 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
          <button
            onClick={() => { onMarcarNoLeida(notificacion.id); onCerrar() }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none rounded-lg px-1 py-2 transition-colors"
          >
            Marcar no leída
          </button>

          {notificacion.periodo_id && contratoDelPeriodo ? (
            <button
              onClick={() => irA(`/dashboard/contratos/${contratoDelPeriodo}/periodo/${notificacion.periodo_id}`)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#192031] hover:bg-[#242F45] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#192031] focus-visible:outline-none transition-colors"
            >
              Ir al informe
              <Icono glifo={Iconos.accion.avanzar} tamano="sm" />
            </button>
          ) : totalItems > 0 ? (
            <button
              onClick={() => irA('/dashboard/contratos')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#192031] hover:bg-[#242F45] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#192031] focus-visible:outline-none transition-colors"
            >
              Ver contratos
              <Icono glifo={Iconos.accion.avanzar} tamano="sm" />
            </button>
          ) : (
            <button
              onClick={onCerrar}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#192031] hover:bg-[#242F45] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#192031] focus-visible:outline-none transition-colors"
            >
              Entendido
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
