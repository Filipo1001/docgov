'use client'

/**
 * El MODO PRESENTACIÓN del tablero: pantalla completa, una idea por lámina, para proyectar en una sala.
 *
 * Qué se proyecta y qué no: cifras agregadas de la secretaría, del plan y de las otras secretarías (números, nunca nombres de
 * personas ni listas de tareas). Es el mismo tablero con las mismas cuentas (`lib/pdm/tablero.ts`): solo cambia el tamaño de las
 * letras y que cada lámina dice una sola cosa.
 *
 * Cómo se dibuja: cada lámina es un lienzo fijo de 1280 × 720 que se ESCALA para llenar la pantalla conservando la proporción
 * 16:9. Así las letras y los dibujos crecen juntos en cualquier proyector, sin una regla de tamaño por cada pieza.
 *
 * Cómo se maneja: flechas, Re Pág / Av Pág, espacio, Inicio y Fin; clic a la derecha o a la izquierda de la lámina; los botones y los
 * puntos de abajo. Esc sale. Intenta la pantalla completa del navegador; si no la concede (o el navegador no la tiene) queda a
 * ventana llena, que sirve igual.
 *
 * Cada lámina se monta de nuevo al llegar a ella: sus anillos y barras se dibujan desde cero y sus cifras cuentan, con las mismas
 * reglas de movimiento reducido que el resto del módulo.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PLAN } from '@/lib/pdm/identidad'
import {
  SECTORES_EN_LAMINA, laminasDeLaPresentacion, nombreCorto, sumarCifras, tituloDeComparacion, tituloDeCumplimiento, tituloDelPlan,
  tituloDeSectores, hayQueMedir, pctEntero, type CifrasDeAnio, type ClaveDeLamina, type FilaDeComparacion, type MedidaDelTablero, type SectorDeCifras, type Trozo,
} from '@/lib/pdm/tablero'
import { T } from '../tema'
import { AnilloDeCumplimiento, FilaComparada } from './PanelesPrincipales'
import {
  LeyendaDeEstados, LeyendaDeMedida, PistaApilada, descripcionDeReportes, fmt, segmentosDeReportes, useListo,
} from './Piezas'

const ANCHO = 1280
const ALTO = 720

export interface DatosDeLaPresentacion {
  secretaria: string
  anio: number
  anioActual: number
  /** Las cifras de la propia secretaría en ese año. */
  cifras: CifrasDeAnio
  /** Todas las secretarías (la propia incluida) o `null` si la base no las entregó. */
  comparacion: FilaDeComparacion[] | null
  sectores: SectorDeCifras[]
  medida: MedidaDelTablero
  lectura: { titular: Trozo[]; detalle: string }
  corte: string
}

const BOTON = 'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-[#192031] disabled:opacity-40'

// ─── Las láminas ──────────────────────────────────────────────────────────────

/** El marco de una lámina: rótulo, título, cuerpo y pie. Entra con un fundido corto (sin él, aparece de una vez). */
function Lamina({ rotulo, titulo, secretaria, corte, pagina, children, portada = false }: {
  rotulo?: string
  titulo?: string
  secretaria: string
  corte: string
  pagina: string
  children: ReactNode
  portada?: boolean
}) {
  const listo = useListo(20)
  return (
    <div
      className={`absolute inset-0 flex flex-col px-16 py-12 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${listo ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'}`}
    >
      <div className={portada ? 'flex flex-1 flex-col justify-center' : ''}>
        {rotulo && <p className="text-[17px] font-semibold uppercase tracking-[0.16em] text-[#667085]">{rotulo}</p>}
        {titulo && (
          <h2 className={`mt-2 font-semibold leading-[1.12] tracking-tight text-[#192031] [text-wrap:balance] ${portada ? 'max-w-[18ch] text-[68px]' : 'max-w-[26ch] text-[40px]'}`}>{titulo}</h2>
        )}
        {portada && children}
      </div>
      {!portada && <div className="flex min-h-0 flex-1 items-center pb-5 pt-2">{children}</div>}
      <div className="flex shrink-0 items-center justify-between gap-6 border-t border-[#E6E9EF] pt-4 text-[15px] text-[#556072]">
        <span>{secretaria} · Cifras al {corte}</span>
        <span className="tabular-nums">{pagina}</span>
      </div>
    </div>
  )
}

function Cuerpo({ clave, d }: { clave: ClaveDeLamina; d: DatosDeLaPresentacion }) {
  const medible = hayQueMedir(d.cifras, d.anioActual)
  const conReportes = medible
  if (clave === 'portada') {
    return (
      <p className="mt-9 max-w-[44ch] text-[30px] font-medium leading-[1.4] tracking-tight text-[#192031]">
        {d.lectura.titular.map((t, i) => (t.fuerte ? <b key={i} className="font-bold">{t.texto}</b> : <span key={i}>{t.texto}</span>))}
      </p>
    )
  }
  if (clave === 'secretaria') {
    return (
      <div className="grid w-full gap-7">
        <AnilloDeCumplimiento c={d.cifras} anioActual={d.anioActual} nota="llegaron a su meta" tamano="h-[272px] w-[272px]" conDetalle grande />
        <div>
          <p className={`${T.rotulo} mb-3 text-[15px]!`}>Estado de los reportes</p>
          <PistaApilada segmentos={conReportes ? segmentosDeReportes(d.cifras) : []} altura="h-7" descripcion={conReportes ? descripcionDeReportes(d.cifras) : 'Sin reportes que contar'} />
          <LeyendaDeEstados c={conReportes ? d.cifras : { ...d.cifras, aprobados: 0, porValidar: 0, devueltos: 0, faltan: 0, sinResponsable: 0 }} grande />
        </div>
      </div>
    )
  }
  if (clave === 'alcaldia' && d.comparacion) {
    const plan = sumarCifras(d.anio, d.comparacion.map(f => f.cifras))
    const propia = d.comparacion.find(f => f.propia)!
    return (
      <div className="grid w-full gap-9">
        <AnilloDeCumplimiento c={plan} anioActual={d.anioActual} nota="del plan" tamano="h-[320px] w-[320px]" conDetalle={false} grande />
        <p className="max-w-[60ch] text-[22px] leading-snug text-[#556072]">
          {nombreCorto(d.secretaria)} aporta <b className="font-semibold text-[#192031]">{fmt(propia.cifras.conMeta)} de {fmt(plan.conMeta)}</b> indicadores con meta del plan ({pctEntero(propia.cifras.conMeta, plan.conMeta)} %).
        </p>
      </div>
    )
  }
  if (clave === 'comparacion' && d.comparacion) {
    return (
      <div className="w-full">
        <ul className="grid gap-1">
          {d.comparacion.map((f, i) => (
            <FilaComparada key={f.nombre} nombre={nombreCorto(f.nombre)} titulo={f.nombre} cifras={f.cifras} medida={d.medida} propia={f.propia} escalon={i} tag={f.propia ? 'Tú' : undefined} grande />
          ))}
        </ul>
        <LeyendaDeMedida medida={d.medida} grande />
      </div>
    )
  }
  if (clave === 'sectores') {
    return (
      <div className="w-full">
        <ul className="grid gap-1">
          {d.sectores.slice(0, SECTORES_EN_LAMINA).map((s, i) => (
            <FilaComparada key={s.nombre} nombre={s.nombre} cifras={s.cifras} medida={d.medida} escalon={i} grande />
          ))}
        </ul>
        <LeyendaDeMedida medida={d.medida} grande />
      </div>
    )
  }
  return null
}

function tituloDe(clave: ClaveDeLamina, d: DatosDeLaPresentacion): { rotulo?: string; titulo?: string } {
  const plan = d.comparacion ? sumarCifras(d.anio, d.comparacion.map(f => f.cifras)) : d.cifras
  switch (clave) {
    case 'portada': return { rotulo: `Resumen ${d.anio}`, titulo: d.secretaria }
    case 'secretaria': return { rotulo: 'Tu secretaría', titulo: tituloDeCumplimiento(d.cifras, d.anioActual) }
    case 'alcaldia': return { rotulo: 'La Alcaldía', titulo: tituloDelPlan(plan, d.comparacion?.length ?? 1) }
    case 'comparacion': return { rotulo: 'Frente a las otras secretarías', titulo: tituloDeComparacion(d.medida) }
    case 'sectores': return { rotulo: 'Por sector', titulo: tituloDeSectores(d.sectores.length) }
  }
}

// ─── El escenario ─────────────────────────────────────────────────────────────

export default function Presentacion({ datos, onCerrar }: { datos: DatosDeLaPresentacion; onCerrar: () => void }) {
  const laminas = useMemo(() => laminasDeLaPresentacion({ comparacion: datos.comparacion, sectores: datos.sectores }), [datos.comparacion, datos.sectores])
  const [actual, setActual] = useState(0)
  const [escala, setEscala] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLDivElement>(null)
  const siguiente = useRef<HTMLButtonElement>(null)

  const ir = useCallback((n: number) => setActual(Math.max(0, Math.min(laminas.length - 1, n))), [laminas.length])
  const avanzar = useCallback((paso: number) => setActual(a => Math.max(0, Math.min(laminas.length - 1, a + paso))), [laminas.length])

  // La escala: lo más grande que cabe conservando 16:9. Se mide antes de pintar para que no haya un primer cuadro a otro tamaño.
  useLayoutEffect(() => {
    const el = lienzo.current
    if (!el) return
    const medir = () => setEscala(Math.max(0.1, Math.min((el.clientWidth - 24) / ANCHO, (el.clientHeight - 24) / ALTO)))
    medir()
    const o = new ResizeObserver(medir)
    o.observe(el)
    return () => o.disconnect()
  }, [])

  // Pantalla completa si el navegador la concede; si no, la ventana llena. Al salir de la pantalla completa (Esc del navegador), sale.
  useEffect(() => {
    const el = raiz.current
    const alCambiar = () => { if (!document.fullscreenElement) onCerrar() }
    document.addEventListener('fullscreenchange', alCambiar)
    try { el?.requestFullscreen?.()?.catch(() => {}) } catch { /* sin pantalla completa: queda a ventana llena */ }
    const antes = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    siguiente.current?.focus()
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar)
      document.documentElement.style.overflow = antes
      try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) } catch { /* ya salió */ }
    }
  }, [onCerrar])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCerrar(); e.preventDefault() }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { avanzar(1); e.preventDefault() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { avanzar(-1); e.preventDefault() }
      else if (e.key === 'Home') { ir(0); e.preventDefault() }
      else if (e.key === 'End') { ir(laminas.length - 1); e.preventDefault() }
      else if (e.key === 'Tab' && raiz.current) {
        // El foco no se escapa de la presentación: da la vuelta entre sus botones.
        const botones = [...raiz.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
        if (botones.length === 0) return
        const i = botones.indexOf(document.activeElement as HTMLButtonElement)
        const sig = botones[(i + (e.shiftKey ? -1 : 1) + botones.length) % botones.length]
        sig.focus(); e.preventDefault()
      }
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [avanzar, ir, laminas.length, onCerrar])

  const clave = laminas[Math.min(actual, laminas.length - 1)]
  const { rotulo, titulo } = tituloDe(clave, datos)

  return createPortal(
    <div ref={raiz} role="dialog" aria-modal="true" aria-label="Modo presentación" className="fixed inset-0 z-[100] flex flex-col bg-white font-sans text-[#192031]">
      <div className="flex shrink-0 items-center justify-between gap-3 bg-[#192031] px-4 py-2.5 text-xs text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-white text-[11px] font-bold text-[#192031]">CD</span>
          <b className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C9CFDB]">{PLAN.denominacion} · {PLAN.nombre}</b>
        </div>
        <button type="button" onClick={onCerrar} className={`${BOTON} border-[#5B6682] text-white hover:border-white hover:bg-[#2C3753]`}>Salir (Esc)</button>
      </div>

      <div ref={lienzo} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#F4F5F8] p-3">
        <div
          className="relative box-content shrink-0 overflow-hidden rounded-[10px] border border-[#DCE0E8] bg-white"
          style={{ width: ANCHO * escala, height: ALTO * escala, visibility: escala > 0 ? 'visible' : 'hidden' }}
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); avanzar(e.clientX > r.left + r.width / 2 ? 1 : -1) }}
        >
          <div className="absolute left-0 top-0" style={{ width: ANCHO, height: ALTO, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
            <Lamina key={`${clave}-${datos.anio}-${datos.medida}`} rotulo={rotulo} titulo={titulo} secretaria={datos.secretaria} corte={datos.corte} pagina={`${actual + 1} / ${laminas.length}`} portada={clave === 'portada'}>
              <Cuerpo clave={clave} d={datos} />
            </Lamina>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-[#DCE0E8] bg-white px-2 py-2">
        <button type="button" onClick={() => avanzar(-1)} disabled={actual === 0} className={`${BOTON} border-[#C5CBD6] text-[#192031] hover:border-[#192031] focus-visible:ring-[#192031] focus-visible:ring-offset-white`}>Anterior</button>
        <div className="flex gap-1.5" role="group" aria-label="Láminas">
          {laminas.map((l, i) => (
            <button
              key={l} type="button" onClick={() => ir(i)} aria-label={`Lámina ${i + 1}`} aria-current={i === actual ? 'true' : undefined}
              className={`h-2.5 w-2.5 rounded-full transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-2 ${i === actual ? 'scale-125 bg-[#192031]' : 'bg-[#C5CBD6]'}`}
            />
          ))}
        </div>
        <button ref={siguiente} type="button" onClick={() => avanzar(1)} disabled={actual === laminas.length - 1} className={`${BOTON} border-[#192031] bg-[#192031] text-white hover:bg-[#242F45] focus-visible:ring-[#192031] focus-visible:ring-offset-white`}>Siguiente</button>
      </div>
    </div>,
    document.body,
  )
}
