/**
 * Validación de completitud de datos antes de generar un PDF.
 *
 * Los generadores de PDF asumen que ciertos campos existen (hacen
 * `.toUpperCase()`, etc. sobre ellos). Si faltan, el render lanza una
 * excepción y el usuario recibe un error 500 críptico justo al intentar
 * descargar su documento.
 *
 * En vez de parchear decenas de accesos en cada plantilla, validamos aquí —
 * en un solo punto— los datos OBLIGATORIOS por tipo de documento y devolvemos
 * un mensaje claro indicando exactamente qué falta. La ruta lo convierte en un
 * 422 legible en lugar de un 500.
 */

import type { PDFData } from './types'

export type TipoDocumento =
  | 'cuenta-cobro'
  | 'informe'
  | 'acta-supervision'
  | 'acta-pago'

function esVacio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

/**
 * Devuelve la lista de campos faltantes (vacía si todo está completo).
 * El mensaje está en lenguaje del usuario final, no técnico.
 */
export function validarDatosPDF(tipo: TipoDocumento, data: PDFData): string[] {
  const faltantes: string[] = []
  const c = data.contrato
  const contratista = c?.contratista
  const supervisor = c?.supervisor

  // ── Comunes a todos los documentos ──────────────────────────────────────
  if (esVacio(contratista?.nombre_completo)) faltantes.push('Nombre del contratista')
  if (esVacio(contratista?.cedula)) faltantes.push('Cédula del contratista')
  if (esVacio(c?.objeto)) faltantes.push('Objeto del contrato')
  if (esVacio(c?.numero)) faltantes.push('Número del contrato')

  // ── Datos bancarios — obligatorios para documentos de cobro/pago ─────────
  if (tipo === 'cuenta-cobro' || tipo === 'acta-pago') {
    if (esVacio(c?.banco)) faltantes.push('Banco del contratista')
    if (esVacio(c?.tipo_cuenta)) faltantes.push('Tipo de cuenta bancaria')
    if (esVacio(c?.numero_cuenta)) faltantes.push('Número de cuenta bancaria')
  }

  // ── Valores en letras — necesarios para los documentos financieros ───────
  if (tipo === 'cuenta-cobro') {
    if (esVacio(c?.valor_letras_total) && esVacio(data.periodo?.valor_letras)) {
      faltantes.push('Valor del contrato en letras')
    }
  }
  if (tipo === 'acta-pago' || tipo === 'acta-supervision') {
    if (esVacio(c?.valor_letras_total)) faltantes.push('Valor del contrato en letras')
  }

  // ── Supervisor — necesario en actas (las firma/menciona) ─────────────────
  if (tipo === 'acta-supervision' || tipo === 'acta-pago') {
    if (esVacio(supervisor?.nombre_completo)) faltantes.push('Nombre del supervisor')
  }

  return faltantes
}

/** Mensaje de usuario listo para mostrar, o null si todo está completo. */
export function mensajeDatosFaltantes(tipo: TipoDocumento, data: PDFData): string | null {
  const faltantes = validarDatosPDF(tipo, data)
  if (faltantes.length === 0) return null
  const lista = faltantes.join(', ')
  return `No se puede generar el documento porque faltan datos obligatorios: ${lista}. ` +
    `Complétalos en el perfil del contratista o en los datos del contrato e intenta de nuevo.`
}
