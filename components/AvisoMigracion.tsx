'use client'

/**
 * Aviso del cambio de dominio, visible en todo el panel.
 *
 * Tres decisiones que vale la pena dejar escritas:
 *
 * 1. SE APAGA SOLO. Después de la fecha límite deja de renderizarse sin que
 *    nadie tenga que acordarse de quitarlo. Un aviso caducado que sigue en
 *    pantalla enseña a los usuarios a ignorar los avisos.
 *
 * 2. EL TEXTO CAMBIA EL DÍA DE LA MIGRACIÓN. Antes anuncia; ese día explica lo
 *    que están viendo. Un aviso que sigue diciendo "el viernes" cuando ya es
 *    viernes hace dudar de si está actualizado.
 *
 * 3. SE PUEDE CERRAR, PERO VUELVE EL DÍA CLAVE. Quien lo descartó el miércoles
 *    lo vuelve a ver el viernes, que es cuando de verdad importa.
 *
 * El texto corto va en el banner y el comunicado completo queda a un clic: seis
 * párrafos en un banner no los lee nadie.
 */

import { useEffect, useState } from 'react'

/** Día de la migración y último día que el aviso se muestra (America/Bogotá). */
const DIA_MIGRACION = '2026-08-07'
const ULTIMO_DIA = '2026-08-09'

const NUEVO_DOMINIO = 'app.contratistadigital.com'

/** Fecha de hoy en Colombia como 'YYYY-MM-DD', sin depender del reloj del equipo. */
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export default function AvisoMigracion() {
  const [hoy, setHoy] = useState<string | null>(null)
  const [cerrado, setCerrado] = useState(false)
  const [abierto, setAbierto] = useState(false)

  // La fecha se calcula tras montar: en el servidor no existe el huso del
  // usuario y renderizar algo distinto rompería la hidratación.
  useEffect(() => {
    const d = hoyBogota()
    setHoy(d)
    // El día de la migración el aviso reaparece aunque se hubiera cerrado.
    if (d !== DIA_MIGRACION) {
      setCerrado(localStorage.getItem('aviso-migracion-dominio') === 'cerrado')
    }
  }, [])

  if (!hoy || hoy > ULTIMO_DIA || cerrado) return null

  const esElDia = hoy === DIA_MIGRACION
  const yaPaso = hoy > DIA_MIGRACION

  function cerrar() {
    setCerrado(true)
    try { localStorage.setItem('aviso-migracion-dominio', 'cerrado') } catch { /* modo privado */ }
  }

  const titulo = esElDia
    ? 'Hoy estamos cambiando la dirección de la plataforma'
    : yaPaso
      ? `Ya puedes ingresar por ${NUEVO_DOMINIO}`
      : 'El viernes 7 de agosto cambiamos de dirección'

  const resumen = esElDia
    ? 'Puede que la plataforma se interrumpa por momentos. Tu información está segura y te avisaremos cuando termine.'
    : yaPaso
      ? 'La migración terminó. Guarda la nueva dirección en tus favoritos.'
      : `La plataforma pasará a ${NUEVO_DOMINIO}. Ese día puede haber interrupciones breves; tus contratos, informes y documentos no se ven afectados.`

  return (
    <div
      role="status"
      className={`mb-5 rounded-2xl border px-4 py-3 ${
        esElDia
          ? 'bg-amber-50 border-amber-300'
          : yaPaso
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-blue-50 border-blue-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>
          {esElDia ? '🔧' : yaPaso ? '✅' : '📢'}
        </span>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${
            esElDia ? 'text-amber-900' : yaPaso ? 'text-emerald-900' : 'text-blue-900'
          }`}>
            {titulo}
          </p>
          <p className={`text-xs mt-0.5 ${
            esElDia ? 'text-amber-800' : yaPaso ? 'text-emerald-800' : 'text-blue-800'
          }`}>
            {resumen}
          </p>

          <button
            type="button"
            onClick={() => setAbierto(v => !v)}
            className={`text-xs font-medium mt-1.5 underline underline-offset-2 ${
              esElDia ? 'text-amber-900 hover:text-amber-950'
                : yaPaso ? 'text-emerald-900 hover:text-emerald-950'
                  : 'text-blue-900 hover:text-blue-950'
            }`}
          >
            {abierto ? 'Ocultar detalles' : 'Ver el comunicado completo'}
          </button>

          {abierto && (
            <div className={`mt-3 pt-3 border-t space-y-2 text-xs leading-relaxed ${
              esElDia ? 'border-amber-200 text-amber-900'
                : yaPaso ? 'border-emerald-200 text-emerald-900'
                  : 'border-blue-200 text-blue-900'
            }`}>
              <p>
                El viernes 7 de agosto realizaremos la migración de la plataforma al
                nuevo dominio <strong>{NUEVO_DOMINIO}</strong>.
              </p>
              <p>
                Durante el proceso es posible que la plataforma presente interrupciones
                temporales o que por algunos momentos no esté disponible. Agradecemos su
                comprensión mientras realizamos esta mejora.
              </p>
              <p>
                <strong>No debe preocuparse por su información.</strong> Todos los contratos,
                documentos, cuentas de cobro, informes y demás datos se conservarán de forma
                íntegra y estarán disponibles al finalizar.
              </p>
              <p>
                Este cambio hace parte del crecimiento de Contratista Digital, con el objetivo
                de ofrecer una plataforma más estable, segura y preparada para las nuevas
                funcionalidades.
              </p>
              <p>
                Cuando la migración haya finalizado se lo informaremos por este mismo medio,
                para que pueda acceder normalmente a través del nuevo dominio.
              </p>
            </div>
          )}
        </div>

        {/* El día de la migración no se puede descartar: es información que hace
            falta mientras dure la interrupción. */}
        {!esElDia && (
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar aviso"
            className={`shrink-0 p-1 rounded-lg transition-colors ${
              yaPaso
                ? 'text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100'
                : 'text-blue-400 hover:text-blue-700 hover:bg-blue-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
