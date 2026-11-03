/**
 * Las opciones del menú de tres puntos de un informe, según su estado (rediseño de noviembre de 2026).
 *
 * Todas ya existen en el sistema, en otras pantallas; el menú solo las acerca:
 *   · siempre: ver el informe completo, ver el contrato y el historial (quién hizo qué y cuándo);
 *   · aprobado: radicar (pide el número de radicado);
 *   · aprobado o radicado: descargar el paquete de documentos; si está radicado, copiar el número;
 *   · por revisar: devolver (pide un motivo);
 *   · sin enviar: recordar al contratista y, si el mes ya cerró, habilitar el envío tardío.
 */

import type { OpcionMenu } from '@/components/ui/MenuOpciones'
import { Iconos } from '@/lib/iconos'
import type { EstadoTarjeta } from './TarjetaInforme'

export interface AccionesInforme {
  hrefInforme: string
  hrefContrato: string
  hrefHistorial: string
  hrefDocumentos: string
  numeroRadicado: string | null
  mesCerrado: boolean
  onRadicar?: () => void
  onCopiarRadicado?: () => void
  onDevolver?: () => void
  onRecordar?: () => void
  onHabilitarTardio?: () => void
}

export function opcionesDeInforme(estado: EstadoTarjeta, a: AccionesInforme): OpcionMenu[] {
  const lista: OpcionMenu[] = [
    { id: 'informe', etiqueta: 'Ver informe completo', icono: Iconos.accion.ver, href: a.hrefInforme },
  ]
  if (estado === 'aprobado' && a.onRadicar) {
    lista.push({ id: 'radicar', etiqueta: 'Radicar', icono: Iconos.estado.aprobado, onSelect: a.onRadicar })
  }
  if (estado === 'aprobado' || estado === 'radicado') {
    lista.push({ id: 'documentos', etiqueta: 'Descargar documentos', icono: Iconos.documentos.descargar, href: a.hrefDocumentos, nuevaPestana: true })
  }
  if (estado === 'radicado' && a.numeroRadicado && a.onCopiarRadicado) {
    lista.push({ id: 'copiar', etiqueta: 'Copiar n.º de radicado', icono: Iconos.accion.copiar, onSelect: a.onCopiarRadicado })
  }
  if (estado === 'sin_enviar' && a.onRecordar) {
    lista.push({ id: 'recordar', etiqueta: 'Recordar al contratista', icono: Iconos.aviso.notificaciones, onSelect: a.onRecordar })
  }
  if (estado === 'sin_enviar' && a.mesCerrado && a.onHabilitarTardio) {
    lista.push({ id: 'tardio', etiqueta: 'Habilitar envío tardío', icono: Iconos.estado.desbloqueado, onSelect: a.onHabilitarTardio })
  }
  lista.push(
    { id: 'contrato', etiqueta: 'Ver contrato', icono: Iconos.navegacion.contratos, href: a.hrefContrato },
    { id: 'historial', etiqueta: 'Historial del informe', icono: Iconos.dominio.actividad, href: a.hrefHistorial },
  )
  if (estado === 'por_revisar' && a.onDevolver) {
    lista.push({ id: 'devolver', etiqueta: 'Devolver al contratista', icono: Iconos.accion.devolver, onSelect: a.onDevolver, peligro: true })
  }
  return lista
}
