'use client'

/**
 * components/ui/DialogosRevision.tsx — Los dos modales con que el revisor corrige lo que dice la planilla: el MES DE
 * COTIZACIÓN y la BASE DE COTIZACIÓN (IBC). Los abre el panel de revisión (`PanelRevisionPlanilla`).
 *
 * Antes eran cajitas flotantes bajo la ficha: una lista seca de meses y un campo suelto. Lo que cambia, y por qué:
 *
 * MES
 *   · Se puede CONFIRMAR el mes sugerido sin cambiarlo. Antes elegir el mismo mes no hacía nada, y pasar de «Sin
 *     verificar» a «Confirmado» obligaba a cambiar de mes y volver.
 *   · Una cuadrícula de meses en vez de una lista: se ve todo de un vistazo, con el del informe marcado.
 *   · Dice qué significa la elección: coincide con el mes del informe, o es un pago por mes vencido (válido; se verifica).
 *   · Se maneja con las flechas del teclado.
 *
 * BASE
 *   · El importe se escribe y se ve con sus puntos (1.750.905), sin que el cursor salte.
 *   · Dice de dónde sale el valor por defecto, y cuánto se aleja de él lo escrito; avisa si baja del piso.
 *   · «Usar» rellena el valor por defecto; guardarlo restablece la regla (queda sin personalizar, para que siga a la
 *     regla si esta cambia) en vez de fijar el número.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import Dialogo from '@/components/ui/Dialogo'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { compararConDefecto, cursorTrasFormatear, formatearImporte, soloDigitos } from '@/lib/importe'
import { MARCA } from '@/lib/marca'

const PRIMARIO =
  'h-10 flex-1 rounded-xl px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40'
const SECUNDARIO =
  'h-10 flex-1 rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50'

/** «ABRIL» → «Abril». Los meses vienen de la base en mayúsculas. */
export function nombreMes(mes: string): string {
  return mes ? mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase() : ''
}

// ─── Mes de cotización ───────────────────────────────────────────────────────

export function DialogoMes({
  valor, confirmado, opciones, mesDelInforme, anio, guardando, onConfirmar, onCerrar, capa,
}: {
  capa?: string
  valor: string
  confirmado: boolean
  opciones: string[]
  mesDelInforme: string
  anio: number | null
  guardando: boolean
  onConfirmar: (mes: string) => void
  onCerrar: () => void
}) {
  const [sel, setSel] = useState(valor)
  const botones = useRef<(HTMLButtonElement | null)[]>([])
  const distinto = sel.toLowerCase() !== mesDelInforme.toLowerCase()
  // Confirmar el que ya está confirmado no cambia nada; confirmar el sugerido sí (lo pasa a «Confirmado»).
  const sinCambios = confirmado && sel === valor

  const moverConFlechas = (e: React.KeyboardEvent) => {
    const i = opciones.indexOf(sel)
    let j = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % opciones.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + opciones.length) % opciones.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = opciones.length - 1
    if (j < 0) return
    e.preventDefault()
    setSel(opciones[j])
    botones.current[j]?.focus()
  }

  return (
    <Dialogo
      titulo="Mes de cotización"
      capa={capa}
      icono={Iconos.dominio.periodo}
      descripcion={`El informe es de ${nombreMes(mesDelInforme)}${anio ? ` ${anio}` : ''}. Elige el mes que cubre la planilla.`}
      onCerrar={onCerrar}
      ocupado={guardando}
      pie={
        <>
          <button type="button" onClick={onCerrar} disabled={guardando} className={SECUNDARIO}>Cancelar</button>
          <button
            type="button"
            disabled={sinCambios || guardando}
            onClick={() => onConfirmar(sel)}
            className={PRIMARIO}
            style={{ backgroundColor: MARCA }}
          >
            {guardando ? 'Guardando…' : sinCambios ? 'Confirmado' : `Confirmar ${nombreMes(sel)}`}
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Mes de cotización" onKeyDown={moverConFlechas} className="grid grid-cols-3 gap-2">
        {opciones.map((m, i) => {
          const elegido = m === sel
          const delInforme = m.toLowerCase() === mesDelInforme.toLowerCase()
          return (
            <button
              key={m}
              ref={(el) => { botones.current[i] = el }}
              type="button"
              role="radio"
              aria-checked={elegido}
              tabIndex={elegido ? 0 : -1}
              data-autofocus={elegido ? '' : undefined}
              onClick={() => setSel(m)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-1 ${
                elegido ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
              }`}
              style={elegido ? { backgroundColor: MARCA } : undefined}
            >
              {nombreMes(m)}
              {delInforme && (
                <span className={`mt-0.5 text-[10px] font-normal leading-none ${elegido ? 'text-white/70' : 'text-gray-400'}`}>Informe</span>
              )}
            </button>
          )
        })}
      </div>

      <p
        aria-live="polite"
        // Espacio para dos líneas (la nota del mes vencido es la más larga): así el modal no cambia de alto al elegir.
        className={`mt-3 flex min-h-[3.25rem] items-center gap-2 rounded-lg px-3 py-2 text-xs leading-snug ${
          distinto ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'
        }`}
      >
        <Icono glifo={distinto ? Iconos.estado.advertencia : Iconos.estado.aprobado} tamano="sm" className="shrink-0" />
        <span>
          {distinto
            ? `Distinto al mes del informe (${nombreMes(mesDelInforme)}): es un pago por mes vencido. Es válido; verifica que la planilla lo sea.`
            : 'Coincide con el mes del informe.'}
        </span>
      </p>
    </Dialogo>
  )
}

// ─── Base de cotización ──────────────────────────────────────────────────────

const pesos = (n: number) => `$ ${n.toLocaleString('es-CO')}`

export function DialogoBase({
  valor, porDefecto, personalizada, explicacion, piso, guardando, onGuardar, onRestablecer, onCerrar, capa,
}: {
  capa?: string
  valor: number
  porDefecto: number
  personalizada: boolean
  /** De dónde sale el valor por defecto, en una frase (`explicarBasePorDefecto`). */
  explicacion: string
  piso: number
  guardando: boolean
  onGuardar: (valor: number) => void
  onRestablecer: () => void
  onCerrar: () => void
}) {
  const [digitos, setDigitos] = useState(String(valor))
  const campo = useRef<HTMLInputElement>(null)
  const cursor = useRef<number | null>(null)

  // Al reescribir el campo con sus puntos el cursor saltaría al final; se devuelve a su sitio antes de pintar.
  useLayoutEffect(() => {
    if (cursor.current != null && campo.current) {
      campo.current.setSelectionRange(cursor.current, cursor.current)
      cursor.current = null
    }
  }, [digitos])

  const n = Number(digitos)
  const valido = Number.isFinite(n) && n > 0
  const comparacion = compararConDefecto(n, porDefecto, piso)
  // Guardar el valor por defecto no lo fija: restablece la regla.
  const alDefecto = valido && n === porDefecto
  const sinCambios = !valido || n === valor
  const guardar = () => {
    if (sinCambios || guardando) return
    if (alDefecto) onRestablecer()
    else onGuardar(n)
  }

  const linea =
    comparacion.tipo === 'igual' ? 'Igual al valor por defecto.'
      : comparacion.tipo === 'mayor' ? `${pesos(comparacion.diferencia)} por encima del valor por defecto.`
        : comparacion.tipo === 'menor' ? `${pesos(comparacion.diferencia)} por debajo del valor por defecto.`
          : comparacion.tipo === 'bajo_piso' ? `Es menor que el piso de ${pesos(comparacion.piso)} que usa el sistema. Verifica la planilla.`
            : 'Escribe el valor que trae la planilla.'
  const aviso = comparacion.tipo === 'bajo_piso'

  return (
    <Dialogo
      titulo="Base de cotización"
      capa={capa}
      icono={Iconos.dominio.valor}
      descripcion="La que imprime el acta de supervisión. Si la planilla trae otra, corrígela aquí."
      onCerrar={onCerrar}
      ocupado={guardando}
      pie={
        <>
          {personalizada && (
            <button
              type="button"
              onClick={onRestablecer}
              disabled={guardando}
              className="mr-auto text-xs text-gray-500 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:opacity-50"
            >
              Restablecer
            </button>
          )}
          <button type="button" onClick={onCerrar} disabled={guardando} className={`${SECUNDARIO} ${personalizada ? 'flex-none' : ''}`}>Cancelar</button>
          <button
            type="button"
            disabled={sinCambios || guardando}
            onClick={guardar}
            className={`${PRIMARIO} ${personalizada ? 'flex-none' : ''}`}
            style={{ backgroundColor: MARCA }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <label htmlFor="base-cotizacion-modal" className="text-xs font-medium text-gray-600">Importe</label>
      <div className={`mt-1 flex items-center gap-2 rounded-xl border bg-white px-3 transition-colors focus-within:ring-2 ${
        aviso ? 'border-amber-300 focus-within:ring-amber-200' : 'border-gray-300 focus-within:border-gray-400 focus-within:ring-gray-200'
      }`}>
        <span className="text-lg text-gray-400">$</span>
        <input
          ref={campo}
          id="base-cotizacion-modal"
          data-autofocus=""
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formatearImporte(digitos)}
          onChange={(e) => {
            const tecleado = e.target.value
            const nuevos = soloDigitos(tecleado)
            cursor.current = cursorTrasFormatear(tecleado, e.target.selectionStart ?? tecleado.length, formatearImporte(nuevos))
            setDigitos(nuevos)
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }}
          placeholder={porDefecto.toLocaleString('es-CO')}
          aria-describedby="base-cotizacion-linea"
          aria-invalid={aviso}
          className="h-12 w-full min-w-0 bg-transparent text-lg font-semibold tracking-wide text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300"
        />
      </div>
      <p
        id="base-cotizacion-linea"
        aria-live="polite"
        className={`mt-1.5 flex min-h-[1.25rem] items-start gap-1.5 text-xs leading-snug ${aviso ? 'text-amber-700' : 'text-gray-500'}`}
      >
        {aviso && <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-px shrink-0" />}
        <span>{linea}</span>
      </p>

      {/* De dónde sale el valor por defecto, y cómo volver a él */}
      <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-600">
            Valor por defecto <span className="font-semibold text-gray-900">{pesos(porDefecto)}</span>
          </p>
          <button
            type="button"
            onClick={() => { setDigitos(String(porDefecto)); cursor.current = null; campo.current?.focus() }}
            disabled={n === porDefecto}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:no-underline disabled:opacity-40"
          >
            Usar
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-gray-500">{explicacion}</p>
      </div>
    </Dialogo>
  )
}
