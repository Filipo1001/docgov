'use client'

/**
 * La torta: un reparto de un total en tramos, con un número en el centro que dice lo principal de un vistazo.
 *
 * Se dibuja con un círculo por tramo (un trazo grueso con `stroke-dasharray`), no con rutas de arco: así cada tramo es SIEMPRE el
 * mismo elemento y al cambiar de años su largo se anima (se acomoda en vez de saltar). Los tramos vacíos miden cero y siguen
 * ahí, para que cada uno tenga a quién animar.
 *
 * Con el total en cero (nada que repartir) solo queda la pista vacía y el centro dice por qué. Es de presentación pura: quien la
 * monta decide qué resalta (`resaltado`) y qué dice el lector de pantalla (`descripcion`).
 */

export interface TramoTorta {
  clave: string
  etiqueta: string
  valor: number
  color: string
}

const TAM = 168
const C0 = TAM / 2
const R = 64
const GROSOR = 26
const LARGO = 2 * Math.PI * R
/** Una rendija blanca entre tramos, en vueltas (0,8 %): separa sin comerse un tramo chico. */
const RENDIJA = 0.008

export default function Torta({ tramos, centro, nota, descripcion, resaltado = null, onResaltar }: {
  tramos: TramoTorta[]
  /** Lo principal, grande, en el centro (un porcentaje, o «—»). */
  centro: string
  /** Una línea corta bajo el centro. */
  nota: string
  /** Lo que dice el lector de pantalla: lo mismo que enseña la torta, con las cifras. */
  descripcion: string
  /** El tramo que se resalta (los demás se atenúan), por ejemplo al pasar sobre su fila de la leyenda. */
  resaltado?: string | null
  onResaltar?: (clave: string | null) => void
}) {
  const total = tramos.reduce((t, x) => t + x.valor, 0)
  const conVarios = tramos.filter(t => t.valor > 0).length > 1
  // Dónde empieza cada tramo: lo que suman los anteriores (sin variables que cambien al pintar).
  const empieza = tramos.map((_, k) => (total > 0 ? tramos.slice(0, k).reduce((t, x) => t + x.valor, 0) / total : 0))
  return (
    <svg viewBox={`0 0 ${TAM} ${TAM}`} role="img" aria-label={descripcion} className="h-[168px] w-[168px] shrink-0">
      <circle cx={C0} cy={C0} r={R} fill="none" stroke="#EEF0F4" strokeWidth={GROSOR} />
      {tramos.map((t, k) => {
        const parte = total > 0 ? t.valor / total : 0
        const largo = Math.max(parte - (conVarios && parte > 0 ? RENDIJA : 0), 0) * LARGO
        const inicio = empieza[k]
        return (
          <circle
            key={t.clave}
            cx={C0} cy={C0} r={R} fill="none"
            stroke={t.color} strokeWidth={GROSOR}
            strokeDasharray={`${largo} ${LARGO}`}
            strokeDashoffset={-inicio * LARGO}
            transform={`rotate(-90 ${C0} ${C0})`}
            opacity={resaltado === null || resaltado === t.clave ? 1 : 0.3}
            className="transition-[stroke-dasharray,stroke-dashoffset,opacity] duration-500 ease-out motion-reduce:transition-none"
            onMouseEnter={onResaltar ? () => onResaltar(t.clave) : undefined}
            onMouseLeave={onResaltar ? () => onResaltar(null) : undefined}
          >
            <title>{`${t.etiqueta}: ${t.valor}`}</title>
          </circle>
        )
      })}
      <text x={C0} y={C0 + 2} textAnchor="middle" fontSize="30" fontWeight="600" className="fill-gray-900 tabular-nums">{centro}</text>
      <text x={C0} y={C0 + 22} textAnchor="middle" fontSize="11" className="fill-gray-500">{nota}</text>
    </svg>
  )
}
