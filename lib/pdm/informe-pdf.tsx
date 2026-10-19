/**
 * El INFORME en PDF del tablero del secretario: una hoja A4 apaisada (y, si se pide, una hoja con el equipo por nombre).
 *
 * Solo PINTA lo que arma `armarInforme` (`lib/pdm/informe.ts`, con sus pruebas): aquí no se calcula nada. Mismas reglas que la
 * pantalla: cada año contra su meta, solo cuenta lo aprobado, «—» y no «0 %» mientras nadie tenga avance validado, las secretarías
 * por tamaño y de las otras solo números.
 *
 * Es un documento para llevar a una reunión o adjuntar a un correo: sin movimiento, sin dependencia de pantalla, y por defecto
 * sin un solo nombre de persona.
 */

import React from 'react'
import { Circle, ClipPath, Defs, Document, G, Line, Page, Path, Rect, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import { ROTULO_DE_PARTE } from './graficos'
import { SECTORES_EN_INFORME, inicialesDe, lecturaDelPlan, type DatosDelInforme, type PersonaDelInforme } from './informe'
import { PLAN } from './identidad'
import {
  ESTADOS_DE_REPORTE, TRAMOS_DE_CUMPLIMIENTO, centroDeAnillo, hayQueMedir, nombreCorto, pctEntero, textoDeFila, valorDeTramo,
  type CifrasDeAnio, type EstadoDeReporte, type MedidaDelTablero, type TramoDeCumplimiento,
} from './tablero'
import { TRAMOS } from '@/components/pdm/cumplimiento-tema'

const TINTA = '#192031'
const SUAVE = '#556072'
const TENUE = '#667085'
const LINEA = '#DCE0E8'
const REGLA = '#E6E9EF'
const PAGINA = '#F4F5F8'
const MARGEN = 34
const ANCHO_UTIL = 842 - 2 * MARGEN

const COLOR_DE_ESTADO: Record<EstadoDeReporte, string | null> = { aprobados: '#2E7D5B', porValidar: '#B7791F', devueltos: '#B42318', faltan: null, sinResponsable: null }
const fmt = (n: number): string => Math.round(n).toLocaleString('es-CO')

const s = StyleSheet.create({
  pagina: { fontFamily: 'Helvetica', fontSize: 9, color: TINTA, paddingTop: MARGEN, paddingHorizontal: MARGEN, paddingBottom: 44, backgroundColor: '#FFFFFF' },
  rotulo: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', color: TENUE, marginBottom: 7 },
  negrita: { fontFamily: 'Helvetica-Bold' },
  suave: { color: SUAVE },
})

// ─── Marcas y pistas ──────────────────────────────────────────────────────────

/** El cuadradito de un estado: lleno, hueco (falta reportar) o rayado (sin responsable). */
function Marca({ color, tipo = 'lleno' }: { color?: string; tipo?: 'lleno' | 'hueco' | 'rayado' }) {
  if (tipo === 'rayado') {
    return (
      <Svg width={7} height={7} viewBox="0 0 7 7">
        <Rect x={0} y={0} width={7} height={7} fill="#EEF0F4" stroke="#98A2B3" strokeWidth={0.6} />
        <Line x1={0} y1={7} x2={7} y2={0} stroke="#98A2B3" strokeWidth={0.8} />
        <Line x1={0} y1={3.5} x2={3.5} y2={0} stroke="#98A2B3" strokeWidth={0.8} />
        <Line x1={3.5} y1={7} x2={7} y2={3.5} stroke="#98A2B3" strokeWidth={0.8} />
      </Svg>
    )
  }
  if (tipo === 'hueco') return <View style={{ width: 7, height: 7, borderRadius: 1.5, borderWidth: 1, borderColor: TINTA }} />
  return <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: color }} />
}

const marcaDeEstado = (e: EstadoDeReporte) => <Marca tipo={e === 'faltan' ? 'hueco' : e === 'sinResponsable' ? 'rayado' : 'lleno'} color={COLOR_DE_ESTADO[e] ?? undefined} />

interface Trozo { clave: string; valor: number; color?: string; rayado?: boolean }

/**
 * Una pista apilada: cada trozo mide lo que dice su cifra. Un trozo con algo mide al menos 2 pt (un indicador entre cien no puede
 * desaparecer). «Falta reportar» no pinta nada: deja ver la pista, como en la pantalla.
 */
function Pista({ id, trozos, ancho, alto }: { id: string; trozos: Trozo[]; ancho: number; alto: number }) {
  const total = trozos.reduce((t, x) => t + x.valor, 0)
  const hueco = 1
  const disponible = ancho - hueco * Math.max(0, trozos.filter(t => t.valor > 0).length - 1)
  const brutos = trozos.map(t => (total > 0 && t.valor > 0 ? Math.max(2, (t.valor / total) * disponible) : 0))
  const suma = brutos.reduce((t, x) => t + x, 0)
  const k = suma > disponible && suma > 0 ? disponible / suma : 1
  let x = 0
  const piezas = trozos.map((t, i) => {
    const w = brutos[i] * k
    const el = w > 0 ? { t, x, w } : null
    if (w > 0) x += w + hueco
    return el
  }).filter((p): p is { t: Trozo; x: number; w: number } => p !== null)
  return (
    <Svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}>
      <Defs>
        <ClipPath id={`clip-${id}`}><Rect x={0} y={0} width={ancho} height={alto} rx={2} ry={2} /></ClipPath>
      </Defs>
      <G clipPath={`url(#clip-${id})`}>
        <Rect x={0} y={0} width={ancho} height={alto} fill={REGLA} />
        {piezas.map(({ t, x: px, w }) => (
          t.rayado ? (
            <G key={t.clave}>
              <Rect x={px} y={0} width={w} height={alto} fill="#EEF0F4" />
              {Array.from({ length: Math.ceil((w + alto) / 3) }, (_, n) => (
                <Line key={n} x1={px + n * 3 - alto} y1={alto} x2={px + n * 3} y2={0} stroke="#AEB6C4" strokeWidth={1} />
              ))}
            </G>
          ) : t.color ? <Rect key={t.clave} x={px} y={0} width={w} height={alto} fill={t.color} /> : null
        ))}
      </G>
    </Svg>
  )
}

const trozosDeCumplimiento = (c: CifrasDeAnio): Trozo[] => TRAMOS.map(t => ({ clave: t.clave, valor: valorDeTramo(c, t.clave), color: t.color }))
const trozosDeReportes = (c: CifrasDeAnio): Trozo[] => ESTADOS_DE_REPORTE.map(e => ({ clave: e, valor: c[e], color: COLOR_DE_ESTADO[e] ?? undefined, rayado: e === 'sinResponsable' }))

// ─── El anillo ────────────────────────────────────────────────────────────────

/** El punto de una vuelta (0 = las 12, hacia la derecha) sobre un círculo. */
const punto = (cx: number, cy: number, r: number, vuelta: number) => `${(cx + r * Math.sin(2 * Math.PI * vuelta)).toFixed(3)} ${(cy - r * Math.cos(2 * Math.PI * vuelta)).toFixed(3)}`

/**
 * Un arco como ruta (y no un círculo con guiones): el renderizador de PDF no implementa `stroke-dashoffset` ni parte del círculo
 * donde lo hace un navegador, y una ruta dice exactamente dónde empieza y dónde acaba cada tramo.
 */
function trazoDeArco(cx: number, cy: number, r: number, desde: number, hasta: number): string {
  if (hasta - desde >= 0.9999) return `M ${punto(cx, cy, r, desde)} A ${r} ${r} 0 1 1 ${punto(cx, cy, r, desde + 0.5)} A ${r} ${r} 0 1 1 ${punto(cx, cy, r, desde + 1)}`
  return `M ${punto(cx, cy, r, desde)} A ${r} ${r} 0 ${hasta - desde > 0.5 ? 1 : 0} 1 ${punto(cx, cy, r, hasta)}`
}

function Anillo({ c, anioActual, tamano }: { c: CifrasDeAnio; anioActual: number; tamano: number }) {
  const R = 40, G_ = 11
  const medible = hayQueMedir(c, anioActual)
  const { pct } = centroDeAnillo(c)
  let acum = 0
  const arcos = TRAMOS.map(t => {
    const f = medible && c.conMeta > 0 ? valorDeTramo(c, t.clave) / c.conMeta : 0
    // Una rendija blanca entre tramos (0,8 % de vuelta), como en la pantalla; un tramo solo no la lleva.
    const rendija = f > 0 && f < 1 ? Math.min(0.008, f * 0.4) : 0
    const arco = f > 0
      ? <Path key={t.clave} d={trazoDeArco(50, 50, R, acum, acum + f - rendija)} fill="none" stroke={t.color} strokeWidth={G_} />
      : null
    acum += f
    return arco
  })
  const nota = !medible ? (c.conMeta === 0 ? 'sin metas' : 'año por empezar') : pct === null ? 'sin avances validados' : 'llegaron a su meta'
  return (
    <View style={{ width: tamano, height: tamano }}>
      <Svg width={tamano} height={tamano} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={R} fill="none" stroke={REGLA} strokeWidth={G_} />
        {arcos}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: tamano, height: tamano, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 21, fontFamily: 'Helvetica-Bold' }}>{pct === null ? '—' : `${pct} %`}</Text>
        <Text style={{ fontSize: 6.8, color: SUAVE, textAlign: 'center', marginTop: 2, maxWidth: tamano * 0.52 }}>{nota}</Text>
      </View>
    </View>
  )
}

const ROTULO_TRAMO: Record<TramoDeCumplimiento, string> = { cumplidos: 'Cumplido', parciales: 'En avance', sinAvance: 'Sin avance' }

// ─── Columnas ─────────────────────────────────────────────────────────────────

function ColumnaTuSecretaria({ d, ancho }: { d: DatosDelInforme; ancho: number }) {
  const c = d.cifras
  const medible = hayQueMedir(c, d.anioActual)
  return (
    <View style={{ width: ancho }}>
      <Text style={s.rotulo}>Tu secretaría</Text>
      <View style={{ alignItems: 'center', marginBottom: 9 }}><Anillo c={c} anioActual={d.anioActual} tamano={108} /></View>
      {TRAMOS_DE_CUMPLIMIENTO.map(k => {
        const t = TRAMOS.find(x => x.clave === k)!
        const v = valorDeTramo(c, k)
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3.2 }}>
            <Marca color={t.color} />
            <Text style={{ flex: 1, marginLeft: 6, fontSize: 8.8 }}>{ROTULO_TRAMO[k]}</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', width: 26, textAlign: 'right' }}>{fmt(medible ? v : 0)}</Text>
            <Text style={{ fontSize: 8, color: SUAVE, width: 32, textAlign: 'right' }}>{medible && (c.conAvance > 0 || k === 'sinAvance') ? `${pctEntero(v, c.conMeta)} %` : '—'}</Text>
          </View>
        )
      })}
      <View style={{ borderTopWidth: 0.5, borderTopColor: REGLA, marginTop: 8, paddingTop: 8 }}>
        <Text style={s.rotulo}>Estado de los reportes</Text>
        <Pista id="estado-propio" trozos={medible ? trozosDeReportes(c) : []} ancho={ancho} alto={8} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
          {ESTADOS_DE_REPORTE.map(e => (
            <View key={e} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 9, marginBottom: 3 }}>
              {marcaDeEstado(e)}
              <Text style={{ fontSize: 7.4, color: SUAVE, marginLeft: 3 }}>{ROTULO_DE_PARTE[e]} </Text>
              <Text style={{ fontSize: 7.6, fontFamily: 'Helvetica-Bold' }}>{fmt(medible ? c[e] : 0)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

/** Una fila con su pista: sirve para las secretarías y para los sectores. Todas miden lo mismo; la propia solo lleva fondo y una raya. */
function FilaConPista({ nombre, c, medida, propia = false, id, ancho, anchoNombre = 104 }: { nombre: string; c: CifrasDeAnio; medida: MedidaDelTablero; propia?: boolean; id: string; ancho: number; anchoNombre?: number }) {
  const { valor, nota } = textoDeFila(c, medida)
  const anchoValor = 58, anchoPista = ancho - anchoNombre - anchoValor - 16 - 8
  return (
    <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4.5, paddingLeft: 8, backgroundColor: propia ? PAGINA : undefined, borderRadius: 3, position: 'relative' }}>
      {propia && <View style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: 2, backgroundColor: TINTA, borderRadius: 1 }} />}
      <View style={{ width: anchoNombre }}>
        <Text style={{ fontSize: 8.6, fontFamily: propia ? 'Helvetica-Bold' : 'Helvetica' }}>{nombre}{propia ? '  ·  TÚ' : ''}</Text>
        <Text style={{ fontSize: 6.8, color: SUAVE }}>{fmt(c.conMeta)} {c.conMeta === 1 ? 'indicador' : 'indicadores'} con meta</Text>
      </View>
      <View style={{ marginHorizontal: 8 }}>
        <Pista id={id} trozos={medida === 'cumplimiento' ? trozosDeCumplimiento(c) : trozosDeReportes(c)} ancho={anchoPista} alto={8} />
      </View>
      <View style={{ width: anchoValor, alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 9.6, fontFamily: 'Helvetica-Bold' }}>{valor}</Text>
        {nota ? <Text style={{ fontSize: 6.6, color: SUAVE }}>{nota}</Text> : null}
      </View>
    </View>
  )
}

function ColumnaComparacion({ d, ancho }: { d: DatosDelInforme; ancho: number }) {
  const claves = d.medida === 'cumplimiento'
  return (
    <View style={{ width: ancho }}>
      <Text style={s.rotulo}>Frente a las otras secretarías</Text>
      {d.comparacion ? (
        <>
          {d.comparacion.map((f, i) => (
            <FilaConPista key={f.nombre} id={`sec-${i}`} nombre={nombreCorto(f.nombre)} c={f.cifras} medida={d.medida} propia={f.propia} ancho={ancho} />
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7 }}>
            {claves
              ? TRAMOS.map(t => (
                <View key={t.clave} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
                  <Marca color={t.color} /><Text style={{ fontSize: 7.2, color: SUAVE, marginLeft: 3 }}>{t.etiqueta}</Text>
                </View>
              ))
              : ESTADOS_DE_REPORTE.map(e => (
                <View key={e} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 2 }}>
                  {marcaDeEstado(e)}<Text style={{ fontSize: 7.2, color: SUAVE, marginLeft: 3 }}>{ROTULO_DE_PARTE[e]}</Text>
                </View>
              ))}
          </View>
          <Text style={{ fontSize: 6.8, color: SUAVE, marginTop: 6, lineHeight: 1.4 }}>
            Se ordenan por cuántos indicadores tienen, no por su avance. De las otras secretarías solo se ven números.
          </Text>
          {d.plan && (
            <View style={{ marginTop: 14 }}>
              <Text style={s.rotulo}>La Alcaldía</Text>
              <Text style={{ fontSize: 9.4, lineHeight: 1.4 }}>{lecturaDelPlan(d.plan)}</Text>
            </View>
          )}
        </>
      ) : (
        <Text style={{ fontSize: 8.6, color: SUAVE, lineHeight: 1.45 }}>La comparación con las otras secretarías no estaba disponible al generar este informe.</Text>
      )}
    </View>
  )
}

function ColumnaAtencion({ d, ancho }: { d: DatosDelInforme; ancho: number }) {
  return (
    <View style={{ width: ancho }}>
      <Text style={s.rotulo}>Necesita atención</Text>
      {d.atencion.map((a, i) => {
        const cero = a.cantidad === 0
        return (
          <View key={a.clave} wrap={false} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: REGLA }}>
            <Text style={{ width: 34, fontSize: 19, fontFamily: cero ? 'Helvetica' : 'Helvetica-Bold', color: cero ? TENUE : TINTA, textAlign: 'right', marginRight: 9, lineHeight: 1 }}>{fmt(a.cantidad)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8.6, fontFamily: cero ? 'Helvetica' : 'Helvetica-Bold', color: cero ? SUAVE : TINTA }}>{a.titulo}</Text>
              <Text style={{ fontSize: 7.2, color: cero ? '#2E7D5B' : SUAVE, marginTop: 1, lineHeight: 1.35 }}>{cero ? `Al día. ${a.ayuda}` : a.ayuda}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function BloqueDeSectores({ d }: { d: DatosDelInforme }) {
  if (d.sectores.length === 0) return null
  const mitad = Math.ceil(d.sectores.length / 2)
  const columnas = [d.sectores.slice(0, mitad), d.sectores.slice(mitad)]
  const ancho = (ANCHO_UTIL - 24) / 2
  return (
    <View wrap={false} style={{ marginTop: 14, borderTopWidth: 0.5, borderTopColor: REGLA, paddingTop: 9 }}>
      <Text style={s.rotulo}>Por sector</Text>
      <View style={{ flexDirection: 'row', columnGap: 24 }}>
        {columnas.map((col, k) => (
          <View key={k} style={{ width: ancho }}>
            {col.map((x, i) => <FilaConPista key={x.nombre} id={`sector-${k}-${i}`} nombre={x.nombre} c={x.cifras} medida={d.medida} ancho={ancho} anchoNombre={150} />)}
          </View>
        ))}
      </View>
      {d.sectoresTotal > SECTORES_EN_INFORME && (
        <Text style={{ fontSize: 6.8, color: SUAVE, marginTop: 3 }}>
          Los {SECTORES_EN_INFORME} sectores con más indicadores de {d.sectoresTotal}. Cada sector cuenta solo sus indicadores con meta en el año.
        </Text>
      )}
    </View>
  )
}

// ─── Encabezado y pie ─────────────────────────────────────────────────────────

function Encabezado({ d, fixed = false }: { d: DatosDelInforme; fixed?: boolean }) {
  return (
    <View fixed={fixed} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1.4, borderBottomColor: TINTA, paddingBottom: 8, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 24, height: 24, borderRadius: 5, backgroundColor: TINTA, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontFamily: 'Helvetica-Bold' }}>CD</Text>
        </View>
        <View>
          <Text style={{ fontSize: 6.8, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', color: TENUE }}>{PLAN.denominacion} · {PLAN.nombre}</Text>
          <Text style={{ fontSize: 11.5, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>{d.secretaria}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 8.6, fontFamily: 'Helvetica-Bold' }}>Año {d.anio}</Text>
        <Text style={{ fontSize: 7.4, color: SUAVE, marginTop: 1 }}>Cifras al {d.corte}</Text>
      </View>
    </View>
  )
}

function Pie() {
  return (
    <View fixed style={{ position: 'absolute', left: MARGEN, right: MARGEN, bottom: 18, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: REGLA, paddingTop: 5 }}>
      <Text style={{ fontSize: 6.6, color: SUAVE }}>Generado por Contratista Digital. Solo cuenta lo aprobado por la secretaría; cada año se mide contra su meta.</Text>
      <Text style={{ fontSize: 6.6, color: SUAVE }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

// ─── El equipo ────────────────────────────────────────────────────────────────

function FilaDePersona({ p, id }: { p: PersonaDelInforme; id: string }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: REGLA }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: p.sinAcceso ? '#FFFFFF' : '#EDF0F5', ...(p.sinAcceso ? { borderWidth: 0.8, borderStyle: 'dashed' as const, borderColor: '#C5CBD6' } : {}) }}>
        <Text style={{ fontSize: 7.6, fontFamily: 'Helvetica-Bold', color: p.sinAcceso ? TENUE : TINTA }}>{inicialesDe(p.nombre)}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 9 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold' }}>{p.nombre}</Text>
        <Text style={{ fontSize: 7.4, color: p.sinAcceso ? '#B42318' : SUAVE }}>{p.sinAcceso ? 'Aún sin acceso al módulo' : `${fmt(p.indicadores)} ${p.indicadores === 1 ? 'indicador' : 'indicadores'}`}</Text>
      </View>
      <View style={{ marginHorizontal: 12 }}>
        <Pista
          id={id} ancho={190} alto={7}
          trozos={[
            { clave: 'a', valor: p.aprobados, color: '#2E7D5B' }, { clave: 'v', valor: p.porValidar, color: '#B7791F' },
            { clave: 'd', valor: p.devueltos, color: '#B42318' }, { clave: 'f', valor: p.porReportar },
          ]}
        />
      </View>
      {([['Por reportar', p.porReportar], ['Sin validar', p.porValidar], ['Devueltos', p.devueltos]] as const).map(([rotulo, v]) => (
        <View key={rotulo} style={{ width: 62, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>{fmt(v)}</Text>
          <Text style={{ fontSize: 5.8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, textTransform: 'uppercase', color: TENUE }}>{rotulo}</Text>
        </View>
      ))}
    </View>
  )
}

// ─── El documento ─────────────────────────────────────────────────────────────

export function InformeDelTablero({ d }: { d: DatosDelInforme }) {
  const hueco = 20
  const ancho1 = 205, ancho3 = 205
  const ancho2 = ANCHO_UTIL - ancho1 - ancho3 - 2 * hueco
  return (
    <Document title={`Tablero · ${d.secretaria} · ${d.anio}`} author="Contratista Digital" subject={`${PLAN.denominacion} ${PLAN.nombre}`}>
      <Page size="A4" orientation="landscape" style={s.pagina}>
        <Encabezado d={d} />
        <Text style={{ fontSize: 16.5, fontFamily: 'Helvetica-Bold', letterSpacing: -0.2 }}>Así va {d.secretaria} en {d.anio}</Text>
        <Text style={{ fontSize: 10.2, lineHeight: 1.42, marginTop: 6, maxWidth: 620 }}>
          {d.lectura.titular.map((t, i) => (t.fuerte ? <Text key={i} style={s.negrita}>{t.texto}</Text> : <Text key={i}>{t.texto}</Text>))}
        </Text>
        {d.lectura.detalle ? <Text style={{ fontSize: 8.2, color: SUAVE, marginTop: 4, maxWidth: 620 }}>{d.lectura.detalle}</Text> : null}
        <View style={{ flexDirection: 'row', marginTop: 16, columnGap: hueco }}>
          <ColumnaTuSecretaria d={d} ancho={ancho1} />
          <ColumnaComparacion d={d} ancho={ancho2} />
          <ColumnaAtencion d={d} ancho={ancho3} />
        </View>
        <BloqueDeSectores d={d} />
        <Pie />
      </Page>

      {d.equipo && (
        <Page size="A4" orientation="landscape" style={s.pagina}>
          <Encabezado d={d} fixed />
          <Text style={{ fontSize: 16.5, fontFamily: 'Helvetica-Bold' }}>Tu equipo</Text>
          <Text style={{ fontSize: 8.6, color: SUAVE, marginTop: 4, marginBottom: 10 }}>
            Por nombre. Mide gestión, no resultados: qué falta reportar y qué espera validación en {d.anio}.
          </Text>
          {d.equipo.length === 0
            ? <Text style={{ fontSize: 9, color: SUAVE }}>Todavía no hay personas con indicadores a su cargo en tu secretaría.</Text>
            : d.equipo.map((p, i) => <FilaDePersona key={p.nombre} p={p} id={`eq-${i}`} />)}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            {(['aprobados', 'porValidar', 'devueltos', 'faltan'] as const).map(e => (
              <View key={e} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
                {marcaDeEstado(e)}<Text style={{ fontSize: 7.2, color: SUAVE, marginLeft: 3 }}>{e === 'faltan' ? 'Por reportar' : ROTULO_DE_PARTE[e]}</Text>
              </View>
            ))}
          </View>
          <Pie />
        </Page>
      )}
    </Document>
  )
}
