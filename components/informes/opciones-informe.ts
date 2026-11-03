/**
 * Las opciones del menú de tres puntos de un informe, según su estado (rediseño de noviembre de 2026).
 *
 * La idea: que quien revisa no tenga que salir de /dashboard/informes.
 *   · siempre: ver el informe de actividades (vista previa del documento, ahí mismo), el contrato y el historial (en una
 *     ventana);
 *   · si hay planilla: verla en una ventana (y aprobarla o devolverla);
 *   · aprobado: radicar (pide el número de radicado);
 *   · aprobado o radicado: descargar documentos, una lista con cada uno (antes de aprobar no hay actas que descargar);
 *   · por revisar: devolver (pide un motivo);
 *   · sin enviar: recordar al contratista y, si el mes ya cerró, habilitar el envío tardío.
 * El número de radicado se copia tocándolo en la tarjeta, no desde aquí.
 */

import type { OpcionMenu } from '@/components/ui/MenuOpciones'
import { Iconos } from '@/lib/iconos'
import type { EstadoTarjeta } from './TarjetaInforme'

export interface AccionesInforme {
  periodoId: string
  hrefContrato: string
  mesCerrado: boolean
  onVerInforme: () => void
  onHistorial: () => void
  onVerPlanilla?: () => void
  onRadicar?: () => void
  onDevolver?: () => void
  onRecordar?: () => void
  onHabilitarTardio?: () => void
}

/** Lo que se puede descargar de un informe aprobado o radicado: cada documento y los dos paquetes. */
function documentos(periodoId: string): OpcionMenu[] {
  const base = `/api/pdf/${periodoId}`
  const doc = (id: string, etiqueta: string, icono: OpcionMenu['icono']): OpcionMenu =>
    ({ id, etiqueta, icono, href: `${base}/${id}`, descarga: true })
  return [
    doc('informe', 'Informe de actividades', Iconos.documentos.informe),
    doc('cuenta-cobro', 'Cuenta de cobro', Iconos.documentos.cuentaCobro),
    doc('acta-supervision', 'Acta de supervisión', Iconos.documentos.actaSupervision),
    doc('acta-pago', 'Acta de pago', Iconos.documentos.actaPago),
    doc('paquete', 'Todo junto (ZIP)', Iconos.documentos.paquete),
    doc('secop', 'Paquete para SECOP (ZIP)', Iconos.documentos.paquete),
  ]
}

export function opcionesDeInforme(estado: EstadoTarjeta, a: AccionesInforme): OpcionMenu[] {
  const lista: OpcionMenu[] = [
    { id: 'informe', etiqueta: 'Ver informe de actividades', icono: Iconos.accion.ver, onSelect: a.onVerInforme },
  ]
  if (a.onVerPlanilla) {
    lista.push({ id: 'planilla', etiqueta: 'Ver planilla', icono: Iconos.documentos.planilla, onSelect: a.onVerPlanilla })
  }
  if (estado === 'aprobado' && a.onRadicar) {
    lista.push({ id: 'radicar', etiqueta: 'Radicar', icono: Iconos.estado.aprobado, onSelect: a.onRadicar })
  }
  if (estado === 'aprobado' || estado === 'radicado') {
    lista.push({ id: 'documentos', etiqueta: 'Descargar documentos', icono: Iconos.documentos.descargar, submenu: documentos(a.periodoId) })
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
