'use client'

/**
 * Evidencias: todos los archivos que respaldan los reportes, en una lista que se puede recorrer.
 *
 * Es la pantalla de quien supervisa o audita (y de cada responsable con lo suyo): sin entrar indicador por
 * indicador, se ve qué se subió, de quién, de qué reporte y cómo va ese reporte. Un clic abre el archivo; el enlace
 * «Ver indicador» lleva a su ficha. Los filtros viajan en la dirección (se pueden compartir) y la lista se pide a
 * la base de a 25.
 *
 * Por defecto se ven los archivos de las versiones VIGENTES de cada reporte: lo de un reporte ya corregido es
 * historia, y lo que se conservó ya está en la versión nueva, así que mostrarlo repetiría los mismos archivos.
 */

import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { HREF_EVIDENCIAS, HREF_INDICADORES } from '@/lib/pdm/menu'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import { ANIOS_PLAN } from '@/lib/pdm/seguimiento'
import { describirTamano, type AccionesSeguimiento } from '@/lib/pdm/seguimiento-acciones'
import {
  CATEGORIAS, ESTADOS_FILTRO, ETIQUETA_CATEGORIA, ROTULO_CATEGORIA, ROTULO_ESTADO_FILTRO, TAMANO_PAGINA,
  agrupar, aParametros, hayFiltros, rangoDePagina,
  type CategoriaTipo, type FiltroEvidencias, type GrupoEvidencia, type IndicadorRelacionado,
} from '@/lib/pdm/evidencias-armar'
import type { Evidencias } from '@/lib/pdm/evidencias'
import Pagina from './Pagina'
import EncabezadoSeccion from './EncabezadoSeccion'
import IconoSector from './IconoSector'
import { Sello, SituacionTexto } from './ui'
import { useAbrirEvidencia } from './abrir-evidencia'
import { ACCIONES_SEGUIMIENTO_REALES } from './acciones-seguimiento-reales'
import { T } from './tema'

const COLUMNAS = 'md:grid-cols-[minmax(0,1.25fr)_minmax(0,1.3fr)_10rem_11.5rem]'

const GLIFO: Record<CategoriaTipo, typeof Iconos.documentos.adjunto> = {
  pdf: Iconos.documentos.archivoPdf,
  word: Iconos.documentos.archivoWord,
  imagen: Iconos.documentos.archivoImagen,
  excel: Iconos.documentos.archivoHoja,
}

/** Cuántos indicadores se ven antes de «Ver los N restantes». */
const VISIBLES = 3

/** Un indicador con su icono de sector, su secretaría y año, y —si ese archivo se devolvió— por qué. */
function IndicadorDelArchivo({ l }: { l: IndicadorRelacionado }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <IconoSector sector={l.sector} />
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm leading-snug text-[#192031] [overflow-wrap:anywhere]">
          <span className="font-semibold tabular-nums text-[#667085]">{l.codigo}</span> · {l.indicador}
        </p>
        <p className="mt-0.5 truncate text-xs text-[#667085]">{l.dependencia} · {l.anio}</p>
        {l.observacion && (
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-[#912018]">
            <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-px shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]"><b>Devuelto:</b> «{l.observacion}»</span>
          </p>
        )}
        <Link href={`${HREF_INDICADORES}?abrir=${l.indicadorFila}&anio=${l.anio}`} className={`mt-0.5 inline-block text-xs ${T.enlace}`}>
          Ver indicador
        </Link>
      </div>
    </div>
  )
}

/**
 * Un documento y los indicadores a los que sirve.
 *
 * Una fila por DOCUMENTO: a la izquierda el archivo (una sola celda, que abarca todas las sub-filas), a la derecha
 * cada indicador al que sirve en su propia sub-fila, alineada con las columnas de la tabla —indicador, quién lo
 * reportó, cómo va ese reporte—, porque autor, fecha y estado son del reporte de CADA indicador. Si el mismo
 * archivo se subió por separado en varios reportes (que es como hoy un archivo llega a varios indicadores), aquí
 * es una sola fila con tantas sub-filas como indicadores: «Respalda a 3 indicadores» y se ven los tres.
 *
 * Con más de tres indicadores se pliega («Ver los N restantes»). En una pantalla estrecha las sub-filas se apilan.
 */
function FilaDocumento({ g, abrir, abriendo }: { g: GrupoEvidencia; abrir: (id: string) => void; abriendo: boolean }) {
  const f = g.archivo
  const [desplegado, setDesplegado] = useState(false)
  const n = g.lineas.length
  const visibles = desplegado ? g.lineas : g.lineas.slice(0, VISIBLES)
  const ocultos = n - visibles.length
  const conPie = ocultos > 0 || (desplegado && n > VISIBLES)
  // Filas de la rejilla que ocupa el archivo: el rótulo (si hay varios), cada indicador y el botón de plegar.
  const filas = visibles.length + (n > 1 ? 1 : 0) + (conPie ? 1 : 0)
  const etiqueta = f.categoria ? ETIQUETA_CATEGORIA[f.categoria] : 'Archivo'

  return (
    <li
      style={{ '--n': filas } as CSSProperties}
      className={`grid grid-cols-1 gap-x-4 px-4 py-3.5 sm:px-5 ${COLUMNAS} md:[grid-template-rows:repeat(var(--n),auto)]`}
    >
      <div className="min-w-0 md:col-start-1 md:[grid-row:1/span_var(--n)] md:self-center">
        <button
          onClick={() => abrir(f.id)}
          disabled={abriendo}
          // `w-full`: un botón no se estira solo a su celda, y sin eso el nombre largo no se recorta y pisa la columna de al lado.
          className="group flex w-full min-w-0 items-start gap-3 text-left focus-visible:outline-none disabled:opacity-60"
        >
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#EDF0F5] text-[#192031] transition-colors group-hover:bg-[#E1E6EE] group-focus-visible:ring-2 group-focus-visible:ring-[#192031]">
            <Icono glifo={f.categoria ? GLIFO[f.categoria] : Iconos.documentos.adjunto} tamano="md" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-[#192031] group-hover:underline" title={f.nombre}>{f.nombre}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085]">
              <span className="tabular-nums">{etiqueta} · {describirTamano(f.bytes)}</span>
              {n > 1 && <Sello>En {n} indicadores</Sello>}
            </span>
          </span>
        </button>
      </div>

      {n > 1 && (
        <p className="mt-3 text-xs font-semibold text-[#192031] md:col-span-3 md:mt-0 md:pb-2">Respalda a {n} indicadores</p>
      )}

      {visibles.map((l, k) => (
        <div
          key={`${l.indicadorFila}:${l.anio}`}
          className={`grid min-w-0 gap-x-4 gap-y-2 py-3 md:col-span-3 md:grid-cols-subgrid md:items-center ${n > 1 || k > 0 ? 'border-t border-[#E6E9EF]' : ''} ${k >= VISIBLES ? 'pdm-entra' : ''} ${n === 1 ? 'first:pt-0 last:pb-0' : ''}`}
        >
          <IndicadorDelArchivo l={l} />
          <div className="min-w-0 text-xs leading-snug">
            <p className="truncate font-medium text-[#192031]">{l.autor}</p>
            <p className="mt-0.5 text-[#667085]">{fechaHoraBogota(l.reportadoEn)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {l.estado && <SituacionTexto situacion={l.estado} />}
            {l.conservada && <Sello>Conservada</Sello>}
            {l.reemplazada && <Sello>Versión anterior</Sello>}
          </div>
        </div>
      ))}

      {conPie && (
        <div className="border-t border-[#E6E9EF] pt-2.5 md:col-span-3">
          <button
            onClick={() => setDesplegado(v => !v)}
            aria-expanded={desplegado}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#192031] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192031]"
          >
            {desplegado ? 'Ver menos' : `Ver los ${ocultos} restantes`}
            <Icono glifo={Iconos.accion.desplegar} tamano="sm" className={`transition-transform duration-200 ${desplegado ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
    </li>
  )
}

export default function EvidenciasPdm({ filtro, datos, dependencias, acciones = ACCIONES_SEGUIMIENTO_REALES, base = HREF_EVIDENCIAS }: {
  filtro: FiltroEvidencias
  datos: Evidencias
  /** Las secretarías entre las que se puede elegir (solo se ofrece el selector si hay más de una). */
  dependencias: string[]
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
   * veía la pantalla dar un salto. Al cambiar de PÁGINA sí se lleva, con suavidad, al inicio de la lista (los archivos
   * nuevos empiezan ahí); al filtrar, la persona se queda donde estaba.
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
  // Los archivos que son el mismo documento se muestran juntos, en una sola fila con sus indicadores.
  const grupos = agrupar(datos.filas)
  const hayJuntos = grupos.length < datos.filas.length

  return (
    <Pagina>
      <EncabezadoSeccion
        titulo="Evidencias"
        detalle="Los archivos que respaldan cada reporte"
        datos={[
          { rotulo: 'Archivos', valor: datos.ok ? String(datos.total) : '—' },
          { rotulo: 'Año', valor: filtro.anio ? String(filtro.anio) : 'Todos' },
        ]}
      />

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Buscar por archivo o indicador</span>
          <Icono glifo={Iconos.accion.buscar} tamano="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            id="pdm-evidencias-busqueda"
            type="search"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar por nombre del archivo o por indicador"
            className={`${T.campo} pl-10`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className="block">
            <span className={T.rotulo}>Año</span>
            <select id="pdm-evidencias-anio" value={filtro.anio ?? ''} onChange={e => ir({ anio: e.target.value ? Number(e.target.value) : null })} className={`${T.campo} mt-1.5`}>
              <option value="">Todos</option>
              {ANIOS_PLAN.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={T.rotulo}>Tipo</span>
            <select id="pdm-evidencias-tipo" value={filtro.tipo ?? ''} onChange={e => ir({ tipo: (CATEGORIAS.find(c => c === e.target.value) ?? null) })} className={`${T.campo} mt-1.5`}>
              <option value="">Todos</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={T.rotulo}>Estado</span>
            <select id="pdm-evidencias-estado" value={filtro.estado ?? ''} onChange={e => ir({ estado: (ESTADOS_FILTRO.find(s => s === e.target.value) ?? null) })} className={`${T.campo} mt-1.5`}>
              <option value="">Todos</option>
              {ESTADOS_FILTRO.map(s => <option key={s} value={s}>{ROTULO_ESTADO_FILTRO[s]}</option>)}
            </select>
          </label>
          {dependencias.length > 1 && (
            <label className="block">
              <span className={T.rotulo}>Secretaría</span>
              <select id="pdm-evidencias-dependencia" value={filtro.dependencia ?? ''} onChange={e => ir({ dependencia: e.target.value || null })} className={`${T.campo} mt-1.5`}>
                <option value="">Todas</option>
                {dependencias.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <label className="-my-1.5 flex cursor-pointer items-center gap-2 py-1.5 text-sm text-[#4A5568]">
            <input
              id="pdm-evidencias-historico"
              type="checkbox"
              checked={filtro.historico}
              onChange={e => ir({ historico: e.target.checked })}
              className="h-4 w-4 accent-[#192031]"
            />
            Incluir versiones anteriores
          </label>
          {filtrado && (
            <Link href={base} className={`text-xs ${T.enlace}`}>Quitar los filtros</Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className={T.avisoMal}>{error}</p>}

      {!datos.ok ? (
        <p role="alert" className={T.avisoMal}>
          No se pudieron leer las evidencias. Recarga la página; si sigue igual, avisa a quien administra la plataforma.
        </p>
      ) : datos.total === 0 ? (
        <div className="rounded-lg border border-dashed border-[#C5CBD6] bg-white px-6 py-12 text-center">
          <p className={`text-sm font-medium ${T.tinta}`}>
            {filtrado ? 'Ningún archivo coincide con lo que buscas.' : 'Todavía no hay evidencias.'}
          </p>
          <p className={`mt-1 text-xs ${T.tenue}`}>
            {filtrado ? 'Prueba con otra palabra o quita algún filtro.' : 'Aparecerán aquí cuando alguien reporte un avance con sus archivos.'}
          </p>
        </div>
      ) : (
        <>
          {/* Con otros resultados (otro filtro u otra página) la lista se vuelve a montar y llega con el cruce suave de siempre. */}
          <section
            ref={lista}
            key={`${filtro.q}|${filtro.anio}|${filtro.tipo}|${filtro.estado}|${filtro.dependencia}|${filtro.historico}|${datos.pagina}`}
            className={`pdm-entra scroll-mt-24 overflow-hidden ${T.panel} transition-opacity ${pendiente ? 'opacity-60' : ''}`}
            aria-busy={pendiente}
          >
            <div className={`hidden gap-x-4 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 md:grid ${COLUMNAS}`}>
              <span className={T.rotulo}>Archivo</span>
              <span className={T.rotulo}>Respalda a</span>
              <span className={T.rotulo}>Reportó</span>
              <span className={T.rotulo}>Estado del reporte</span>
            </div>
            <ul className={`divide-y ${T.divide}`}>
              {grupos.map(g => <FilaDocumento key={g.archivo.id} g={g} abrir={abrir} abriendo={abriendo !== null} />)}
            </ul>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#667085]">
            <span>
              Mostrando <b className="tabular-nums text-[#192031]">{desde}–{hasta}</b> de <b className="tabular-nums text-[#192031]">{datos.total}</b> {datos.total === 1 ? 'archivo' : 'archivos'}
              {datos.total > TAMANO_PAGINA && <> · página <span className="tabular-nums">{datos.pagina}</span> de <span className="tabular-nums">{paginas}</span></>}
              {hayJuntos && <> · lo que es el mismo documento se muestra junto</>}
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
