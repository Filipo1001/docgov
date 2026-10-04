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

import { useEffect, useRef, useState, useTransition } from 'react'
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
  aParametros, hayFiltros, rangoDePagina,
  type CategoriaTipo, type EvidenciaFila, type FiltroEvidencias,
} from '@/lib/pdm/evidencias-armar'
import type { Evidencias } from '@/lib/pdm/evidencias'
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

function Fila({ f, abrir, abriendo }: { f: EvidenciaFila; abrir: (id: string) => void; abriendo: boolean }) {
  const etiqueta = f.categoria ? ETIQUETA_CATEGORIA[f.categoria] : 'Archivo'
  return (
    <li className={`grid grid-cols-1 gap-x-4 gap-y-2.5 px-4 py-3.5 sm:px-5 ${COLUMNAS} md:items-center`}>
      <button
        onClick={() => abrir(f.id)}
        disabled={abriendo}
        className="group flex min-w-0 items-start gap-3 text-left focus-visible:outline-none disabled:opacity-60"
      >
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#EDF0F5] text-[#192031] transition-colors group-hover:bg-[#E1E6EE] group-focus-visible:ring-2 group-focus-visible:ring-[#192031]">
          <Icono glifo={f.categoria ? GLIFO[f.categoria] : Iconos.documentos.adjunto} tamano="md" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[#192031] group-hover:underline" title={f.nombre}>{f.nombre}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#667085]">
            <span className="tabular-nums">{etiqueta} · {describirTamano(f.bytes)}</span>
            {f.conservada && <Sello>Conservada</Sello>}
            {f.reemplazada && <Sello>Versión anterior</Sello>}
          </span>
          {f.observacion && (
            <span className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-[#912018]">
              <Icono glifo={Iconos.estado.advertencia} tamano="sm" className="mt-px shrink-0" />
              <span><b>Devuelto:</b> «{f.observacion}»</span>
            </span>
          )}
        </span>
      </button>

      <div className="flex min-w-0 items-start gap-2.5">
        <IconoSector sector={f.sector} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-snug text-[#192031]">
            <span className="font-semibold tabular-nums text-[#667085]">{f.codigo}</span> · {f.indicador}
          </p>
          <p className="mt-0.5 truncate text-xs text-[#667085]">{f.dependencia} · {f.anio}</p>
          <Link href={`${HREF_INDICADORES}?abrir=${f.indicadorFila}&anio=${f.anio}`} className={`mt-0.5 inline-block text-xs ${T.enlace}`}>
            Ver indicador
          </Link>
        </div>
      </div>

      <div className="min-w-0 text-xs leading-snug">
        <p className="truncate font-medium text-[#192031]">{f.autor}</p>
        <p className="mt-0.5 text-[#667085]">{fechaHoraBogota(f.reportadoEn)}</p>
      </div>

      <div>{f.estado && <SituacionTexto situacion={f.estado} />}</div>
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

  /** Cambia filtros: vuelve a la primera página (salvo que el cambio sea de página). */
  function ir(cambios: Partial<FiltroEvidencias>) {
    const siguiente = { ...filtroRef.current, pagina: 1, ...cambios }
    empezar(() => router.push(`${base}?${aParametros(siguiente)}`))
  }

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    if (texto.trim() === filtroRef.current.q) return
    const t = setTimeout(() => {
      const siguiente = { ...filtroRef.current, pagina: 1, q: texto.trim() }
      empezar(() => router.push(`${base}?${aParametros(siguiente)}`))
    }, 450)
    return () => clearTimeout(t)
  }, [texto, router, base])

  const { desde, hasta, paginas } = rangoDePagina(datos.pagina, datos.total)
  const filtrado = hayFiltros(filtro)

  return (
    <div className="mx-auto max-w-7xl space-y-5">
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
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#4A5568]">
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
          <section className={`overflow-hidden ${T.panel} transition-opacity ${pendiente ? 'opacity-60' : ''}`} aria-busy={pendiente}>
            <div className={`hidden gap-x-4 border-b ${T.regla} bg-[#F7F8FA] px-5 py-2 md:grid ${COLUMNAS}`}>
              <span className={T.rotulo}>Archivo</span>
              <span className={T.rotulo}>Indicador</span>
              <span className={T.rotulo}>Reportó</span>
              <span className={T.rotulo}>Estado del reporte</span>
            </div>
            <ul className={`divide-y ${T.divide}`}>
              {datos.filas.map(f => <Fila key={f.id} f={f} abrir={abrir} abriendo={abriendo !== null} />)}
            </ul>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#667085]">
            <span>
              Mostrando <b className="tabular-nums text-[#192031]">{desde}–{hasta}</b> de <b className="tabular-nums text-[#192031]">{datos.total}</b>
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
    </div>
  )
}
