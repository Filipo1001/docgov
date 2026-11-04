/**
 * Las opciones del menú de tres puntos de un informe, según su estado (rediseño de noviembre de 2026).
 *
 * La idea: que quien revisa no tenga que salir de /dashboard/informes.
 *   · siempre: ver documentos (la ventana de revisión, con una pestaña por documento: informe, cuenta de cobro, planilla,
 *     soporte y, desde que se aprueba, las actas), el contrato y el historial (en una ventana);
 *   · aprobado: radicar (pide el número de radicado);
 *   · aprobado o radicado: descargar documentos, una lista con casillas; se marca lo que se necesita (o «Todo», o «Lo de
 *     SECOP») y «Descargar (N)» baja uno suelto o un ZIP con los marcados (ver `DOCUMENTOS_DESCARGABLES`);
 *   · por revisar: devolver (pide un motivo);
 *   · sin enviar: recordar al contratista y, si el mes ya cerró, habilitar el envío tardío.
 * El número de radicado se copia tocándolo en la tarjeta, no desde aquí.
 */

import type { OpcionMenu, SeleccionMenu } from '@/components/ui/MenuOpciones'
import { Iconos } from '@/lib/iconos'
import type { EstadoTarjeta } from './TarjetaInforme'

export interface AccionesInforme {
  hrefContrato: string
  mesCerrado: boolean
  /** Para el supervisor, «Lo de SECOP» son sus dos actas; para los demás, lo de la contratista. */
  esSupervisor: boolean
  tienePlanilla: boolean
  tieneSoporte: boolean
  onVerDocumentos: () => void
  onHistorial: () => void
  onDescargar: (ids: string[]) => void
  onRadicar?: () => void
  onDevolver?: () => void
  onRecordar?: () => void
  onHabilitarTardio?: () => void
}

/** Lo que se puede descargar de un informe aprobado o radicado, en el orden del paquete. */
export const DOCUMENTOS_DESCARGABLES = [
  { id: 'informe', etiqueta: 'Informe de actividades', icono: Iconos.documentos.informe },
  { id: 'cuenta-cobro', etiqueta: 'Cuenta de cobro', icono: Iconos.documentos.cuentaCobro },
  { id: 'acta-supervision', etiqueta: 'Acta de supervisión', icono: Iconos.documentos.actaSupervision },
  { id: 'acta-pago', etiqueta: 'Acta de pago', icono: Iconos.documentos.actaPago },
  { id: 'planilla', etiqueta: 'Planilla de seguridad social', icono: Iconos.documentos.planilla },
  { id: 'soporte', etiqueta: 'Soporte de pago', icono: Iconos.documentos.soportePago },
] as const

/** Lo que la CONTRATISTA sube a SECOP II de cada cuenta. Con exactamente esto marcado se baja el paquete SECOP de siempre,
 * que además suma el contrato y la certificación de retención en la primera cuenta, y el acta de terminación en la última. */
export const DOCUMENTOS_SECOP = ['informe', 'cuenta-cobro', 'planilla', 'soporte']

/** Lo que el SUPERVISOR sube a SECOP II: sus dos actas (Felipe, 3-nov-2026). Es lo que marca su «Lo de SECOP». */
export const DOCUMENTOS_SECOP_SUPERVISOR = ['acta-supervision', 'acta-pago']

function descargas(a: AccionesInforme): SeleccionMenu {
  const opciones = DOCUMENTOS_DESCARGABLES.filter(d =>
    d.id === 'planilla' ? a.tienePlanilla : d.id === 'soporte' ? a.tieneSoporte : true)
  const hay = new Set(opciones.map(o => o.id as string))
  return {
    opciones: [...opciones],
    atajos: [
      { etiqueta: 'Todo', ids: [...hay] },
      { etiqueta: 'Lo de SECOP', ids: (a.esSupervisor ? DOCUMENTOS_SECOP_SUPERVISOR : DOCUMENTOS_SECOP).filter(id => hay.has(id)) },
    ],
    accion: 'Descargar',
    onConfirmar: a.onDescargar,
  }
}

export function opcionesDeInforme(estado: EstadoTarjeta, a: AccionesInforme): OpcionMenu[] {
  const lista: OpcionMenu[] = [
    { id: 'documentos-ver', etiqueta: 'Ver documentos', icono: Iconos.accion.ver, onSelect: a.onVerDocumentos },
  ]
  if (estado === 'aprobado' && a.onRadicar) {
    lista.push({ id: 'radicar', etiqueta: 'Radicar', icono: Iconos.estado.aprobado, onSelect: a.onRadicar })
  }
  if (estado === 'aprobado' || estado === 'radicado') {
    lista.push({ id: 'documentos', etiqueta: 'Descargar documentos', icono: Iconos.documentos.descargar, seleccion: descargas(a) })
  }
  if (estado === 'sin_enviar' && a.onRecordar) {
    lista.push({ id: 'recordar', etiqueta: 'Recordar al contratista', icono: Iconos.aviso.notificaciones, onSelect: a.onRecordar })
  }
  if (estado === 'sin_enviar' && a.mesCerrado && a.onHabilitarTardio) {
    lista.push({ id: 'tardio', etiqueta: 'Habilitar envío tardío', icono: Iconos.estado.desbloqueado, onSelect: a.onHabilitarTardio })
  }
  lista.push(
    { id: 'contrato', etiqueta: 'Ver contrato', icono: Iconos.navegacion.contratos, href: a.hrefContrato },
    { id: 'historial', etiqueta: 'Historial del informe', icono: Iconos.dominio.actividad, onSelect: a.onHistorial },
  )
  if (estado === 'por_revisar' && a.onDevolver) {
    lista.push({ id: 'devolver', etiqueta: 'Devolver al contratista', icono: Iconos.accion.devolver, onSelect: a.onDevolver, peligro: true })
  }
  return lista
}
