/**
 * lib/reportes/consolidado.ts — el cierre mensual, por dependencia.
 *
 * Vive aparte del cron y del correo a propósito: así se puede calcular un mes
 * real y mirarlo antes de mandárselo a nadie. La versión anterior mezclaba las
 * tres cosas en el endpoint y arrastraba tres errores que solo se ven cuando
 * comparas su resultado con la base.
 *
 * ── Los tres errores que este módulo corrige ─────────────────────────────
 *
 * 1. EL DENOMINADOR ERA «HOY», NO EL MES REPORTADO. El cálculo partía de
 *    `fecha_fin >= hoy`. Ocho contratos de Gobierno terminaron el 31 de
 *    agosto: trabajaron el mes entero, cerraron su ciclo, y quedaban fuera del
 *    informe de su propio mes — siete informes cerrados sin contar. Al revés
 *    pasaba lo mismo: Bienestar Social tiene 42 contratos vigentes hoy pero
 *    solo 14 existían en agosto, así que su cumplimiento salía 10% en vez de
 *    29%. Aquí la ventana es el mes: vigente = empezó antes de que acabara el
 *    mes y no había terminado cuando empezó.
 *
 * 2. LA COMPARACIÓN IGNORABA `es_historico`. Desarrollo Territorial tiene sus
 *    ocho periodos de julio marcados como históricos: se pagaron fuera del
 *    sistema. El informe de agosto le habría dicho a su supervisor que subió
 *    88 puntos, y el de julio que cerró 0 de 17. Un mes que la aplicación no
 *    gestionó no es un mes malo: es un mes del que no tiene nada que decir.
 *    Por eso la base comparable excluye esos contratos, y si lo que queda es
 *    demasiado pequeño la comparación no se publica.
 *
 * 3. LA PLATA NO DISTINGUÍA LO QUE NO SABE. El sistema llega hasta `radicado`
 *    —la cuenta salió hacia Hacienda—; si tesorería giró o no, no lo sabe.
 *    Aquí se llama «radicado» y nunca «pagado». Decirle «pagado» al secretario
 *    de Hacienda, que sí sabe lo que giró, es la forma más rápida de que deje
 *    de creer en el informe.
 *
 * ── Dos denominadores que no se pueden mezclar ───────────────────────────
 *
 * Para el CUMPLIMIENTO del ciclo los periodos históricos no cuentan: la
 * aplicación no los gestionó. Para la PLATA sí cuentan, y `app/actions/alcalde.ts`
 * ya documenta por qué —sin ellos Hacienda aparecía ejecutando 14% con 66% del
 * plazo corrido—. Este módulo reporta UN mes, y en el mes reportado los
 * históricos son lo que se pagó por fuera: se cuentan aparte y se nombran, no
 * se suman a lo que sí pasó por el sistema.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { MESES } from '@/lib/constants'
import { cargarAmbitos, type Ambito } from '@/lib/alcance'

/** Estados en los que el ciclo del mes se dio por cerrado. */
const CERRADOS = new Set(['aprobado', 'radicado'])

/** Una dependencia resumida en cifras — lo único que puede cruzar fronteras. */
export interface FilaDependencia {
  dependenciaId: string
  nombre: string
  /** Contratos vigentes DURANTE el mes reportado. */
  contratos: number
  /** De esos, los que cerraron el ciclo. */
  cerrados: number
  pct: number
  /** Personas distintas: tres contratistas tienen dos contratos vigentes. */
  contratistas: number
  /** Suma de `valor_cobro` de lo que cerró. Radicado, no pagado. */
  valor: number
}

export interface Abierto {
  contrato: string
  nombre: string
  /** Etiqueta en castellano de por qué sigue abierto. */
  estado: string
}

export interface SinPlanilla {
  contrato: string
  nombre: string
  meses: string[]
}

/** Un contrato cuyo dato económico impide contarlo. Se nombra, no se esconde. */
export interface Reparo {
  contrato: string
  nombre: string
  motivo: string
}

export interface BloqueDependencia {
  ambito: Ambito
  fila: FilaDependencia
  /**
   * El mes anterior, solo si es comparable. `null` cuando la aplicación no
   * gestionó ese mes en esta dependencia — que no es lo mismo que un 0%.
   */
  previo: { cerrados: number; contratos: number; pct: number } | null
  /** Por qué no hay comparación, cuando `previo` es null. */
  notaPrevio: string | null
  /**
   * La comparación es válida pero compara equipos distintos.
   *
   * Bienestar Social pasó de 38 contratos vigentes en julio a 14 en agosto:
   * 33 terminaron el 31 de julio y la cohorte nueva entró en septiembre. Ir
   * de «4 de 38» a «4 de 14» no es que el equipo mejorara, es que cambió. Por
   * eso el informe nunca publica un porcentaje suelto —siempre la fracción
   * entera— y además avisa cuando el cambio es grande.
   */
  cambioPoblacion: boolean
  abiertos: Abierto[]
  sinPlanilla: SinPlanilla[]
  /** Días medios de `enviado` a `radicado`. Mide al equipo, no al contratista. */
  tramiteDias: number | null
  /** Periodos del mes que se pagaron fuera del sistema. */
  historicos: number
  reparos: Reparo[]
}

export interface Consolidado {
  mes: string
  anio: number
  mesPrevio: string
  anioPrevio: number
  municipio: {
    informes: number
    contratistas: number
    valor: number
    /** Ordenadas por valor descendente. Agregado: sin un solo nombre propio. */
    filas: FilaDependencia[]
  }
  dependencias: BloqueDependencia[]
}

/** PostgREST corta en 1.000 filas y no avisa. `periodos` ya va en 739. */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGINA = 1000
  const salida: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1)
    if (error || !data) break
    salida.push(...data)
    if (data.length < PAGINA) break
  }
  return salida
}

/** Último día del mes, en ISO. `mesIdx` es 0-11. */
function finDeMes(anio: number, mesIdx: number): string {
  const d = new Date(Date.UTC(anio, mesIdx + 1, 0))
  return d.toISOString().slice(0, 10)
}

function inicioDeMes(anio: number, mesIdx: number): string {
  return `${anio}-${String(mesIdx + 1).padStart(2, '0')}-01`
}

type FilaContrato = {
  id: string
  numero: string
  dependencia_id: string | null
  contratista_id: string | null
  valor_mensual: number | null
  fecha_inicio: string
  fecha_fin: string
}

type FilaPeriodo = {
  id: string
  contrato_id: string
  mes: string
  anio: number
  estado: string
  es_historico: boolean
  valor_cobro: number | null
  numero_planilla: string | null
  fecha_fin: string | null
}

const ETIQUETA_ABIERTO: Record<string, string> = {
  borrador: 'sin enviar',
  enviado: 'esperando revisión',
  revision: 'revisado, falta aprobar',
  rechazado: 'devuelto al contratista',
}

/**
 * Calcula el consolidado de un mes concreto.
 *
 * `hoyISO` entra por parámetro y no se lee del reloj para que el cálculo sea
 * reproducible: es lo que permite correr el mes pasado y comparar el resultado
 * con la base antes de enviar nada.
 */
export async function calcularConsolidado(
  admin: SupabaseClient,
  mesIdx: number,
  anio: number,
  hoyISO: string,
): Promise<Consolidado> {
  const mes = MESES[mesIdx]
  const ini = inicioDeMes(anio, mesIdx)
  const fin = finDeMes(anio, mesIdx)

  const idxPrevio = (mesIdx + 11) % 12
  const anioPrevio = mesIdx === 0 ? anio - 1 : anio
  const mesPrevio = MESES[idxPrevio]
  const iniPrevio = inicioDeMes(anioPrevio, idxPrevio)
  const finPrevio = finDeMes(anioPrevio, idxPrevio)

  const [ambitos, contratos, usuarios] = await Promise.all([
    cargarAmbitos(admin),
    todas<FilaContrato>((desde, hasta) => admin
      .from('contratos')
      .select('id, numero, dependencia_id, contratista_id, valor_mensual, fecha_inicio, fecha_fin')
      .eq('activo', true)
      .range(desde, hasta)),
    todas<{ id: string; nombre_completo: string }>((desde, hasta) => admin
      .from('usuarios')
      .select('id, nombre_completo')
      .range(desde, hasta)),
  ])

  const nombreDe = new Map(usuarios.map(u => [u.id, u.nombre_completo]))
  const porContrato = new Map(contratos.map(c => [c.id, c]))

  // Sin filtro `.in('contrato_id', …)`: con 156 contratos esa lista ya son seis
  // kilobytes de URL y hacia los 300 la petición empieza a rebotar. Se traen
  // todos los periodos —739 hoy— y se descartan aquí los de contratos
  // inactivos, que es una comprobación en memoria y no una consulta frágil.
  const periodosRaw = await todas<FilaPeriodo>((desde, hasta) => admin
    .from('periodos')
    .select('id, contrato_id, mes, anio, estado, es_historico, valor_cobro, numero_planilla, fecha_fin')
    .range(desde, hasta))
  const periodos = periodosRaw.filter(p => porContrato.has(p.contrato_id))

  const periodoDe = (contratoId: string, m: string, a: number) =>
    periodos.find(p => p.contrato_id === contratoId && p.mes === m && p.anio === a)

  /** Vigente durante la ventana: empezó antes de que acabara y no había terminado. */
  const vigenteEntre = (c: FilaContrato, desde: string, hasta: string) =>
    c.fecha_inicio <= hasta && c.fecha_fin >= desde

  // ── Tiempo de trámite: enviado → radicado, del mes reportado ────────────
  const idsDelMes = periodos
    .filter(p => p.mes === mes && p.anio === anio && !p.es_historico && p.estado === 'radicado')
    .map(p => p.id)
  const historial = idsDelMes.length
    ? await todas<{ periodo_id: string; estado_nuevo: string; created_at: string }>((desde, hasta) => admin
        .from('historial_periodos')
        .select('periodo_id, estado_nuevo, created_at')
        .in('periodo_id', idsDelMes)
        .in('estado_nuevo', ['enviado', 'radicado'])
        .range(desde, hasta))
    : []
  // Primer `enviado` y último `radicado` de cada periodo: si volvió a enviarse
  // tras una devolución, el trámite empieza cuando la persona lo mandó la
  // primera vez — es el tiempo que esperó, no el que tardó el último intento.
  const enviadoEn = new Map<string, string>()
  const radicadoEn = new Map<string, string>()
  for (const h of historial) {
    if (h.estado_nuevo === 'enviado') {
      const v = enviadoEn.get(h.periodo_id)
      if (!v || h.created_at < v) enviadoEn.set(h.periodo_id, h.created_at)
    } else {
      const v = radicadoEn.get(h.periodo_id)
      if (!v || h.created_at > v) radicadoEn.set(h.periodo_id, h.created_at)
    }
  }

  const bloques: BloqueDependencia[] = []
  const filas: FilaDependencia[] = []

  for (const ambito of ambitos.values()) {
    const suyos = contratos.filter(
      c => c.dependencia_id === ambito.dependenciaId && vigenteEntre(c, ini, fin),
    )
    // Sin contratos en el mes no hay consolidado. Deja fuera a Comisaría de
    // Familia sin nombrarla; si algún día le asignan contratos, aparece sola.
    if (suyos.length === 0) continue

    const conPeriodo = suyos.map(c => ({ c, p: periodoDe(c.id, mes, anio) }))
    const cerrados = conPeriodo.filter(x => x.p && !x.p.es_historico && CERRADOS.has(x.p.estado))
    const historicos = conPeriodo.filter(x => x.p?.es_historico).length

    const valor = cerrados.reduce((s, x) => s + Number(x.p!.valor_cobro ?? 0), 0)

    const fila: FilaDependencia = {
      dependenciaId: ambito.dependenciaId,
      nombre: ambito.nombre,
      contratos: suyos.length,
      cerrados: cerrados.length,
      pct: Math.round((100 * cerrados.length) / suyos.length),
      contratistas: new Set(cerrados.map(x => x.c.contratista_id)).size,
      valor,
    }
    filas.push(fila)

    // ── Mes anterior, solo si es comparable ──────────────────────────────
    const suyosPrevio = contratos.filter(
      c => c.dependencia_id === ambito.dependenciaId && vigenteEntre(c, iniPrevio, finPrevio),
    )
    const gestionadosPrevio = suyosPrevio.filter(
      c => !periodoDe(c.id, mesPrevio, anioPrevio)?.es_historico,
    )
    // Una base minúscula produce saltos de decenas de puntos que no significan
    // nada. Desarrollo Territorial tenía UN contrato comparable en julio: «0%»
    // habría sido literalmente cierto y completamente engañoso.
    const comparable =
      gestionadosPrevio.length >= 3 && gestionadosPrevio.length >= 0.5 * suyos.length

    let previo: BloqueDependencia['previo'] = null
    let notaPrevio: string | null = null
    let cambioPoblacion = false
    if (comparable) {
      const cerradosPrevio = gestionadosPrevio.filter(c => {
        const p = periodoDe(c.id, mesPrevio, anioPrevio)
        return p && !p.es_historico && CERRADOS.has(p.estado)
      }).length
      previo = {
        cerrados: cerradosPrevio,
        contratos: gestionadosPrevio.length,
        pct: Math.round((100 * cerradosPrevio) / gestionadosPrevio.length),
      }
      const mayor = Math.max(gestionadosPrevio.length, suyos.length)
      cambioPoblacion = Math.abs(gestionadosPrevio.length - suyos.length) / mayor > 0.3
    } else if (suyosPrevio.length === 0) {
      notaPrevio = `No hay comparación con ${mesPrevio}: la dependencia no tenía contratos ese mes.`
    } else {
      const fuera = suyosPrevio.length - gestionadosPrevio.length
      notaPrevio = fuera > 0
        ? `No hay comparación con ${mesPrevio}: ${fuera} de sus ${suyosPrevio.length} contratos se tramitaron fuera de Contratista Digital ese mes.`
        : `No hay comparación con ${mesPrevio}: eran muy pocos contratos para que el porcentaje signifique algo.`
    }

    // ── Lo que quedó abierto, con nombre ─────────────────────────────────
    const abiertos: Abierto[] = conPeriodo
      .filter(x => !(x.p && !x.p.es_historico && CERRADOS.has(x.p.estado)))
      .filter(x => !x.p?.es_historico)
      .map(x => ({
        contrato: x.c.numero,
        nombre: nombreDe.get(x.c.contratista_id ?? '') ?? 'Sin nombre',
        estado: x.p ? (ETIQUETA_ABIERTO[x.p.estado] ?? x.p.estado) : 'sin crear el periodo',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    // ── Meses cerrados sin planilla: los que el acta imprime como «—» ────
    const sinPlanillaMap = new Map<string, string[]>()
    for (const p of periodos) {
      if (p.es_historico) continue
      if ((p.numero_planilla ?? '').trim()) continue
      if (!p.fecha_fin || p.fecha_fin >= hoyISO) continue
      const c = porContrato.get(p.contrato_id)
      if (!c || c.dependencia_id !== ambito.dependenciaId) continue
      sinPlanillaMap.set(p.contrato_id, [...(sinPlanillaMap.get(p.contrato_id) ?? []), p.mes])
    }
    const sinPlanilla: SinPlanilla[] = [...sinPlanillaMap.entries()].map(([cid, meses]) => ({
      contrato: porContrato.get(cid)?.numero ?? '?',
      nombre: nombreDe.get(porContrato.get(cid)?.contratista_id ?? '') ?? 'Sin nombre',
      meses,
    }))

    // ── Días de trámite ──────────────────────────────────────────────────
    const tiempos = cerrados
      .map(x => {
        const a = enviadoEn.get(x.p!.id)
        const b = radicadoEn.get(x.p!.id)
        if (!a || !b) return null
        return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
      })
      .filter((n): n is number => n !== null && n >= 0)
    const tramiteDias = tiempos.length
      ? Math.round((10 * tiempos.reduce((s, n) => s + n, 0)) / tiempos.length) / 10
      : null

    // ── Reparos: contratos cuyo dato económico no permite sumar ──────────
    //
    // Hoy hay exactamente uno en producción: el 015, con `valor_mensual = 0` y
    // sus 45 millones concentrados en diciembre. Si su mes cerrara valdría $0
    // y la suma de Hacienda quedaría corta sin que nada avisara. Se nombra en
    // el informe en vez de dejar que distorsione la cifra en silencio.
    const reparos: Reparo[] = conPeriodo
      .filter(x => Number(x.c.valor_mensual ?? 0) <= 0 && Number(x.p?.valor_cobro ?? 0) <= 0)
      .map(x => ({
        contrato: x.c.numero,
        nombre: nombreDe.get(x.c.contratista_id ?? '') ?? 'Sin nombre',
        motivo: 'el contrato no tiene valor mensual registrado, así que su cuenta no suma al total',
      }))

    bloques.push({
      ambito, fila, previo, notaPrevio, cambioPoblacion,
      abiertos, sinPlanilla, tramiteDias, historicos, reparos,
    })
  }

  filas.sort((a, b) => b.valor - a.valor)
  bloques.sort((a, b) => b.fila.valor - a.fila.valor)

  // Personas distintas a nivel municipio: quien tiene contratos en dos
  // secretarías cuenta una vez aquí y una en cada bloque, que es lo correcto.
  const cerradosTodos = contratos.flatMap(c => {
    const p = periodoDe(c.id, mes, anio)
    return p && !p.es_historico && CERRADOS.has(p.estado) && vigenteEntre(c, ini, fin)
      ? [c.contratista_id]
      : []
  })

  return {
    mes, anio, mesPrevio, anioPrevio,
    municipio: {
      informes: filas.reduce((s, f) => s + f.cerrados, 0),
      contratistas: new Set(cerradosTodos).size,
      valor: filas.reduce((s, f) => s + f.valor, 0),
      filas,
    },
    dependencias: bloques,
  }
}
