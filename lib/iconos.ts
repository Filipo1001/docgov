/**
 * lib/iconos.ts — Sistema de iconografía de Contratista Digital.
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────
 *
 * Antes convivían dos sistemas: unos 200 emojis y 115 etiquetas <svg> escritas
 * a mano. Ninguno de los dos era un sistema: eran colecciones.
 *
 * El emoji, además, no es un icono — es texto que dibuja el sistema operativo
 * del usuario. El mismo carácter se ve distinto en Windows, Android, iOS y
 * macOS, así que la misma pantalla se veía diferente para cada persona. Y no
 * se le puede fijar color, grosor ni tamaño óptico: siempre sale a todo color,
 * chocando con una marca monocroma.
 *
 * ── Las reglas ───────────────────────────────────────────────────────────
 *
 * 1. TODOS los iconos salen de Lucide. Mismo trazado sobre rejilla de 24×24 y
 *    mismo grosor, que es lo que los convierte en familia. Si hace falta uno
 *    nuevo, se añade aquí — nunca se dibuja un <svg> suelto en una pantalla.
 *
 * 2. UNA SOLA ESCALA: 16 en línea y tablas densas · 20 en navegación y listas
 *    · 24 en cabeceras y estados vacíos. Nada intermedio.
 *
 * 3. MONOCROMOS. El icono hereda el color del texto que acompaña
 *    (`currentColor`). El color solo aparece cuando significa estado —error,
 *    éxito, advertencia—, nunca como decoración. Un contrato no es azul porque
 *    los contratos sean azules.
 *
 * 4. EL ICONO NUNCA CARGA EL SIGNIFICADO SOLO. Siempre con etiqueta visible o,
 *    si va suelto en un botón, con `aria-label`.
 *
 * El objetivo es que el icono desaparezca: en una interfaz institucional bien
 * hecha no se notan los iconos, se nota que encuentras las cosas.
 */

import {
  // Navegación
  LayoutDashboard, Users, PenLine, FileText, ClipboardList, Building2,
  Landmark, Archive, Settings, UserCog,
  // Documentos
  FileCheck2, Receipt, FileSignature, FileSpreadsheet, Files, Paperclip,
  Download, Upload, FolderOpen, ScrollText,
  // Estado y retroalimentación
  Check, CheckCircle2, XCircle, AlertTriangle, Info, CircleDashed, Clock,
  Lock, Unlock, ShieldCheck, Ban,
  // Acciones
  Plus, Pencil, Trash2, Search, X, ChevronRight, ChevronDown, RefreshCw,
  Eye, Send, MoreHorizontal, ExternalLink, Copy, Filter,
  // Personas y avisos
  Bell, Mail, MessageSquare, UserPlus, Building,
  // Dominio
  CalendarDays, Coins, Stethoscope, Sparkles, QrCode, Hash, MapPin, Phone,
  type LucideIcon,
} from 'lucide-react'

/**
 * Catálogo con nombres del dominio, no de la librería.
 *
 * La pantalla pide `documentos.cuentaCobro`, no `Receipt`. Así el día que se
 * cambie el icono de una cuenta de cobro se toca aquí y no en once archivos, y
 * quien lee el código entiende qué significa sin conocer Lucide.
 */
export const Iconos = {
  navegacion: {
    inicio: LayoutDashboard,
    usuarios: Users,
    firmas: PenLine,
    contratos: FileText,
    informes: ClipboardList,
    dependencias: Building2,
    municipio: Landmark,
    historicos: Archive,
    configuracion: Settings,
    contratistas: Users,
    colaboradores: UserCog,
  },

  documentos: {
    informe: FileCheck2,
    cuentaCobro: Receipt,
    actaSupervision: ClipboardList,
    actaPago: FileSignature,
    actaTerminacion: ScrollText,
    certificacion: FileSpreadsheet,
    planilla: Stethoscope,
    paquete: Files,
    adjunto: Paperclip,
    expediente: FolderOpen,
    descargar: Download,
    subir: Upload,
  },

  estado: {
    ok: Check,
    aprobado: CheckCircle2,
    rechazado: XCircle,
    advertencia: AlertTriangle,
    informacion: Info,
    pendiente: CircleDashed,
    enEspera: Clock,
    bloqueado: Lock,
    desbloqueado: Unlock,
    verificado: ShieldCheck,
    vetado: Ban,
  },

  accion: {
    agregar: Plus,
    editar: Pencil,
    eliminar: Trash2,
    buscar: Search,
    cerrar: X,
    avanzar: ChevronRight,
    desplegar: ChevronDown,
    recargar: RefreshCw,
    ver: Eye,
    enviar: Send,
    mas: MoreHorizontal,
    abrirFuera: ExternalLink,
    copiar: Copy,
    filtrar: Filter,
  },

  aviso: {
    notificaciones: Bell,
    correo: Mail,
    mensaje: MessageSquare,
    nuevoUsuario: UserPlus,
    entidad: Building,
  },

  dominio: {
    periodo: CalendarDays,
    valor: Coins,
    seguridadSocial: Stethoscope,
    ia: Sparkles,
    verificacion: QrCode,
    numero: Hash,
    ubicacion: MapPin,
    telefono: Phone,
  },
} as const

/**
 * La escala. Tres tamaños y ningún intermedio.
 *
 * El grosor sube a 1.75 en 16 px: a ese tamaño un trazo de 1.5 se desvanece en
 * pantallas sin retina, que son las de buena parte de las alcaldías.
 */
export const TAMANOS = {
  sm: { size: 16, strokeWidth: 1.75 },  // en línea, tablas densas, badges
  md: { size: 20, strokeWidth: 1.5 },   // navegación, ítems de lista
  lg: { size: 24, strokeWidth: 1.5 },   // cabeceras, estados vacíos
} as const

export type TamanoIcono = keyof typeof TAMANOS
export type { LucideIcon }
