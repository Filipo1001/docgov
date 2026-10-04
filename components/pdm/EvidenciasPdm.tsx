'use client'

/**
 * Evidencias: los indicadores que ya tienen con qué demostrarse, año por año.
 *
 * Es la pantalla de quien supervisa o audita (y de cada responsable con lo suyo). Una lista de archivos no responde
 * ninguna pregunta de comprobación —con miles, menos—: la pregunta es «¿este indicador, este año, tiene respaldo?».
 * Por eso cada fila es un INDICADOR, y lo que lo respalda va dentro:
 *
 *   · Un solo archivo: se muestra el archivo, y un clic lo abre.
 *   · Varios archivos: una carpeta («4 archivos · PDF ×3 · Imagen»); se abre para verlos uno a uno.
 *
 * Los años no se mezclan: se mira un año a la vez, y cada archivo está en el año de su reporte. Los filtros viajan en
 * la dirección (se pueden compartir) y la lista se muestra de a 25 indicadores.
 */

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { HREF_EVIDENCIAS, HREF_INDICADORES } from '@/lib/pdm/menu'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import { describirTamano, type AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import { SITUACIONES } from '@/lib/pdm/seguimiento'
import { ESTADOS_POR_URGENCIA, PALABRA_DE, lineaDeSemaforo } from '@/lib/pdm/semaforo'
import {
  ETIQUETA_CATEGORIA, TAMANO_PAGINA,
  aParametros, hayFiltros, rangoDePagina, resumenDeTipos,
  type ArchivoDeIndicador, type FilaIndicador, type FiltroEvidencias,
} from '@/lib/pdm/evidencias-armar'
import type { Evidencias } from '@/lib/pdm/evidencias'
import EncabezadoSeccion from './EncabezadoSeccion'
import IconoSector from './IconoSector'
import Pagina from './Pagina'
import SelectorAnio from './SelectorAnio'
import { Despliegue } from './Movimiento'
import { Marcador, Sello, SemaforoReporte, SituacionTexto } from './ui'
import { useAbrirEvidencia } from './abrir-evidencia'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import { GLIFO_DE_CATEGORIA } from './iconos-tipo'
import { T } from './tema'

// Cuatro columnas solo desde 1024 px: con menos, la de evidencia queda de ~180 px y, dentro de una carpeta, los sellos y el
// estado de cada archivo no caben y se recortan. Por debajo, la fila se apila.
const COLUMNAS = 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.35fr)_9.5rem_11.5rem]'

const GLIFO = GLIFO_DE_CATEGORIA

/** El chip de un filtro: el mismo de las listas de indicadores. */
const claseChip = (activo: boolean) =>
  `shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031] focus-visible:ring-offset-1 ${
    activo
      ? 'border-[#192031] bg-[#192031] text-white'
      : 'border-[#C5CBD6] bg-white text-[#4A5568] hover:border-[#192031] hover:text-[#192031]'
  }`

/** Cuántos indicadores se nombran en «También respalda a…» antes de «y N más». */
const MAX_TAMBIEN = 3

/** Un archivo: su nombre (un clic lo abre), su tipo y tamaño, y lo que le pasó. */
function ArchivoLinea({ a, abrir, abriendo, conEstado }: {
  a: ArchivoDeIndicador
  abrir: (id: string) => void
  abriendo: boolean
  /** Se dice cómo va el reporte de ESTE archivo (cuando la carpeta junta reportes que van distinto). */
  conEstado: boolean
}) {
  const etiqueta = a.categoria ? ETIQUETA_CATEGORIA[a.categoria] : 'Archivo'
  return (
    <div className="min-w-0">
      <button
        onClick={() => abrir(a.id)}
        disabled={abriendo}
        // `w-full`: un botón no se estira solo a su celda, y sin eso el nombre largo no se recorta y pisa la columna de al lado.
        className="group flex w-full min-w-0 items-start gap-3 text-left focus-visible:outline-none disabled:opacity-60"
      >
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#EDF0F5] text-[#192031] transition-colors group-hover:bg-[#E1E6EE] group-focus-visible:ring-2 group-focus-visible:ring-[#192031]">
          <Icono glifo={a.categoria ? GLIFO[a.categoria] : Iconos.documentos.adjunto} tamano="md" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[#192031] group-hover:underline" title={a.nombre}>{a.nombre}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085]">
            <span className="tabular-nums">{etiqueta} · {describirTamano(a.bytes)}</span>
            {a.conservada && <Sello>Conservada</Sello>}
            {conEstado && a.estado && <SituacionTexto situacion={a.estado} />}
          </span>
        </span>
      </button>
      {a.observacion && (
        <p className="mt-1.5 flex items-start gap-1.5 pl-12 text-xs leading-snug text-[#912018]">
          <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-px shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]"><b>Devuelto:</b> «{a.observacion}»</span>
        </p>
      )}
      {a.tambien.length > 0 && (
        <div className="mt-1.5 pl-12 text-xs text-[#667085]">
          <p>También respalda a {a.tambien.length === 1 ? 'otro indicador' : `otros ${a.tambien.length} indicadores`} de {a.tambien[0].anio}:</p>
          <ul className="mt-0.5 space-y-0.5">
            {a.tambien.slice(0, MAX_TAMBIEN).map(t => (
              <li key={t.indicadorFila} className="min-w-0 truncate">
                <Link href={`${HREF_INDICADORES}?abrir=${t.indicadorFila}&anio=${t.anio}`} className="text-[#2D3648] underline decoration-[#C5CBD6] underline-offset-2 transition-colors hover:text-[#192031] hover:decoration-[#192031]" title={t.indicador}>
                  <span className="tabular-nums">{t.codigo}</span> · {t.indicador}
                </Link>
              </li>
            ))}
            {a.tambien.length > MAX_TAMBIEN && <li>y {a.tambien.length - MAX_TAMBIEN} más</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Varios archivos de un indicador, juntos: una carpeta. Cerrada dice cuántos son, de qué tipo y si alguno se devolvió;
 * abierta (con un clic) muestra cada archivo.
 */
function Carpeta({ fila, abrir, abriendo }: { fila: FilaIndicador; abrir: (id: string) => void; abriendo: boolean }) {
  const [abierta, setAbierta] = useState(false)
  const id = useId()
  const n = fila.archivos.length
  const devueltos = fila.archivos.filter(a => a.observacion !== null).length
  // Si la carpeta junta reportes distintos (un avance aprobado y otro por validar, por ejemplo), cada archivo dice el suyo.
  const variosReportes = new Set(fila.archivos.map(a => a.reporteId)).size > 1
  return (
    <div className="min-w-0">
      <button
        onClick={() => setAbierta(v => !v)}
        aria-expanded={abierta}
        aria-controls={id}
        className="group flex w-full min-w-0 items-center gap-3 text-left focus-visible:outline-none"
      >
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#EDF0F5] text-[#192031] transition-colors group-hover:bg-[#E1E6EE] group-focus-visible:ring-2 group-focus-visible:ring-[#192031]">
          <Icono glifo={Iconos.documentos.expediente} tamano="md" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-[#192031] group-hover:underline">{n} archivos</span>
          <span className="mt-0.5 block truncate text-xs text-[#667085]">
            {resumenDeTipos(fila.archivos)}
            {devueltos > 0 && <span className="font-medium text-[#912018]"> · {devueltos === 1 ? '1 devuelto' : `${devueltos} devueltos`}</span>}
          </span>
        </span>
        <Icono glifo={Iconos.accion.desplegar} tamano="sm" className={`shrink-0 text-[#667085] transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`} />
      </button>
      <div id={id}>
        <Despliegue abierto={abierta} separacion="pb-1">
          <ul className="ml-[18px] mt-3 space-y-3.5 border-l border-[#C5CBD6] pl-4">
            {fila.archivos.map(a => (
              <li key={a.id}>
                <ArchivoLinea a={a} abrir={abrir} abriendo={abriendo} conEstado={variosReportes} />
              </li>
            ))}
          </ul>
        </Despliegue>
      </div>
    </div>
  )
}

/** Un indicador, con lo que lo respalda ese año. */
function FilaDeIndicador({ fila, abrir, abriendo }: { fila: FilaIndicador; abrir: (id: string) => void; abriendo: boolean }) {
  return (
    <li className={`grid grid-cols-1 gap-x-4 gap-y-3 px-4 py-4 sm:px-5 ${COLUMNAS} lg:items-start`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <IconoSector sector={fila.sector} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-snug text-[#192031] [overflow-wrap:anywhere]">
            <span className="font-semibold tabular-nums text-[#667085]">{fila.codigo}</span> · {fila.indicador}
          </p>
          <p className="mt-0.5 truncate text-xs text-[#667085]">{fila.dependencia}</p>
          <Link href={`${HREF_INDICADORES}?abrir=${fila.indicadorFila}&anio=${fila.anio}`} className={`mt-0.5 inline-block text-xs ${T.enlace}`}>
            Ver indicador
          </Link>
        </div>
      </div>

      <div className="min-w-0">
        {fila.archivos.length === 0 ? (
          <p className="text-xs text-[#667085]">Sin archivos este año.</p>
        ) : fila.archivos.length === 1 ? (
          <ArchivoLinea a={fila.archivos[0]} abrir={abrir} abriendo={abriendo} conEstado={false} />
        ) : (
          <Carpeta fila={fila} abrir={abrir} abriendo={abriendo} />
        )}
      </div>

      {/* Apiladas, «Reportó» y el estado van lado a lado; con cuatro columnas (`lg:contents`) cada una vuelve a ser su celda. */}
      <div className="flex flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4 lg:contents">
        <div className="min-w-0 text-xs leading-snug">
          <p className="truncate font-medium text-[#192031]">{fila.autor}</p>
          <p className="mt-0.5 text-[#667085]">{fila.reportadoEn ? fechaHoraBogota(fila.reportadoEn) : ''}</p>
        </div>

        <div className="min-w-0">
          {fila.estado && (
            <SemaforoReporte
              estado={fila.estado}
              linea={lineaDeSemaforo(fila.estado, { autor: fila.autor, dependencia: fila.dependencia, validador: fila.validador })}
            />
          )}
        </div>
      </div>
    </li>
  )
}

export default function EvidenciasPdm({ filtro, datos, dependencias, anioActual, acciones = ACCIONES_SEGUIMIENTO_REALES, base = HREF_EVIDENCIAS }: {
  filtro: FiltroEvidencias
  datos: Evidencias
  /** Las secretarías entre las que se puede elegir (solo se ofrece el selector si hay más de una). */
  dependencias: string[]
  /** El año de hoy: dice cuál de los años del plan está en curso. */
  anioActual: number
  acciones?: Pick<AccionesSeguimiento, 'urlEvidencia'>
  /** La ruta de esta pantalla (las pruebas la apuntan a otra). */
  base?: string
}) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [texto, setTexto] = useState(filtro.q)
  const { abrir, abriendo, error } = useAbrirEvidencia(acciones)
  const filtroRef = useRef(filtro)
  useEffect(() => { filtroRef.current = filtro })
  const lista = useRef<HTMLElement>(null)

  /**
   * Cambia filtros: vuelve a la primera página (salvo que el cambio sea de página).
   *
   * Sin `scroll`: por defecto `router.push` sube la pantalla al inicio, y quien filtra o pasa de página estando abajo
   * veía la pantalla dar un salto. Al cambiar de PÁGINA sí se lleva, con suavidad, al inicio de la lista; al filtrar,
   * la persona se queda donde estaba.
   */
  function ir(cambios: Partial<FiltroEvidencias>) {
    const siguiente = { ...filtroRef.current, pagina: 1, ...cambios }
    empezar(() => router.push(`${base}?${aParametros(siguiente)}`, { scroll: false }))
    if (cambios.pagina !== undefined) lista.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    if (texto.trim() === filtroRef.current.q) return
    const t = setTimeout(() => {
      const siguiente = { ...filtroRef.current, pagina: 1, q: texto.trim() }
      empezar(() => router.push(`${base}?${aParametros(siguiente)}`, { scroll: false }))
    }, 450)
    return () => clearTimeout(t)
  }, [texto, router, base])

  const { desde, hasta, paginas } = rangoDePagina(datos.pagina, datos.total)
  const filtrado = hayFiltros(filtro)

  return (
    <Pagina>
      <EncabezadoSeccion
        titulo="Evidencias"
        detalle="Los indicadores que ya tienen con qué demostrarse"
        datos={[
          { rotulo: 'Indicadores', valor: datos.ok ? String(datos.total) : '—' },
          { rotulo: 'Año', valor: String(filtro.anio) },
        ]}
      />

      {/* Un año a la vez: los años no se mezclan. */}
      <SelectorAnio anio={filtro.anio} anioActual={anioActual} onCambiar={a => ir({ anio: a })} />

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Buscar por indicador o por nombre de archivo</span>
          <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            id="pdm-evidencias-busqueda"
            type="search"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar por indicador, código o nombre del archivo"
            className={`${T.campo} pl-10`}
          />
        </label>

        {/* Cada color es un filtro, con cuántos indicadores hay en él. Cuentan con la secretaría y la búsqueda puestas, pero sin el
            estado elegido: así se ve cuántos habría al pasar de uno a otro. */}
        <div role="group" aria-label="Filtrar por estado del reporte" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          <button
            id="pdm-evidencias-estado-todos"
            onClick={() => ir({ estado: null })}
            aria-pressed={filtro.estado === null}
            className={claseChip(filtro.estado === null)}
          >
            Todos <span className="ml-1 tabular-nums opacity-70">{datos.conteo.devuelto + datos.conteo.pendiente + datos.conteo.aprobado}</span>
          </button>
          {ESTADOS_POR_URGENCIA.map(e => (
            <button
              key={e}
              id={`pdm-evidencias-estado-${e}`}
              onClick={() => ir({ estado: filtro.estado === e ? null : e })}
              aria-pressed={filtro.estado === e}
              className={`${claseChip(filtro.estado === e)} inline-flex items-center gap-1.5`}
            >
              <Marcador clase={SITUACIONES[e].punto} />
              {PALABRA_DE[e]} <span className="tabular-nums opacity-70">{datos.conteo[e]}</span>
            </button>
          ))}
        </div>

        {dependencias.length > 1 && (
          <label className="block sm:max-w-xs">
            <span className={T.rotulo}>Secretaría</span>
            <select id="pdm-evidencias-dependencia" value={filtro.dependencia ?? ''} onChange={e => ir({ dependencia: e.target.value || null })} className={`${T.campo} mt-1.5`}>
              <option value="">Todas</option>
              {dependencias.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        )}

        {filtrado && (
          <p className="text-right">
            <Link href={`${base}?anio=${filtro.anio}`} className={`text-xs ${T.enlace}`}>Quitar los filtros</Link>
          </p>
        )}
      </div>

      {error && <p role="alert" className={T.avisoMal}>{error}</p>}

      {!datos.ok ? (
        <p role="alert" className={T.avisoMal}>
          No se pudieron leer las evidencias. Recarga la página; si sigue igual, avisa a quien administra la plataforma.
        </p>
      ) : datos.total === 0 ? (
        <div className="rounded-lg border border-dashed border-[#C5CBD6] bg-white px-6 py-12 text-center">
          <p className={`text-sm font-medium ${T.tinta}`}>
            {filtrado ? 'Ningún indicador coincide con lo que buscas.' : `Ningún indicador tiene evidencias en ${filtro.anio}.`}
          </p>
          <p className={`mt-1 text-xs ${T.tenue}`}>
            {filtrado ? 'Prueba con otra palabra o quita algún filtro.' : 'Aparecerán aquí cuando alguien reporte un avance con sus archivos.'}
          </p>
        </div>
      ) : (
        <>
          {/* Con otros resultados (otro año, otro filtro u otra página) la lista se vuelve a montar y llega con el cruce suave de siempre. */}
          <section
            ref={lista}
            key={`${filtro.anio}|${filtro.q}|${filtro.estado}|${filtro.dependencia}|${datos.pagina}`}
            className={`pdm-entra scroll-mt-24 overflow-hidden ${T.panel} transition-opacity ${pendiente ? 'opacity-60' : ''}`}
            aria-busy={pendiente}
          >
            <div className={`hidden gap-x-4 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 lg:grid ${COLUMNAS}`}>
              <span className={T.rotulo}>Indicador</span>
              <span className={T.rotulo}>Evidencia</span>
              <span className={T.rotulo}>Reportó</span>
              <span className={T.rotulo}>Estado del reporte</span>
            </div>
            <ul className={`divide-y ${T.divide}`}>
              {datos.filas.map(f => <FilaDeIndicador key={`${f.indicadorFila}:${f.anio}`} fila={f} abrir={abrir} abriendo={abriendo !== null} />)}
            </ul>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#667085]">
            <span>
              Mostrando <b className="tabular-nums text-[#192031]">{desde}–{hasta}</b> de <b className="tabular-nums text-[#192031]">{datos.total}</b> {datos.total === 1 ? 'indicador' : 'indicadores'}
              {datos.total > TAMANO_PAGINA && <> · página <span className="tabular-nums">{datos.pagina}</span> de <span className="tabular-nums">{paginas}</span></>}
            </span>
            {paginas > 1 && (
              <div className="flex gap-2">
                <button id="pdm-evidencias-anterior" onClick={() => ir({ pagina: datos.pagina - 1 })} disabled={datos.pagina <= 1 || pendiente} className={T.botonSecChico}>
                  <Icono glifo={Iconos.accion.retroceder} tamano="sm" />Anterior
                </button>
                <button id="pdm-evidencias-siguiente" onClick={() => ir({ pagina: datos.pagina + 1 })} disabled={datos.pagina >= paginas || pendiente} className={T.botonSecChico}>
                  Siguiente<Icono glifo={Iconos.accion.avanzar} tamano="sm" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Pagina>
  )
}
