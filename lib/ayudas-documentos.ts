/**
 * Qué es cada documento del formulario de envío del informe, en palabras de quien lo sube.
 *
 * Es lo que aparece al pasar el cursor (o tocar) el icono de información de cada botón del panel de documentos (`PanelDocumentos`). Van aquí y no
 * dentro de la pantalla para que haya un solo lugar donde corregir una frase, y porque una prueba comprueba que ninguna
 * quede vacía ni se alargue tanto que deje de leerse de un vistazo.
 *
 * Reglas al escribirlas: decir qué ES el documento y de dónde sale, no cómo se sube (eso lo dice la propia fila); sin
 * citar normas ni operadores concretos que el sistema no verifica.
 */
export const AYUDA_DOCUMENTO = {
  planilla:
    'La planilla PILA del mes: el documento donde constan tus aportes a salud, pensión y riesgos laborales. La genera el operador por el que haces el pago.',
  numeroPlanilla:
    'El número que identifica tu planilla, tal como aparece en el documento: solo dígitos, entre 6 y 20.',
  soportePago:
    'El comprobante de que esa planilla se pagó: el recibo o la confirmación del banco o del operador de pagos. Hacienda lo pide junto con la planilla.',
  factura:
    'Tu factura electrónica del mes. En tu caso reemplaza a la Cuenta de Cobro, que por eso el sistema no genera.',
} as const

/**
 * Lo mismo, dicho a quien REVISA (supervisor, asesor, administrador) en el panel de la planilla: habla del contratista en
 * tercera persona y explica también los dos datos que el revisor verifica (el mes y la base de cotización).
 */
export const AYUDA_REVISION = {
  planilla:
    'La planilla PILA del mes: el documento donde constan los aportes del contratista a salud, pensión y riesgos laborales.',
  numeroPlanilla:
    'El número que identifica la planilla, tal como aparece en el documento. Lo escribe el contratista.',
  soportePago:
    'El comprobante de que esa planilla se pagó: el recibo o la confirmación del banco o del operador de pagos. Hacienda lo pide junto con la planilla.',
  mesCotizacion:
    'El mes que cubre la planilla. El sistema sugiere el del informe; confírmalo o cámbialo si la planilla es de otro.',
  baseCotizacion:
    'La base sobre la que se cotiza (IBC). La calcula el acta con el valor del contrato; si la planilla trae otra, se corrige aquí.',
} as const

export type ClaveAyudaDocumento = keyof typeof AYUDA_DOCUMENTO

/** Largo máximo para que el letrero se lea de un vistazo, también en una pantalla de 320 px. */
export const LARGO_MAXIMO_AYUDA = 200
