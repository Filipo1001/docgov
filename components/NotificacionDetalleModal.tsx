'use client'

/**
 * El aviso completo, que antes no se podía leer.
 *
 * EL PROBLEMA QUE RESUELVE. El panel de la campana recorta el mensaje a dos
 * líneas —unos 90 caracteres— y 479 de las 2.489 notificaciones emitidas pasan
 * de ahí. El cruce era el peor posible: las largas son las de gestión
 * (`expediente_incompleto` promedia 352 caracteres, `revision_pendiente` 267) y
 * son precisamente las que no tienen `periodo_id`, así que el clic no llevaba a
 * ninguna parte. Un aviso real de 566 caracteres enumeraba diez contratos y
 * cerraba con «tienes que habilitarles el envío tardío»; de todo eso se veían
 * los primeros noventa caracteres y nada más.
 *
 * DOS DECISIONES DE FONDO:
 *
 *   · La instrucción va primero. El cron la escribe al final, después de la
 *     lista, porque así se redacta un párrafo; pero es lo único accionable, así
 *     que aquí sube al encabezado. Leer deja de ser un requisito para actuar.
 *
 *   · Lo que falta se dice, no se disimula. El cron guarda solo los ocho o diez
 *     primeros contratos y anota «y 3 más»; esos tres no existen en la base. El
 *     modal lo declara en lugar de fingir una lista completa.
 *
 * Toda notificación abre aquí, tenga periodo o no. Es lo que convierte el clic
 * en algo que siempre responde: si hay periodo, el modal ofrece ir a él; si no,
 * al menos se lee entero.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Notificacion } from '@/lib/types'
import { interpretar } from '@/lib/notificacion-detalle'
import { resolverContratos } from '@/app/actions/notificaciones'
import Icono from '@/components/ui/Icono'
import { Iconos, type LucideIcon } from '@/lib/iconos'

// ─── Presentación por tipo ────────────────────────────────────────────────────
// El color no decora: separa lo que exige algo de ti de lo que solo informa.

type Tono = 'ambar' | 'rojo' | 'verde' | 'azul'

const TONOS: Record<Tono, { punto: string; texto: string; panel: string; borde: string }> = {
  ambar: { punto: 'bg-amber-50',   texto: 'text-amber-600',   panel: 'bg-amber-50/70',   borde: 'border-amber-100' },
  rojo:  { punto: 'bg-red-50',     texto: 'text-red-600',     panel: 'bg-red-50/70',     borde: 'border-red-100' },
  verde: { punto: 'bg-emerald-50', texto: 'text-emerald-600', panel: 'bg-emerald-50/70', borde: 'border-emerald-100' },
  azul:  { punto: 'bg-blue-50',    texto: 'text-blue-600',    panel: 'bg-blue-50/70',    borde: 'border-blue-100' },
}

function presentacion(tipo: string): { glifo: LucideIcon; tono: Tono } {
  switch (tipo) {
    case 'aprobado':              return { glifo: Iconos.estado.aprobado,     tono: 'verde' }
    case 'radicado':              return { glifo: Iconos.estado.verificado,   tono: 'verde' }
    case 'rechazado':
    case 'planilla_rechazada':    return { glifo: Iconos.estado.rechazado,    tono: 'rojo' }
    case 'devuelto_sin_corregir':
    case 'devuelto_estancado':    return { glifo: Iconos.estado.advertencia,  tono: 'rojo' }
    case 'expediente_incompleto':
    case 'radicacion_pendiente':
    case 'revision_pendiente':
    case 'primer_informe_pendiente':
    case 'contrato_vencimiento':  return { glifo: Iconos.estado.advertencia,  tono: 'ambar' }
    case 'recordatorio':          return { glifo: Iconos.estado.enEspera,     tono: 'ambar' }
    case 'revision':              return { glifo: Iconos.accion.ver,          tono: 'azul' }
    case 'enviado':
    case 'enviado_confirmacion':  return { glifo: Iconos.accion.enviar,       tono: 'azul' }
    default:                      return { glifo: Iconos.aviso.notificaciones, tono: 'azul' }
  }
}

/** «17 de septiembre de 2026, 7:00 a. m.» — la fecha exacta, no «hace 10 días». */
function fechaCompleta(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

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

  const detalle = notificacion ? interpretar(notificacion.mensaje) : null

  // Los números de contrato del mensaje → ids, para que cada fila sea un enlace.
  useEffect(() => {
    setIds({})
    if (!detalle?.bloques.length) return
    const numeros = detalle.bloques.flatMap(b => b.items.map(i => i.contrato))
    let vivo = true
    resolverContratos(numeros).then(mapa => { if (vivo) setIds(mapa) }).catch(() => {})
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificacion?.id])

  // Escape cierra, como en cualquier modal del sistema.
  useEffect(() => {
    if (!notificacion) return
    function onTecla(e: KeyboardEvent) { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', onTecla)
    return () => document.removeEventListener('keydown', onTecla)
  }, [notificacion, onCerrar])

  if (!notificacion || !detalle) return null

  const { glifo, tono } = presentacion(notificacion.tipo)
  const t = TONOS[tono]
  const periodo = notificacion.periodo as
    | { id: string; mes: string; anio: number; contrato_id?: string; contrato?: { numero: string } }
    | undefined
  const contratoDelPeriodo = periodo?.contrato_id

  function irA(ruta: string) {
    onCerrar()
    router.push(ruta)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={notificacion.titulo}
    >
      <div
        className="bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Encabezado ── */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl ${t.punto} flex items-center justify-center shrink-0`}>
              <Icono glifo={glifo} tamano="md" className={t.texto} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-gray-900 leading-snug">
                {notificacion.titulo}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {fechaCompleta(notificacion.created_at)}
                {periodo && (
                  <>
                    {' · '}
                    {periodo.contrato?.numero ? `Contrato ${periodo.contrato.numero} — ` : ''}
                    {periodo.mes} {periodo.anio}
                  </>
                )}
              </p>
            </div>
            <button
              onClick={onCerrar}
              className="shrink-0 -mr-1 -mt-1 p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Icono glifo={Iconos.accion.cerrar} tamano="md" etiqueta="Cerrar" />
            </button>
          </div>
        </div>

        {/* ── Cuerpo ── */}
        <div className="px-5 sm:px-6 py-5 overflow-y-auto flex-1 space-y-5">

          {/* Lo que hay que hacer, antes de la lista y no después. */}
          {detalle.instruccion && (
            <div className={`rounded-xl ${t.panel} border ${t.borde} px-4 py-3`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Qué hay que hacer
              </p>
              <p className="text-sm text-gray-800 leading-relaxed">{detalle.instruccion}</p>
            </div>
          )}

          {/* Mensaje estructurado: un bloque por tramo, un contrato por fila. */}
          {detalle.bloques.map((bloque, i) => (
            <div key={i}>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">{bloque.encabezado}</p>
              <ul className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {bloque.items.map((item, j) => {
                  const id = ids[item.contrato]
                  const fila = (
                    <div className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="text-xs font-bold text-gray-900 tabular-nums shrink-0 w-10">
                        {item.contrato}
                      </span>
                      <span className="text-xs text-gray-600 flex-1 min-w-0 truncate">
                        {item.nombre}
                      </span>
                      {item.extra && (
                        <span className="text-[11px] text-gray-500 shrink-0">{item.extra}</span>
                      )}
                      {id && (
                        <Icono
                          glifo={Iconos.accion.avanzar}
                          tamano="sm"
                          className="text-gray-300 shrink-0"
                        />
                      )}
                    </div>
                  )
                  return (
                    <li key={j}>
                      {id ? (
                        <button
                          onClick={() => irA(`/dashboard/contratos/${id}`)}
                          className="w-full text-left hover:bg-gray-50 transition-colors"
                        >
                          {fila}
                        </button>
                      ) : (
                        fila
                      )}
                    </li>
                  )
                })}
              </ul>
              {bloque.omitidos > 0 && (
                <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                  Hay {bloque.omitidos} más que el aviso contó pero no alcanzó a nombrar.
                  Están en la lista de contratos, filtrando por lo que falta.
                </p>
              )}
            </div>
          ))}

          {/* Mensaje sin estructura: tal cual se escribió, saltos incluidos. */}
          {!detalle.bloques.length && detalle.parrafos.map((p, i) => (
            <p key={i} className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {p}
            </p>
          ))}

          {!detalle.bloques.length && !detalle.parrafos.length && (
            <p className="text-sm text-gray-400 italic">Este aviso llegó sin mensaje.</p>
          )}

          {/* Si también salió por correo, decirlo: explica el duplicado en la bandeja. */}
          {notificacion.email_estado === 'enviado' && (
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-1">
              <Icono glifo={Iconos.aviso.correo} tamano="sm" className="text-gray-300" />
              Este aviso también se te envió por correo.
            </p>
          )}
        </div>

        {/* ── Pie ── */}
        <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={() => { onMarcarNoLeida(notificacion.id); onCerrar() }}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            Marcar como no leída
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cerrar
            </button>
            {notificacion.periodo_id && contratoDelPeriodo && (
              <button
                onClick={() => irA(`/dashboard/contratos/${contratoDelPeriodo}/periodo/${notificacion.periodo_id}`)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-colors"
              >
                Ir al informe
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
