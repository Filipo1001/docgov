/**
 * Generador del brochure institucional de Contratista Digital.
 *
 *   node scripts/brochure.mjs
 *
 * ── Por qué un script y no un diseño suelto ──────────────────────────────
 *
 * El brochure afirma cifras de operación e infraestructura. Esas cifras
 * envejecen: el día que se imprima con números de hace cuatro meses, delante
 * de alguien que pregunta, valen menos que no ponerlas. Manteniéndolo como
 * código, actualizar el documento es cambiar la constante de arriba y volver
 * a ejecutar, en vez de reabrir un archivo de diseño que quizá ya nadie tenga.
 *
 * Toda cifra de este archivo salió de una consulta a producción el 26 de
 * agosto de 2026, no de PRODUCTO.md ni de memoria. Las que no se pudieron
 * verificar no están.
 *
 * ── Qué cambió frente a la primera versión ───────────────────────────────
 *
 * La primera tenía razón en el contenido pero le faltaba el filo de la
 * propuesta comercial. Se le trae lo que allí funciona:
 *
 *   · EL DIAGNÓSTICO EN SEGUNDA PERSONA. Seis señales de «lo está haciendo
 *     mal» abren el documento. Acusan a propósito —despiertan más que una
 *     lista de beneficios— y cierran absolviendo a las personas y culpando al
 *     método, porque un secretario que se siente juzgado deja de leer.
 *   · UN QR QUE SE ESCANEA DE VERDAD. Antes la verificación se mencionaba;
 *     ahora el papel la demuestra. Es el momento que más convence y un código
 *     de adorno lo arruinaría, así que se genera de verdad.
 *   · EL CONTROL ANTIFRAUDE Y LOS RECORDATORIOS, que estaban enterrados en la
 *     rejilla de capacidades como dos líneas más. Son de lo más difícil de
 *     replicar y merecían su propia página.
 *
 * Las cifras se refrescaron: entre el 18 y el 26 de agosto los periodos
 * pasaron de 508 a 625 y las evidencias de 2.975 a 3.855. Una cifra vieja en
 * un documento comercial vale menos que no ponerla.
 *
 * Usa @react-pdf/renderer, que ya genera los documentos del sistema, así que
 * no añade dependencias. Va en JavaScript plano con `createElement` porque
 * Node ejecuta .mjs sin compilar: un script de una sola función no justifica
 * arrastrar una cadena de build.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createElement as h } from 'react'
import QRCode from 'qrcode'
import {
  Document, Page, Text, View, StyleSheet, Font, Svg, Path, Image, renderToFile,
} from '@react-pdf/renderer'

// El español parte fatal por sílabas con el diccionario por defecto.
Font.registerHyphenationCallback(palabra => [palabra])

// ── Identidad ───────────────────────────────────────────────────────────────
const TINTA   = '#192031'   // lib/marca.ts
const TINTA_2 = '#242F45'
const VERDE   = '#10B981'
const TEXTO   = '#454C5C'
const SUAVE   = '#6B7280'
const FONDO   = '#F5F6F8'
const LINEA   = '#E4E7EC'

const VERIFICADO = '1 de septiembre de 2026'

/* El pie llevaba «Agosto de 2026» escrito a mano y sobrevivió a la emisión de
   septiembre: una propuesta fechada el mes pasado envejece sola. Se deriva de
   la fecha de generación para que no vuelva a pasar. */
const MES_EMISION = (() => {
  const f = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' })
    .format(new Date())
  return f.charAt(0).toUpperCase() + f.slice(1).replace(' de ', ' de ')
})()

/**
 * A qué municipio va dirigido este ejemplar.
 *
 * El brochure nació genérico —una ficha de empresa— y así servía para todos y
 * para ninguno. Va impreso y se deja sobre una mesa concreta, así que lleva el
 * nombre y el escudo de quien lo recibe, y la cifra que se le cotizó.
 *
 * Se elige con el segundo argumento: `node scripts/brochure.mjs salida.pdf dabeiba`.
 * Sin argumento sale la versión genérica, sin escudo ni precio, que es la que
 * sirve para una feria o un primer contacto.
 */
const MUNICIPIOS = {
  dabeiba: {
    nombre: 'Dabeiba',
    articulo: 'la Alcaldía Municipal de Dabeiba',
    escudo: path.join(process.cwd(), 'public', 'marca', 'escudo-dabeiba.png'),
    precio: '$3.900.000',
    implementacion: '$5.000.000',
    vigencia: 'Desde la suscripción del acta de inicio y hasta el 31 de diciembre de 2026.',
  },
  'el-bagre': {
    nombre: 'El Bagre',
    articulo: 'la Alcaldía Municipal de El Bagre',
    escudo: path.join(process.cwd(), 'public', 'marca', 'escudo-el-bagre.png'),
    precio: '$4.990.000',
  },
  /**
   * Venecia es el primero con DOS caminos de implementación, así que trae
   * `implementaciones` (plural) en vez de `implementacion`. El renderizado
   * acepta ambas formas: los municipios anteriores no se tocan.
   *
   * La opción A va primero y marcada, y no por margen: la B deja el cargue en
   * el equipo de contratación, que es el cuello de botella real de una
   * alcaldía pequeña. Si el cargue se aplaza, la plataforma queda vacía justo
   * cuando hay que demostrar que sirve. Por eso lo que se enuncia como
   * diferencia no es «quién digita» sino el tiempo hasta el primer ciclo:
   * es lo único que la B no puede prometer, porque no depende de nosotros.
   */
  /**
   * Angelópolis no aportó escudo. El generador ya lo contempla —ESCUDO queda
   * en null si el archivo no existe y la portada no lo dibuja— así que no
   * hace falta nada más: el nombre del municipio en el pie de portada cumple
   * la función de anclaje. Si más adelante llega el escudo oficial, basta con
   * dejarlo en public/marca/escudo-angelopolis.png.
   *
   * Una sola implementación, como Dabeiba: `implementacion` en singular. La
   * forma plural la estrenó Venecia y sigue disponible para quien la use.
   */
  angelopolis: {
    nombre: 'Angelópolis',
    articulo: 'la Alcaldía Municipal de Angelópolis',
    escudo: path.join(process.cwd(), 'public', 'marca', 'escudo-angelopolis.png'),
    precio: '$1.990.000',
    implementacion: '$2.990.000',
    // Sin «con su historial»: cargar periodos pasados es un alcance mucho
    // mayor y no conviene prometerlo. Mismo criterio que en Venecia.
    implementacionTexto: 'Pago único. Creación de los usuarios de todas las secretarías, cargue de los contratos vigentes, adaptación de los documentos al formato de Angelópolis, capacitación por rol y acompañamiento durante el primer ciclo mensual completo.',
    vigencia: 'Desde la suscripción del acta de inicio y hasta el 31 de diciembre de 2026.',
  },
  venecia: {
    nombre: 'Venecia',
    articulo: 'la Alcaldía Municipal de Venecia',
    escudo: path.join(process.cwd(), 'public', 'marca', 'escudo-venecia.png'),
    precio: '$2.400.000',
    implementaciones: [
      { etiqueta: 'Implementación A · $4.990.000 · recomendada',
        texto: 'Pago único. Nosotros creamos los usuarios de todas las secretarías y cargamos los contratos vigentes. Incluye la adaptación de los documentos al formato de Venecia, capacitación por rol y acompañamiento durante el primer ciclo mensual completo. Su primer cierre de mes sale en la plataforma.' },
      { etiqueta: 'Implementación B · $3.990.000',
        texto: 'Pago único. Creación de los usuarios de todas las secretarías y adaptación de los documentos al formato de Venecia. El cargue de los contratos lo realiza el municipio: capacitamos al equipo de contratación y damos soporte durante el proceso.' },
    ],
    vigencia: 'Desde la suscripción del acta de inicio y hasta el 31 de diciembre de 2026.',
  },
}

/** Qué pasa al terminar. Mismo texto que la propuesta web, para que no divergan. */
const TERMINACION = [
  ['Consulta por 3 meses', 'La plataforma sigue disponible en modo consulta durante los tres meses siguientes a la terminación, sin permitir la creación de nuevos contratos ni periodos.'],
  ['Entrega en 30 días hábiles', 'La totalidad de la información se entrega en dos formatos: los documentos en PDF, organizados por contrato y periodo, y los datos en formato abierto (XLSX y CSV).'],
  ['Con acta de entrega', 'Se entrega al supervisor del contrato o a quien la Alcaldía designe por escrito, mediante acta firmada.'],
  ['Verificación indefinida', 'Los códigos QR de los documentos ya emitidos siguen resolviendo de forma indefinida y sin costo.'],
  ['Conservar o eliminar, lo decide la Alcaldía', 'Vencido el plazo de consulta, la información se conserva o se elimina según instrucción escrita de la Alcaldía y sus tablas de retención documental, conforme a la Ley 1581 de 2012.'],
]

const clave = process.argv[3]
const M = clave ? MUNICIPIOS[clave] : null
if (clave && !M) {
  console.error(`Municipio desconocido: ${clave}. Opciones: ${Object.keys(MUNICIPIOS).join(', ')}`)
  process.exit(1)
}
/** El escudo solo se dibuja si el archivo está de verdad. */
const ESCUDO = M && fs.existsSync(M.escudo) ? M.escudo : null

const A4 = { alto: 841.89, ancho: 595.28 }

/**
 * El diagnóstico, tomado de la propuesta comercial.
 *
 * Cuatro señales son de la alcaldía y dos del contratista, a propósito: si
 * todas apuntaran al despacho, el lector se pondría a la defensiva antes de
 * llegar a la solución.
 */
const DIAGNOSTICO = [
  'Si le piden el expediente de un contrato y toca buscarlo en un arrume de documentos, lo está haciendo mal.',
  'Si no sabe cuántos contratistas tiene ni si están trabajando, lo está haciendo mal.',
  'Si a fin de mes sus contratistas están armando papeles en vez de trabajando, lo está haciendo mal.',
  'Si no tiene la alcaldía en la palma de la mano —en cualquier lugar, a cualquier hora—, lo está haciendo mal.',
  'Si le devuelven cuentas de cobro por errores de redacción o de transcripción, lo está haciendo mal.',
  'Si un contratista tiene que llamar a preguntar por qué se retrasó su pago, lo está haciendo mal.',
]

/** El cron de recordatorios, tal como está configurado hoy. */
const RECORDATORIOS = [
  ['Día 25', 'Aviso a quien tiene el informe en borrador'],
  ['Día 28', 'Recordatorio urgente'],
  ['Día 2', 'Aviso de plazo vencido'],
  // Sin flechas: Helvetica no tiene el glifo U+2192 y @react-pdf lo sustituye
  // en silencio por una comilla. En pantalla se ve el error; en el papel, un
  // «sin radicar ' aviso a secretaría» que parece una errata de tecleo.
  ['Cada 5 días', 'Cuentas aprobadas sin radicar: aviso a secretaría'],
  ['60 y 30 días antes', 'Contratos por vencer: aviso a supervisión y administración'],
]

/** Las normas que el sistema hace cumplir, no que promete cumplir. */
const NORMAS = [
  ['Decreto 1082 de 2015', 'Bloquea el pago sin informe y sin supervisión'],
  ['Ley 1150 de 2007, Art. 83', 'Acta de supervisión por cada periodo'],
  ['Decreto 1273 de 2018', 'No deja enviar sin planilla de seguridad social válida'],
  ['Ley 1819 de 2016, Art. 383 E.T.', 'Certificación de retención en la fuente'],
]

const e = StyleSheet.create({
  pagina: {
    fontFamily: 'Helvetica', fontSize: 9.5, color: TEXTO,
    paddingTop: 54, paddingBottom: 62, paddingHorizontal: 54, lineHeight: 1.5,
  },
  portada: { fontFamily: 'Helvetica', backgroundColor: TINTA, padding: 54 },

  seccion:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: VERDE,
              textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 8 },
  titulo:   { fontSize: 21, fontFamily: 'Helvetica-Bold', color: TINTA,
              lineHeight: 1.22, marginBottom: 12 },
  entrada:  { fontSize: 11, color: TINTA, lineHeight: 1.55, marginBottom: 15 },
  parrafo:  { marginBottom: 10 },
  fuerte:   { fontFamily: 'Helvetica-Bold', color: TINTA },

  fila:     { flexDirection: 'row' },
  pie:      { position: 'absolute', bottom: 30, left: 54, right: 54,
              flexDirection: 'row', justifyContent: 'space-between',
              borderTop: `0.5pt solid ${LINEA}`, paddingTop: 8,
              fontSize: 7.5, color: SUAVE },
})

/** Isotipo oficial, del vectorial de public/marca/logo.svg. */
const Logo = ({ tam = 40, color = TINTA }) =>
  h(Svg, { width: tam, height: tam * (898.2 / 865.92), viewBox: '0 0 865.92 898.2' },
    h(Path, { fill: color, d: 'M815.85,832.56c-33.67,39-82.15,65.21-134.04,65.25l-493.66.39c-62.42.05-120.87-35.18-154.36-87.12C12.67,778.34.11,739.6.1,699.96L0,134.27c0-25.19,9.92-48.75,24.97-68.04,15.54-19.92,33.11-36.88,53.4-51.57C91.66,5.02,106.39-.02,123.04,0l181.72.19c14.88.02,27.94,5.44,39.7,13.31l41.74,37.32c5.71,5.1,13.84,7.58,21.91,7.58l318.95.25c30.18.02,58.74,11.88,82.2,30.02,36.94,28.57,56.69,72.99,56.66,119.56l-.37,492.78c-.04,48.12-18.18,95.04-49.7,131.54ZM319.91,528.58c-25.71.42-47.1-16.01-53.41-41.35-6.09-24.47-6-50.78.08-75.25,6.2-24.95,27.05-40.95,52.35-41.26,13.49-.54,26.11,3.34,36.22,12.14,7.7,7.35,12.36,16.78,14.74,26.93l46.01-10.67c-6.59-28.84-26.12-52.04-54.26-61.8-30.87-10.71-65.47-8.69-94.16,7.38-48.84,27.35-59.68,90.09-49.21,141.97,6.11,30.28,24.64,55.7,51.71,70.25,15.24,8.19,31.65,11.29,48.92,11.36,52.33.2,83.07-23.98,97.49-74.09l-45.32-13.67c-6.1,28.41-21.99,47.83-51.16,48.06ZM648.46,413.52c-7.65-38.67-31.57-69.61-71.48-76.57-12.44-2.01-24.33-2.03-37.15-2.03l-82.41-.02.03,229.83,101.41-.33c18.74-.06,35.95-5.09,51.45-14.85,40.59-28.46,47.2-90.25,38.15-136.03Z' }),
    h(Path, { fill: color, d: 'M600.04,413.13c6.6,29.26,8.18,85.21-16.84,104.26-9.24,5.69-19.55,8.23-30.56,8.3l-48.87.32-.06-151.95,46.07.24c12,.06,23.13,3.24,32.89,10.06,8.84,7.33,14.75,17.1,17.38,28.77Z' }))

/**
 * Pie con numeración calculada por el motor.
 *
 * Estaba escrita a mano. Bastó que una página desbordara para que hubiera dos
 * «5» seguidos: un número de página fijo es una afirmación sobre la
 * maquetación, y la maquetación la decide el renderizador, no el autor.
 */
const Pie = () =>
  h(View, { style: e.pie, fixed: true },
    h(Text, null, 'Contratista Digital'),
    h(Text, { render: ({ pageNumber }) => `contratistadigital.com   ·   ${pageNumber}` }))

const Encabezado = ({ etiqueta, titulo, entrada }) =>
  h(View, null,
    h(Text, { style: e.seccion }, etiqueta),
    h(Text, { style: e.titulo }, titulo),
    entrada ? h(Text, { style: e.entrada }, entrada) : null)

/**
 * Dato grande sobre fondo claro.
 *
 * El `lineHeight` explícito no es cosmético. Sin él, @react-pdf calcula la
 * altura de la línea con el interlineado heredado de la página —1.5 sobre un
 * cuerpo de 9.5— y le reserva 14 pt a un número dibujado a 21: el rótulo
 * arranca dentro del glifo y las dos líneas se montan. Se vio impreso.
 */
const Cifra = ({ n, rotulo, ancho = '33.33%' }) =>
  h(View, { style: { width: ancho, paddingRight: 12, marginBottom: 18 } },
    h(Text, { style: { fontSize: 21, fontFamily: 'Helvetica-Bold', color: TINTA,
                       lineHeight: 1.2 } }, n),
    h(Text, { style: { fontSize: 8, color: SUAVE, marginTop: 3, lineHeight: 1.35 } }, rotulo))

/** Renglón de tabla clave/valor. */
const Renglon = ({ k, v, ultimo }) =>
  h(View, { style: { flexDirection: 'row', paddingVertical: 4.6,
                     borderBottom: ultimo ? 'none' : `0.5pt solid ${LINEA}` } },
    h(Text, { style: { width: '32%', fontFamily: 'Helvetica-Bold', color: TINTA, fontSize: 9 } }, k),
    h(Text, { style: { width: '68%', fontSize: 9 } }, v))

/** Ítem con viñeta cuadrada, para listas densas. */
const Item = ({ children, ancho = '100%' }) =>
  h(View, { style: { width: ancho, flexDirection: 'row', paddingRight: 14, marginBottom: 4.5 } },
    h(View, { style: { width: 3, height: 3, backgroundColor: VERDE, marginTop: 5, marginRight: 7 } }),
    h(Text, { style: { flex: 1, fontSize: 8.8, lineHeight: 1.45 } }, children))

/** Capacidad: título en negrita y una línea de detalle. */
const Capacidad = ({ t, d }) =>
  h(View, { style: { width: '50%', paddingRight: 16, marginBottom: 12 } },
    h(Text, { style: { fontSize: 9.2, fontFamily: 'Helvetica-Bold', color: TINTA, marginBottom: 2 } }, t),
    h(Text, { style: { fontSize: 8.4, color: SUAVE, lineHeight: 1.42 } }, d))

const Paso = ({ n, t, d }) =>
  h(View, { style: { flexDirection: 'row', marginBottom: 9 } },
    h(View, { style: { width: 20, height: 20, borderRadius: 10, backgroundColor: TINTA,
                       alignItems: 'center', justifyContent: 'center', marginRight: 12 } },
      h(Text, { style: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Helvetica-Bold' } }, String(n))),
    h(View, { style: { flex: 1, paddingTop: 2 } },
      h(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TINTA, marginBottom: 2 } }, t),
      h(Text, { style: { fontSize: 8.8, lineHeight: 1.45 } }, d)))

/** `wrap: false` — una caja partida a la mitad por un salto de página se lee como un error de imprenta. */
const Caja = ({ children, fondo = FONDO, style }) =>
  h(View, { wrap: false, style: { backgroundColor: fondo, padding: 15, borderRadius: 4, ...(style || {}) } }, children)

/**
 * Señal numerada del diagnóstico.
 *
 * Va deliberadamente grande. Es la primera página de argumento y su trabajo es
 * que el lector se reconozca en al menos una de las seis: a cuerpo 9,5 y con
 * poco aire quedaban apretadas arriba y media hoja en blanco debajo, que se lee
 * como una sección a la que le faltó contenido en vez de una que acusa.
 */
const Senal = ({ n, texto, ultima }) =>
  h(View, { style: { flexDirection: 'row', paddingVertical: 17,
                     borderBottom: ultima ? 'none' : `0.5pt solid ${LINEA}` } },
    h(Text, { style: { width: 30, fontSize: 20, fontFamily: 'Helvetica-Bold',
                       color: '#C9CED8', lineHeight: 1.05 } }, String(n)),
    h(Text, { style: { flex: 1, fontSize: 11, lineHeight: 1.5, color: TINTA } }, texto))

// ── El documento ────────────────────────────────────────────────────────────
const Brochure = ({ qr }) => h(Document, {
  title: M ? `Contratista Digital — ${M.articulo}` : 'Contratista Digital — Brochure institucional',
  author: 'Contratista Digital',
  subject: 'Gestión documental contractual para alcaldías',
  creator: 'Contratista Digital',
},

  // ─── 1 · Portada ─────────────────────────────────────────────────────────
  h(Page, { size: 'A4', style: e.portada },
    h(View, { style: { flex: 1, justifyContent: 'space-between' } },

      h(View, null,
        h(Logo, { tam: 46, color: '#FFFFFF' }),
        h(Text, { style: { color: VERDE, fontSize: 8, fontFamily: 'Helvetica-Bold',
                           textTransform: 'uppercase', letterSpacing: 2, marginTop: 26 } },
          'Gestión documental contractual')),

      h(View, null,
        h(Text, { style: { color: '#FFFFFF', fontSize: 40, fontFamily: 'Helvetica-Bold',
                           lineHeight: 1.12, letterSpacing: -0.6 } },
          'Contratista\nDigital'),
        h(View, { style: { width: 54, height: 2.5, backgroundColor: VERDE, marginTop: 22, marginBottom: 22 } }),
        h(Text, { style: { color: '#C6CBD6', fontSize: 12.5, lineHeight: 1.6, maxWidth: 380 } },
          'El ciclo mensual de los contratos de prestación de servicios de una alcaldía, completo y sin plantillas de Word.'),
        h(Text, { style: { color: '#8B93A5', fontSize: 9.5, lineHeight: 1.6, maxWidth: 380, marginTop: 14 } },
          'Del registro de actividades del contratista hasta el paquete listo para SECOP II.')),

      h(View, null,
        // Destinatario, encima de las cifras: lo primero que confirma que este
        // ejemplar es para quien lo tiene en la mano y no un folleto genérico.
        M && h(View, { style: { flexDirection: 'row', alignItems: 'center',
                                gap: 12, marginBottom: 22 } },
          ESCUDO && h(Image, { src: ESCUDO, style: { width: 40, height: 40, objectFit: 'contain' } }),
          h(View, null,
            h(Text, { style: { color: '#8B93A5', fontSize: 7.5, textTransform: 'uppercase',
                               letterSpacing: 1.4 } }, 'Preparado para'),
            h(Text, { style: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Helvetica-Bold',
                               marginTop: 3 } }, M.articulo))),

        h(View, { style: { flexDirection: 'row', marginBottom: 26 } },
          ...[['126', 'contratos'], ['629', 'periodos'], ['6 meses', 'en producción']].map(([n, r], i) =>
            h(View, { key: r, style: { marginRight: 46 } },
              h(Text, { style: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Helvetica-Bold',
                                 lineHeight: 1.2 } }, n),
              h(Text, { style: { color: '#8B93A5', fontSize: 8, marginTop: 2 } }, r)))),
        h(View, { style: { height: 0.5, backgroundColor: '#3A445C', marginBottom: 12 } }),
        h(View, { style: { flexDirection: 'row', justifyContent: 'space-between' } },
          h(Text, { style: { color: '#8B93A5', fontSize: 8.5 } },
            M ? `Propuesta institucional · ${M.nombre} · ${MES_EMISION}`
              : `Documento institucional · ${MES_EMISION}`),
          h(Text, { style: { color: '#FFFFFF', fontSize: 8.5, fontFamily: 'Helvetica-Bold' } },
            'contratistadigital.com'))))),

  // ─── 2 · Diagnóstico ─────────────────────────────────────────────────────
  //
  // Abre el documento acusando, y cierra absolviendo. El orden importa: sin la
  // última línea, un secretario que se siente juzgado deja de leer.
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Diagnóstico',
      titulo: 'Seis señales',
      entrada: M
        ? `Si reconoce cualquiera de estas seis situaciones en ${M.nombre}, este documento le interesa.`
        : 'Si reconoce cualquiera de estas seis situaciones en su municipio, este documento le interesa.',
    }),

    h(View, { style: { marginTop: 2 } },
      ...DIAGNOSTICO.map((t, i) =>
        h(Senal, { key: t, n: i + 1, texto: t, ultima: i === DIAGNOSTICO.length - 1 }))),

    h(View, { style: { height: 22 } }),
    h(Caja, null,
      h(Text, { style: { fontSize: 10.5, lineHeight: 1.5, color: TINTA } },
        h(Text, { style: e.fuerte }, 'Ninguno de estos problemas es de las personas. '),
        'Todos son del método. Se resuelven cambiando cómo circula el papel, no exigiéndole más a quien ya está haciendo su trabajo.')),

    h(Pie)),

  // ─── 3 · El problema y el ciclo ──────────────────────────────────────────
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'El problema',
      titulo: 'Cada mes, el mismo trámite\nmultiplicado por cada contratista',
      entrada: 'Una alcaldía con cien contratistas de prestación de servicios repite cien veces el mismo ciclo documental al mes: informe de actividades, cuenta de cobro, planilla de seguridad social, evidencias, acta de supervisión, acta de pago.',
    }),

    h(Text, { style: e.parrafo },
      'El trabajo real no está en decidir, está en transcribir. Los documentos se arman sobre plantillas de Word que cada quien guarda por su lado, se numeran a mano y viajan por WhatsApp y correo hasta que alguien los imprime. Si hay un error de redacción o una cifra en letras que no coincide, el documento se devuelve y el ciclo empieza otra vez.'),
    h(Text, { style: e.parrafo },
      'El supervisor no tiene forma de saber, sin abrir carpeta por carpeta, quién ya envió y quién no. Y cuando llega una auditoría, reconstruir qué pasó con un contrato concreto significa buscar en el correo de varias personas.'),

    h(View, { style: { height: 26 } }),
    h(Text, { style: e.seccion }, 'La propuesta'),
    h(Text, { style: { ...e.titulo, fontSize: 15, marginBottom: 16 } }, 'El ciclo, en cuatro pasos'),

    h(Paso, { n: 1, t: 'El contratista registra y adjunta',
      d: 'Escribe sus actividades del mes y sube los soportes desde el celular, la tableta o el computador. Cada evidencia queda referenciada a la obligación que sustenta. Sin planilla de seguridad social o sin evidencia, el sistema no deja enviar.' }),
    h(Paso, { n: 2, t: 'El supervisor revisa con la evidencia al lado',
      d: 'Recibe la notificación al instante por correo y WhatsApp. Ve cada obligación contractual junto a su soporte y aprueba o devuelve con un comentario. No abre carpetas: abre un enlace.' }),
    h(Paso, { n: 3, t: 'El sistema genera los documentos',
      d: 'Informe de actividades, cuenta de cobro, acta de supervisión, acta de pago y certificación de retención en la fuente. Numerados, consecutivos, con los anexos incorporados y un QR de verificación.' }),
    h(Paso, { n: 4, t: 'Se descarga el paquete armado',
      d: 'Ordenado para cargar a SECOP II. Y todo lo que ocurrió queda en un historial con responsable y hora.' }),

    h(View, { style: { height: 8 } }),
    h(Caja, null,
      h(Text, { style: { fontSize: 9.2, lineHeight: 1.5 } },
        h(Text, { style: e.fuerte }, 'El documento deja de ser el trabajo. '),
        'Cuando el sistema lo genera, las devoluciones por documento mal elaborado —cifras en letras, numeración, formato— caen prácticamente al 100%. Lo que queda por revisar es el fondo: si la actividad se hizo y si la evidencia la sustenta.')),

    h(Pie)),

  // ─── 3 · Qué hace / alcance ──────────────────────────────────────────────
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Capacidades',
      titulo: 'Qué hace el sistema',
      entrada: 'Todo lo que aparece aquí está en producción y en uso hoy. Nada de esto es hoja de ruta.',
    }),

    h(View, { style: { ...e.fila, flexWrap: 'wrap' } },
      h(Capacidad, { t: 'Genera los documentos', d: 'Informe, cuenta de cobro, acta de supervisión, acta de pago, certificación de retención y acta de terminación. Numerados y consecutivos.' }),
      h(Capacidad, { t: 'Verificación por QR', d: 'Cada documento lleva un código único. Un tercero confirma su autenticidad en una página pública, sin cuenta.' }),
      h(Capacidad, { t: 'Evidencias y anexos', d: 'Fotos, planilla de seguridad social, facturas y cualquier PDF quedan numerados y referenciados desde la actividad que sustentan.' }),
      h(Capacidad, { t: 'Evidencias repetidas', d: 'El sistema detecta cuándo una imagen ya se presentó en un periodo anterior y lo advierte al supervisor.' }),
      h(Capacidad, { t: 'Notificaciones en tiempo real', d: 'Por correo electrónico y WhatsApp, en cada cambio de estado del periodo.' }),
      h(Capacidad, { t: 'Trazabilidad completa', d: 'Cada acción con su responsable y su hora, en un historial que no se altera.' }),
      h(Capacidad, { t: 'Expediente del contrato', d: 'Obligaciones específicas, periodos de pago, CDP, CRP, RUT y certificación bancaria en una sola ficha.' }),
      h(Capacidad, { t: 'Paquete para SECOP II', d: 'Se descarga armado y en orden, listo para cargar.' }),
      h(Capacidad, { t: 'Control de estados', d: 'Qué periodos están pendientes, cuáles esperan aprobación y cuáles ya se pagaron, de un vistazo.' }),
      h(Capacidad, { t: 'Bloqueo de envíos incompletos', d: 'Sin planilla o sin evidencia, el informe no sale. El error se detiene antes, no en la revisión.' }),
      h(Capacidad, { t: 'Facturación electrónica', d: 'Para contratistas obligados a facturar, la factura sustituye a la cuenta de cobro.' }),
      h(Capacidad, { t: 'Redacción asistida', d: 'Mejora la ortografía y la claridad de las actividades redactadas por el contratista.' }),
      h(Capacidad, { t: 'Cinco roles', d: 'Administrador, supervisor, contratista, asesor y contratación, cada uno con su vista y sus permisos.' }),
      h(Capacidad, { t: 'Web, sin instalar nada', d: 'Funciona desde celular, tableta o computador. No hay que instalar ni actualizar nada.' })),

    h(Pie)),

  // ─── Control y verificación ──────────────────────────────────────────────
  //
  // Estaban enterrados como dos líneas en la rejilla de capacidades. Son de lo
  // más difícil de replicar y lo que más tranquiliza a quien responde por el
  // dinero, así que se les da su página.
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Control',
      titulo: 'Lo que el sistema no deja pasar',
      entrada: 'Un archivo compartido guarda lo que le den. Esto revisa antes de aceptarlo.',
    }),

    h(Caja, { fondo: '#FFFFFF', style: { border: `0.5pt solid ${LINEA}`, marginBottom: 8 } },
      h(Text, { style: { ...e.fuerte, fontSize: 10 } }, 'Evidencias repetidas, no solo archivos repetidos'),
      h(Text, { style: { fontSize: 9, lineHeight: 1.45, marginTop: 4 } },
        'Detecta la misma imagen aunque la hayan recortado, comprimido o vuelto a fotografiar de la pantalla. Si una evidencia ya se usó en otro periodo del mismo contrato, el supervisor lo sabe antes de aprobar.')),

    h(Caja, { fondo: '#FFFFFF', style: { border: `0.5pt solid ${LINEA}`, marginBottom: 8 } },
      h(Text, { style: { ...e.fuerte, fontSize: 10 } }, 'La seguridad social es bloqueante'),
      h(Text, { style: { fontSize: 9, lineHeight: 1.45, marginTop: 4 } },
        'No deja enviar el informe sin planilla válida, y avisa si la misma planilla se está reutilizando en más periodos de los que cubre.')),

    h(Caja, { fondo: '#FFFFFF', style: { border: `0.5pt solid ${LINEA}` } },
      h(Text, { style: { ...e.fuerte, fontSize: 10 } }, 'El error se detiene antes de la revisión'),
      h(Text, { style: { fontSize: 9, lineHeight: 1.45, marginTop: 4 } },
        'Sin actividades, sin evidencia o sin planilla, el informe no sale. El supervisor recibe expedientes completos o no los recibe.')),

    h(View, { style: { height: 20 } }),
    h(Text, { style: e.seccion }, 'Seguimiento automático'),
    h(Text, { style: { ...e.parrafo, marginBottom: 10 } },
      'Nadie tiene que perseguir a nadie. El sistema avisa solo, en estas fechas:'),

    h(View, { style: { marginTop: 2, marginBottom: 20 } },
      ...RECORDATORIOS.map(([c, t], i) =>
        h(Renglon, { key: c, k: c, v: t, ultimo: i === RECORDATORIOS.length - 1 }))),

    h(Text, { style: e.seccion }, 'Lo que hace cumplir'),
    h(View, { style: { marginTop: 2 } },
      ...NORMAS.map(([n, q], i) =>
        h(Renglon, { key: n, k: n, v: q, ultimo: i === NORMAS.length - 1 }))),

    h(Pie)),

  // ─── Verificación, con un QR que de verdad se escanea ────────────────────
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Verificación',
      titulo: 'Cualquiera comprueba un documento.\nSin pedirle nada a la alcaldía',
      entrada: 'Cada documento emitido lleva un código único y una huella SHA-256. La página de verificación es pública: no hace falta cuenta ni solicitud.',
    }),

    h(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 6 } },
      h(View, { style: { width: 150, height: 150, backgroundColor: '#FFFFFF',
                         border: `0.5pt solid ${LINEA}`, borderRadius: 6, padding: 8 } },
        h(Image, { src: qr, style: { width: '100%', height: '100%' } })),
      h(View, { style: { flex: 1 } },
        h(Text, { style: { fontSize: 9.5, lineHeight: 1.5 } },
          'Escanee este código con la cámara de su teléfono. Es el verificador real, en producción: el mismo al que llega un auditor, un banco o un ente de control cuando quiere comprobar un documento que le presentaron.'),
        h(Text, { style: { fontSize: 8.5, color: SUAVE, lineHeight: 1.45, marginTop: 10 } },
          'Los 503 documentos ya emitidos son verificables por este medio, sin intervención de la alcaldía y sin que el sistema tenga que estar disponible para el trámite.'))),

    h(View, { style: { height: 22 } }),
    h(Text, { style: e.seccion }, 'Qué ve quien escanea'),
    h(Text, { style: { ...e.parrafo, marginBottom: 10 } },
      'La página no entrega el documento: entrega los datos con los que se emitió, para contrastarlos con el papel que se tiene delante.'),

    h(View, { style: { ...e.fila, flexWrap: 'wrap', marginBottom: 20 } },
      h(Item, { ancho: '50%' }, 'Tipo de documento y municipio emisor.'),
      h(Item, { ancho: '50%' }, 'Número de contrato, año y periodo.'),
      h(Item, { ancho: '50%' }, 'Contratista, con la cédula enmascarada — solo los últimos cuatro dígitos.'),
      h(Item, { ancho: '50%' }, 'Dependencia y supervisor responsable.'),
      h(Item, { ancho: '50%' }, 'Valor del periodo y estado actual del trámite.'),
      h(Item, { ancho: '50%' }, 'Fecha de emisión y huella SHA-256 del archivo.')),

    h(Caja, null,
      h(Text, { style: { fontSize: 9.2, lineHeight: 1.5 } },
        h(Text, { style: e.fuerte }, 'Por qué importa que sea público. '),
        'Un documento que solo la alcaldía puede validar obliga a confiar en la alcaldía. Uno que cualquiera puede validar no le pide confianza a nadie: se comprueba y ya. Esa diferencia es la que convierte un archivo en una prueba.')),

    h(View, { style: { height: 10 } }),
    h(Text, { style: { fontSize: 8, color: SUAVE, lineHeight: 1.45 } },
      'La cédula se muestra enmascarada a propósito: la página es pública y los datos son de personas reales. Se enseña lo justo para reconocer el documento, no para exponer a quien lo firmó.'),

    h(Pie)),

  // ─── La operación ────────────────────────────────────────────────────────
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Operación real',
      titulo: 'No es un piloto.\nEs un sistema en producción',
      entrada: `Contratista Digital opera hoy en una alcaldía de Antioquia. Las cifras siguientes se consultaron directamente a la base de datos de producción el ${VERIFICADO}.`,
    }),

    h(View, { style: { ...e.fila, flexWrap: 'wrap', marginTop: 4 } },
      h(Cifra, { n: '126', rotulo: 'contratos administrados' }),
      h(Cifra, { n: '124', rotulo: 'usuarios activos' }),
      h(Cifra, { n: '5',   rotulo: 'secretarías' }),
      h(Cifra, { n: '629', rotulo: 'periodos gestionados' }),
      h(Cifra, { n: '206', rotulo: 'envíos a revisión procesados' }),
      h(Cifra, { n: '503', rotulo: 'documentos verificables emitidos' }),
      h(Cifra, { n: '4.081', rotulo: 'evidencias archivadas' }),
      h(Cifra, { n: '2.976', rotulo: 'actividades registradas' }),
      h(Cifra, { n: '1.449', rotulo: 'movimientos trazados' })),

    h(View, { style: { height: 4 } }),
    h(Caja, null,
      h(View, { style: { flexDirection: 'row' } },
        h(View, { style: { width: '50%', paddingRight: 14 } },
          h(Text, { style: { ...e.fuerte, fontSize: 9.5, marginBottom: 4 } }, 'Cinco meses de operación continua'),
          h(Text, { style: { fontSize: 8.8, lineHeight: 1.45 } },
            'Actividad ininterrumpida desde abril de 2026. Se concentra entre los días 21 y 27 de cada mes, que es cuando cierra el ciclo de pago.')),
        h(View, { style: { width: '50%' } },
          h(Text, { style: { ...e.fuerte, fontSize: 9.5, marginBottom: 4 } }, 'El histórico no se queda afuera'),
          h(Text, { style: { fontSize: 8.8, lineHeight: 1.45 } },
            'Los contratos en curso y sus periodos anteriores se migran durante la implementación. El municipio no empieza con la base en blanco.')))),

    h(View, { style: { height: 22 } }),
    h(Text, { style: e.seccion }, 'Volumen gestionado'),
    h(View, { style: { marginTop: 2 } },
      h(Renglon, { k: 'Archivos almacenados', v: '5.054 objetos · 877 MB de evidencias, anexos y documentos emitidos' }),
      h(Renglon, { k: 'Obligaciones', v: '848 obligaciones contractuales específicas bajo seguimiento' }),
      h(Renglon, { k: 'Notificaciones', v: '1.579 avisos enviados por correo y WhatsApp' }),
      h(Renglon, { k: 'Revisión', v: '170 aprobaciones, 182 radicaciones y 8 actas de terminación', ultimo: true })),

    h(View, { style: { height: 20 } }),
    h(Text, { style: { fontSize: 8, color: SUAVE, lineHeight: 1.45, fontStyle: 'italic' } },
      'Las cifras de esta página corresponden a una sola entidad y se actualizan en cada emisión del documento. Última verificación contra producción: ' + VERIFICADO + '.'),

    h(Pie)),

  // ─── 5 · Infraestructura ─────────────────────────────────────────────────
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Infraestructura',
      titulo: 'Dónde viven los datos\ny quién responde por ellos',
      entrada: 'La información contractual de un municipio es información pública sujeta a control. Estas son las condiciones técnicas concretas bajo las que se guarda.',
    }),

    h(Text, { style: e.seccion }, 'Arquitectura'),
    h(View, { style: { marginTop: 2, marginBottom: 15 } },
      h(Renglon, { k: 'Aplicación', v: 'Next.js 16 sobre React 19. Ejecución sin servidor, con escalado automático.' }),
      h(Renglon, { k: 'Base de datos', v: 'PostgreSQL 17.6 gestionado, canal de versiones estable (GA).' }),
      h(Renglon, { k: 'Almacenamiento', v: 'Almacenamiento de objetos compatible con S3, separado de la base.' }),
      h(Renglon, { k: 'Alojamiento', v: 'Vercel, plan Pro. Red de distribución global con TLS.' }),
      h(Renglon, { k: 'Datos', v: 'Supabase, plan Pro. Infraestructura AWS, región us-west-2 (Oregón).' }),
      h(Renglon, { k: 'Correo', v: 'Resend, con SPF y DKIM configurados sobre el dominio propio.' }),
      h(Renglon, { k: 'Acceso', v: 'Navegador web. Sin instalación ni mantenimiento en los equipos.', ultimo: true })),

    h(Text, { style: e.seccion }, 'Seguridad'),
    h(View, { style: { ...e.fila, flexWrap: 'wrap', marginTop: 2, marginBottom: 9 } },
      h(Item, { ancho: '50%' }, 'Cifrado en tránsito (TLS) y en reposo.'),
      h(Item, { ancho: '50%' }, 'Aislamiento a nivel de fila activo en las 23 tablas, con 78 políticas de acceso.'),
      h(Item, { ancho: '50%' }, 'Cada usuario ve únicamente lo que su rol y su contrato le permiten. La restricción vive en la base, no en la pantalla.'),
      h(Item, { ancho: '50%' }, 'Evidencias, documentos, anexos y certificaciones en depósitos privados; se entregan mediante enlaces firmados de vigencia limitada.'),
      h(Item, { ancho: '50%' }, 'Contraseñas cifradas; sesión con renovación y cierre automático.'),
      h(Item, { ancho: '50%' }, 'Cada documento emitido lleva huella SHA-256 y código de verificación pública.')),

    h(Text, { style: e.seccion }, 'Cumplimiento'),
    h(View, { style: { marginTop: 2, marginBottom: 9 } },
      h(Item, null, 'Opera sobre infraestructura certificada bajo ISO/IEC 27001, 27017, 27018 y SOC 2 Tipo II. La certificación corresponde a los proveedores de infraestructura.'),
      h(Item, null, 'Tratamiento de datos personales conforme a la Ley 1581 de 2012.'),
      h(Item, null, 'Documentos verificables por terceros —entes de control incluidos— sin necesidad de cuenta ni de solicitar acceso.')),

    h(Text, { style: e.seccion }, 'Continuidad'),
    h(View, { style: { marginTop: 2 } },
      h(Renglon, { k: 'Respaldos', v: 'Diarios y automáticos, con retención de siete días.' }),
      h(Renglon, { k: 'Cambios de esquema', v: '59 migraciones versionadas y aplicadas de forma controlada.' }),
      h(Renglon, { k: 'Disponibilidad', v: 'Cinco meses de operación continua, sin pérdida de información ni reversiones de datos.' }),
      h(Renglon, { k: 'Portabilidad', v: 'La información es exportable. Los documentos emitidos son PDF estándar y no dependen del sistema para leerse.', ultimo: true })),

    h(Pie)),

  // ─── Al terminar el contrato ─────────────────────────────────────────────
  //
  // Solo en los ejemplares dirigidos: el genérico no tiene un contrato del cual
  // hablar. Va antes de la implementación porque quien firma quiere saber cómo
  // se sale antes de que le cuenten cómo se entra.
  ...(M ? [h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Al terminar el contrato',
      titulo: 'La información es del municipio',
      entrada: `Lo que pasa cuando el contrato termina queda escrito desde ahora. ${M.nombre} no queda atado a la plataforma para conservar lo que ya produjo.`,
    }),

    h(View, { style: { marginTop: 2, marginBottom: 20 } },
      ...TERMINACION.map(([t, d], i) =>
        h(Renglon, { key: t, k: t, v: d, ultimo: i === TERMINACION.length - 1 }))),

    h(Caja, null,
      h(Text, { style: { fontSize: 9.2, lineHeight: 1.5 } },
        h(Text, { style: e.fuerte }, 'Sobre la verificación, una precisión técnica. '),
        'El código QR va impreso dentro de cada PDF: la dirección queda grabada en la imagen y no se puede reescribir después. Por eso el compromiso de mantenerla activa es indefinido y no depende de que el contrato siga vigente — de lo contrario, el día que un ente de control escanee un documento de 2026 no cargaría nada.')),

    h(Pie))] : []),

  // ─── 6 · Implementación y contacto ───────────────────────────────────────
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: 'Implementación',
      titulo: 'Cuatro semanas,\nsin detener la operación',
      entrada: M
        ? `${M.nombre} no deja de pagar contratistas mientras se implementa. El ciclo en curso se termina como se venía haciendo y el siguiente ya entra al sistema.`
        : 'El municipio no deja de pagar contratistas mientras se implementa. El ciclo en curso se termina como se venía haciendo y el siguiente ya entra al sistema.',
    }),

    h(Paso, { n: 1, t: 'Semana 1 · Configuración',
      d: 'Se cargan las secretarías, los supervisores y la estructura de contratos del municipio.' }),
    h(Paso, { n: 2, t: 'Semana 2 · Migración',
      d: 'Entran los contratos en curso con sus obligaciones, sus periodos anteriores y sus documentos.' }),
    h(Paso, { n: 3, t: 'Semana 3 · Capacitación',
      d: 'Sesiones por rol. El contratista necesita una: la herramienta se aprende usándola.' }),
    h(Paso, { n: 4, t: 'Semana 4 · Primer ciclo acompañado',
      d: 'El primer cierre de mes se hace con acompañamiento directo, de principio a fin.' }),

    h(View, { style: { height: 2 } }),
    h(Caja, null,
      h(Text, { style: { fontSize: 9.2, lineHeight: 1.5 } },
        h(Text, { style: e.fuerte }, 'Se puede empezar con una sola secretaría. '),
        'Sin comprometer todo el municipio desde el primer día. Cuando el primer ciclo cierre bien, se extiende al resto.')),

    h(Pie)),

  // ─── La inversión y el cierre ────────────────────────────────────────────
  //
  // Página propia. Iban al pie del cronograma, pero al separar la
  // implementación de la mensualidad la tabla pasó de tres filas a cuatro y
  // empujó el bloque de contacto a una hoja con el 24 % ocupado.
  h(Page, { size: 'A4', style: e.pagina },
    h(Encabezado, {
      etiqueta: M ? 'La inversión' : 'La licencia',
      titulo: M?.implementaciones
        ? 'Elija cómo se monta.\nLa operación es la misma'
        : M ? 'Dos pagos, cada uno\ncon su alcance' : 'Qué cuesta y qué incluye',
      entrada: M?.implementaciones
        ? `El municipio elige quién realiza el cargue inicial. La mensualidad y todo lo que incluye son idénticos en ambas opciones.`
        : M
          ? `Un pago único por dejar la plataforma montada con los datos de ${M.nombre}, y una mensualidad por mantenerla operando.`
          : 'Sin costo por usuario, por documento ni por almacenamiento.',
    }),

    // La tabla anterior se contradecía dentro de sí misma: la fila «Incluye»
    // ponía la implementación dentro de la licencia y la fila «Valor» decía que
    // se convenía aparte. Ahora son dos pagos con alcances distintos y cada uno
    // dice qué cubre.
    h(View, { style: { marginTop: 2, marginBottom: 16 } },
      ...(M?.implementaciones
        ? [
            // Municipios con dos caminos de implementación (ver MUNICIPIOS).
            ...M.implementaciones.map(i => h(Renglon, { k: i.etiqueta, v: i.texto })),
            // La etiqueta se queda corta a propósito: la columna izquierda es
            // estrecha y «· en ambas opciones» la partía en dos líneas hasta
            // chocar con la descripción. Va dentro del texto, que respira.
            h(Renglon, { k: `Mensualidad · ${M.precio}`,
              v: 'Igual en ambas opciones. Capacitaciones periódicas, base de datos, alojamiento, copias de seguridad diarias, soporte técnico y los demás servicios asociados a la operación de la plataforma.' }),
            h(Renglon, { k: 'No se cobra por',
              v: 'Usuario, documento ni almacenamiento. El municipio no paga más por crecer.' }),
            h(Renglon, { k: 'Vigencia', v: M.vigencia, ultimo: true }),
          ]
        : M
        ? [
            // El texto por defecto es el que ya recibieron Dabeiba y El Bagre;
            // no se toca para no desalinear una propuesta ya enviada. Un
            // municipio puede traer el suyo con `implementacionTexto`.
            h(Renglon, { k: `Implementación · ${M.implementacion}`,
              v: M.implementacionTexto
                 ?? 'Pago único. Creación de los usuarios de todas las secretarías, cargue inicial de los contratos vigentes con su historial, y los desarrollos a la medida del entorno del municipio.' }),
            h(Renglon, { k: `Mensualidad · ${M.precio}`,
              v: 'Capacitaciones periódicas, base de datos, alojamiento, copias de seguridad diarias, soporte técnico y los demás servicios asociados a la operación de la plataforma.' }),
            h(Renglon, { k: 'No se cobra por',
              v: 'Usuario, documento ni almacenamiento. El municipio no paga más por crecer.' }),
            h(Renglon, { k: 'Vigencia', v: M.vigencia, ultimo: true }),
          ]
        : [
            h(Renglon, { k: 'Incluye', v: 'Capacitación, soporte, actualizaciones, alojamiento y respaldos diarios.' }),
            h(Renglon, { k: 'No se cobra por', v: 'Usuario, documento ni almacenamiento. El municipio no paga más por crecer.' }),
            h(Renglon, { k: 'Valor', v: 'Implementación y mensualidad se cotizan según el tamaño del municipio.', ultimo: true }),
          ])),

    // Cierre en bloque oscuro
    h(View, { wrap: false, style: { backgroundColor: TINTA, borderRadius: 4, padding: 19, marginTop: 2 } },
      h(Logo, { tam: 26, color: '#FFFFFF' }),
      h(Text, { style: { color: '#FFFFFF', fontSize: 14.5, fontFamily: 'Helvetica-Bold',
                         marginTop: 11, lineHeight: 1.3 } },
        M ? `Hablemos del primer ciclo en ${M.nombre}` : 'Conversemos sobre su municipio'),
      h(Text, { style: { color: '#C6CBD6', fontSize: 9.2, lineHeight: 1.5, marginTop: 6, maxWidth: 330 } },
        M
          ? `Podemos mostrarle el sistema operando con datos reales y estimar cómo se vería el primer cierre de mes en ${M.nombre}, en una sola reunión.`
          : 'Podemos mostrarle el sistema operando con datos reales y estimar el alcance para su alcaldía en una sola reunión.'),
      h(View, { style: { height: 0.5, backgroundColor: '#3A445C', marginTop: 12, marginBottom: 10 } }),
      h(View, { style: { flexDirection: 'row' } },
        h(View, { style: { width: '50%' } },
          h(Text, { style: { color: '#8B93A5', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 1.2 } }, 'WhatsApp'),
          h(Text, { style: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 3 } }, '+57 319 242 0334')),
        h(View, { style: { width: '50%' } },
          h(Text, { style: { color: '#8B93A5', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 1.2 } }, 'Sitio'),
          h(Text, { style: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 3 } }, 'contratistadigital.com')))),

    h(Pie)))

/**
 * Guarda contra glifos que Helvetica no tiene.
 *
 * Las fuentes base de PDF cubren WinAnsi. Cuando un texto trae algo fuera de
 * ese juego —una flecha, una viñeta tipográfica, un guion largo raro—
 * @react-pdf no falla: sustituye por otro carácter y sigue. El error solo
 * aparece al mirar el documento impreso, y ahí se lee como una errata.
 *
 * Ya pasó una vez con «→». Esto lo convierte en un fallo ruidoso al generar,
 * que es cuando se puede arreglar.
 */
function comprobarGlifos(textos) {
  const problemas = []
  for (const t of textos) {
    for (const ch of t) {
      if (ch.codePointAt(0) < 128) continue
      try {
        new TextEncoder('windows-1252')
        // Node no expone cp1252; se comprueba contra el rango cubierto.
        if (!/[\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/.test(ch)) {
          problemas.push(`U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} (${ch}) en: ${t.slice(0, 50)}`)
        }
      } catch { /* ignorar */ }
    }
  }
  return [...new Set(problemas)]
}

const textosDelDocumento = [
  ...DIAGNOSTICO,
  ...RECORDATORIOS.flat(),
  ...NORMAS.flat(),
]
const glifosMalos = comprobarGlifos(textosDelDocumento)
if (glifosMalos.length) {
  console.error('Glifos que Helvetica no puede dibujar:')
  glifosMalos.forEach(p => console.error('  ' + p))
  process.exit(1)
}

const salida = process.argv[2] || 'Brochure-ContratistaDigital.pdf'

// QR real contra el verificador de producción. Se genera aquí y no se dibuja a
// mano: en la reunión alguien lo va a escanear, y un código de adorno que no
// resuelve destruiría justo lo que la página afirma.
const qr = await QRCode.toDataURL('https://app.contratistadigital.com/verificar', {
  margin: 0,
  width: 600,
  color: { dark: TINTA, light: '#FFFFFF' },
})

await renderToFile(h(Brochure, { qr }), salida)
console.log(`Brochure generado: ${salida}`)
