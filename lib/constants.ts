/**
 * Centralized constants for Contratista Digital.
 *
 * Single source of truth for:
 * - Period state labels and colors
 * - Approval state machine
 * - Role → state mapping
 * - File upload constraints
 */

import type { EstadoPeriodo, Rol } from './types'

/** Claves válidas del catálogo de navegación (ver lib/iconos.ts). */
export type ClaveIconoNavegacion =
  | 'inicio' | 'usuarios' | 'firmas' | 'contratos' | 'informes'
  | 'dependencias' | 'municipio' | 'historicos' | 'configuracion'
  | 'contratistas' | 'colaboradores'

// ─── Period state display ────────────────────

/**
 * Etiquetas visibles. El VALOR guardado sigue siendo `rechazado`; solo cambia
 * cómo se nombra.
 *
 * Por qué «Devuelto» y no «Rechazado»: en este trámite nada se rechaza de
 * forma definitiva. El informe vuelve al contratista —o un paso atrás, al
 * asesor— para corregirse, y el proceso continúa. «Rechazado» sugiere una
 * sanción que no existe, y en un contrato público esa palabra pesa. Además,
 * el sistema ya se contradecía: el badge decía «Rechazado» mientras el aviso
 * y el correo hablaban de una devolución.
 *
 * El estado no dice a dónde volvió (al contratista o al asesor); eso lo dice
 * cada pantalla en su contexto, con ESTADO_DESTINO más abajo.
 */
export const ESTADO_LABEL: Record<EstadoPeriodo, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  revision: 'En revisión',
  aprobado: 'Aprobado',
  radicado: 'Radicado',
  rechazado: 'Devuelto',
}

/**
 * Quién tiene la pelota cuando un periodo está devuelto. Se guarda un solo
 * estado (`rechazado`) para dos destinos distintos:
 *   · el asesor devuelve al contratista            → rechazado
 *   · la secretaría devuelve al contratista        → rechazado
 *   · la secretaría devuelve al asesor             → enviado (no es este caso)
 * Por eso la etiqueta larga se usa donde hay espacio para explicar.
 */
export const ESTADO_LABEL_LARGO: Record<EstadoPeriodo, string> = {
  borrador: 'Sin enviar',
  enviado: 'Enviado, en espera de revisión',
  revision: 'En revisión de la secretaría',
  aprobado: 'Aprobado, pendiente de radicar',
  radicado: 'Radicado',
  rechazado: 'Devuelto al contratista para corrección',
}

/**
 * Color por estado. La jerarquía la carga el RELLENO, no el matiz:
 *
 *   sólido  → radicado, el cierre del trámite
 *   tintado → aprobado y los estados en curso
 *   plano   → borrador, que es el fondo de cualquier lista
 *
 * Se ordenó así porque `aprobado` (verde) y `radicado` (esmeralda) eran dos
 * tintes claros casi idénticos: los dos estados que más importan —el que dice
 * «ya está bien» y el que dice «ya quedó radicado»— no se distinguían de un
 * vistazo. Separarlos por matiz habría necesitado un color nuevo compitiendo
 * con los demás; separarlos por peso no.
 *
 * El sólido usa la tinta de la marca y no un color semántico: radicado no es
 * «bueno» ni «malo», es el final del camino, y un chip oscuro macizo se lee
 * como sello. De paso funciona en escala de grises y sin distinguir color, que
 * es lo que ningún par de tintes claros consigue.
 */
export const ESTADO_COLOR: Record<EstadoPeriodo, string> = {
  // Casi la mitad de los periodos del sistema son borradores y conviene que se
  // hundan al fondo, pero el gris se quedó en 600 y no 500: a 500 el texto caía
  // a 4.39 sobre este relleno, por debajo del mínimo AA. El chip macizo de
  // `radicado` ya crea la distancia; no hace falta pagarla con legibilidad.
  borrador: 'bg-gray-100 text-gray-600',
  enviado: 'bg-blue-100 text-blue-700',
  revision: 'bg-indigo-100 text-indigo-700',
  aprobado: 'bg-green-100 text-green-800',
  radicado: 'bg-[#192031] text-white',
  rechazado: 'bg-red-100 text-red-700',
}

// ─── Historical period display ───────────────
export const HISTORICO_LABEL = 'Histórico'
/**
 * Contorno neutro, no ámbar.
 *
 * «Histórico» ocupa la misma casilla que el estado del periodo, pero no es un
 * estado: es una marca de procedencia —el periodo se cargó ya cumplido, de
 * antes del sistema—. Cuando iba en ámbar competía con los estados reales y
 * además chocaba con el ámbar de las correcciones de supervisión, que sí pide
 * acción. Sin relleno queda claro que es una etiqueta, no una fase.
 *
 * Los banners y bordes de más abajo sí siguen en ámbar: ahí el color explica un
 * contexto, no clasifica un estado.
 */
export const HISTORICO_COLOR = 'bg-transparent text-gray-500 ring-1 ring-inset ring-gray-300'
export const HISTORICO_BORDER = 'border-amber-200 bg-amber-50/40'
export const HISTORICO_BANNER = 'bg-amber-50 border-amber-200 text-amber-800'

// ─── Approval state machine ──────────────────

/**
 * New simplified flow:
 *   borrador → enviado       (contratista submits)
 *   enviado → aprobado       (secretary approves — asesor pre-approval is just a flag)
 *   aprobado → radicado      (asesor registers physical filing)
 *
 * Pre-approval by asesor: stored in `preaprobaciones` table, does NOT change period state.
 * Secretary rejection: clears preaprobaciones, sets motivo_rechazo, state stays `enviado`.
 * Asesor rejection: state → `rechazado` (back to contratista).
 */
export const ESTADO_SIGUIENTE: Partial<Record<EstadoPeriodo, EstadoPeriodo>> = {
  enviado: 'aprobado',
}

/**
 * Maps each reviewer role to the estado they review.
 * - supervisor (secretaria) reviews 'enviado' periods
 * - asesor pre-approves 'enviado' periods (but doesn't change state)
 */
export const ESTADO_REVISOR: Partial<Record<Rol, EstadoPeriodo>> = {
  supervisor: 'enviado',
}

// ─── Gestión del contrato ────────────────────

/**
 * Roles que administran el CICLO DE VIDA DEL CONTRATO: crearlo, corregirlo,
 * definir sus obligaciones, generar sus periodos y registrar sus otrosíes.
 *
 * Es una frontera distinta a la del flujo de informes (asesor → secretaría),
 * donde contratación no interviene. Se centraliza aquí porque estaba escrita
 * como `rol === 'admin'` repartida por las pantallas, y eso dejaba a
 * contratación con permiso en el servidor pero sin botones para usarlo:
 * podía crear un contrato y no terminar de configurarlo.
 */
export function esGestorContratos(rol?: Rol | null): boolean {
  return rol === 'admin' || rol === 'contratacion'
}

/**
 * Roles que VIGILAN contratos ajenos: el supervisor los suyos, el asesor los
 * de su dependencia. Ven la lista completa de su ámbito y actúan sobre los
 * informes, pero no editan el contrato ni lo crean.
 *
 * Existe porque `esGestorContratos` no sirve para decidir quién necesita
 * buscador y filtros: contratación gestiona 118 contratos y un supervisor
 * llega a 48, pero hasta ahora solo el primero tenía con qué encontrarlos.
 */
export function esRolSupervision(rol?: Rol | null): boolean {
  return rol === 'supervisor' || rol === 'asesor'
}

/** States where a contratista can edit activities and evidence */
export const ESTADOS_EDITABLES: EstadoPeriodo[] = ['borrador', 'rechazado']

/** States where a reviewer can approve or reject */
export const ESTADOS_EN_REVISION: EstadoPeriodo[] = ['enviado']

// ─── Month names ──────────────────────────────

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

// ─── File upload constraints ──────────────────

export const FILE_UPLOAD = {
  // image/heif  — iPhones report HEIC as heif on some iOS versions
  // image/jpg   — non-standard but emitted by Samsung/Xiaomi cameras
  // ''          — some Android WebViews omit the MIME type entirely (handled via extension fallback in evidencias.ts)
  TIPOS_IMAGEN: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const,
  TIPOS_DOCUMENTO: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  EXTENSIONES_IMAGEN: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const,
  EXTENSIONES_DOCUMENTO: ['pdf', 'jpg', 'jpeg', 'png'] as const,
  TAMANO_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
  TAMANO_MAX_LABEL: '10 MB',
} as const

// ─── Current month helper ────────────────────

export function getMesActual() {
  const now = new Date()
  return { mes: MESES[now.getMonth()], anio: now.getFullYear(), mesIndex: now.getMonth() }
}

/**
 * Índice 0-11 del mes tal como se guarda en `periodos.mes`: texto en español,
 * con mayúsculas variables según la época en que se creó la fila. Devuelve -1
 * si no se reconoce, para que quien pregunte pueda decidir qué hacer en vez de
 * recibir un 0 que significaría "enero".
 */
export function indiceMes(mes: string): number {
  const objetivo = mes.trim().toUpperCase()
  return MESES.findIndex(m => m.toUpperCase() === objetivo)
}

/**
 * El mes del periodo ya terminó. Es la condición que habilita al supervisor a
 * desbloquear el envío tardío: un periodo en borrador cuyo mes quedó atrás es
 * trabajo que el contratista ya no puede entregar sin que alguien lo permita.
 */
export function esMesPasado(mes: string, anio: number, hoy = new Date()): boolean {
  const idx = indiceMes(mes)
  if (idx < 0) return false
  if (anio < hoy.getFullYear()) return true
  return anio === hoy.getFullYear() && idx < hoy.getMonth()
}

// ─── Sidebar navigation per role ─────────────

/**
 * Entrada del menú lateral.
 *
 * `icono` es una CLAVE del catálogo (`Iconos.navegacion` en lib/iconos.ts), no
 * el componente: así este módulo, que consumen una docena de pantallas, no
 * arrastra React ni la librería de iconos a donde no hacen falta. Quien pinta
 * resuelve la clave.
 */
export interface ItemMenu {
  href: string
  label: string
  icono: ClaveIconoNavegacion
}

export function getMenuPorRol(rol: Rol): ItemMenu[] {
  const { mes, anio } = getMesActual()
  const mesLabel = `${mes} ${anio}`

  const menus: Record<Rol, ItemMenu[]> = {
    admin: [
      { href: '/dashboard', label: 'Inicio', icono: 'inicio' },
      { href: '/dashboard/admin/usuarios', label: 'Usuarios', icono: 'usuarios' },
      { href: '/dashboard/admin/firmas', label: 'Firmas', icono: 'firmas' },
      { href: '/dashboard/contratos', label: 'Contratos', icono: 'contratos' },
      { href: '/dashboard/informes', label: mesLabel, icono: 'informes' },
      { href: '/dashboard/dependencias', label: 'Dependencias', icono: 'dependencias' },
      { href: '/dashboard/admin/municipio', label: 'Municipio', icono: 'municipio' },
      { href: '/dashboard/admin/historicos', label: 'Históricos', icono: 'historicos' },
      { href: '/dashboard/configuracion', label: 'Configuración', icono: 'configuracion' },
    ],
    // Supervisión (asesor y supervisor): la PERSONA y el EXPEDIENTE son dos
    // lentes sobre el mismo ámbito, y ambas hacen falta. Por la persona se
    // sigue el desempeño; por el contrato se llega a los periodos que aún no
    // se han enviado —incluido el desbloqueo del envío tardío—, que no tienen
    // otra puerta. Faltaba la segunda: había que escribir la URL a mano.
    asesor: [
      { href: '/dashboard', label: 'Inicio', icono: 'inicio' },
      { href: '/dashboard/contratistas', label: 'Contratistas', icono: 'contratistas' },
      { href: '/dashboard/contratos', label: 'Contratos', icono: 'contratos' },
      { href: '/dashboard/informes', label: mesLabel, icono: 'informes' },
      { href: '/dashboard/configuracion', label: 'Configuración', icono: 'configuracion' },
    ],
    supervisor: [
      { href: '/dashboard', label: 'Inicio', icono: 'inicio' },
      { href: '/dashboard/colaboradores', label: 'Colaboradores', icono: 'colaboradores' },
      { href: '/dashboard/contratos', label: 'Contratos', icono: 'contratos' },
      { href: '/dashboard/informes', label: mesLabel, icono: 'informes' },
      { href: '/dashboard/configuracion', label: 'Configuración', icono: 'configuracion' },
    ],
    contratista: [
      { href: '/dashboard', label: 'Inicio', icono: 'inicio' },
      { href: '/dashboard/contratos', label: 'Mis contratos', icono: 'contratos' },
      { href: '/dashboard/configuracion', label: 'Configuración', icono: 'configuracion' },
    ],
    // Dependencia de Contratación: ciclo de vida del contrato y de las cuentas
    // de contratista (crear, corregir, obligaciones, periodos, otrosíes).
    // Sin acceso al flujo de informes (aprobar/rechazar/radicar), a las firmas,
    // a las dependencias, a la carga masiva desde Excel ni a la configuración
    // del municipio. La creación del contratista va embebida en el formulario
    // de contrato.
    contratacion: [
      { href: '/dashboard', label: 'Inicio', icono: 'inicio' },
      { href: '/dashboard/contratos', label: 'Contratos', icono: 'contratos' },
      { href: '/dashboard/admin/usuarios', label: 'Usuarios', icono: 'usuarios' },
      { href: '/dashboard/configuracion', label: 'Configuración', icono: 'configuracion' },
    ],
  }

  return menus[rol] ?? menus.contratista
}

// ─── Seguridad Social ────────────────────────

/**
 * Piso de cotización a la Seguridad Social (Fredonia 2026).
 * Aplica cuando el 40% del valor mensual del contrato queda por debajo de este piso.
 * El admin puede sobreescribir este valor por periodo en periodos.base_cotizacion_ss
 * (incluso en periodos radicados o históricos).
 */
export const DEFAULT_BASE_COTIZACION_SS = 1_750_905

/**
 * Calcula la base de cotización a la Seguridad Social según la regla legal:
 *
 *   Si valor_mensual ≤ 4.377.262   → DEFAULT_BASE_COTIZACION_SS (piso)
 *   Si valor_mensual >  4.377.262   → valor_mensual × 0.40
 *
 * El umbral (4.377.262) es el valor mensual a partir del cual el 40% supera al piso.
 * Equivalente a: max(DEFAULT_BASE_COTIZACION_SS, valor_mensual × 0.40)
 *
 * El resultado es el valor por defecto que se aplica cuando el admin no ha
 * editado manualmente la base del periodo. La edición manual siempre gana.
 */
export function calcularBaseCotizacionSS(valorMensual: number): number {
  const cuarenta = Math.round(valorMensual * 0.4)
  return Math.max(DEFAULT_BASE_COTIZACION_SS, cuarenta)
}

// ─── Pending review state per role ──────────

/** The estado a role sees in their pending queue */
export const ESTADO_COLA_POR_ROL: Partial<Record<Rol, EstadoPeriodo | EstadoPeriodo[]>> = {
  supervisor: 'enviado',
  admin: 'enviado',
}
