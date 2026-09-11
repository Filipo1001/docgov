import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { GOMEZ_PLATA, pesos } from './datos'

/**
 * La propuesta en PDF. NO es la página web impresa.
 *
 * La web vive de sus animaciones, y una animación no se imprime: copiarla
 * habría dado un documento con siete recuadros quietos que no explican nada.
 * Así que esto es otra cosa con el mismo contenido — un documento dirigido,
 * con su encabezado, sus secciones y su cierre, que se lleva a un comité, se
 * imprime y se archiva.
 *
 * Helvetica y nada más: es una de las catorce tipografías que todo lector de
 * PDF trae incorporadas, así que el documento se ve igual en el computador de
 * la alcaldía, en el del contratista y en el de quien lo reciba después. Es el
 * mismo criterio que ya gobierna lib/pdf/styles.ts.
 *
 * SIN VIGENCIA, por decisión: el plazo se acuerda hablando, y escribirlo aquí
 * sería comprometer algo que todavía no está hablado.
 */

const TINTA = '#192031'
const VERDE = '#0B7A5C'
const GRIS = '#5B6672'
const LINEA = '#D9DEE4'
const ARENA = '#F7F4EE'

const e = StyleSheet.create({
  pagina: {
    paddingTop: 46, paddingBottom: 58, paddingHorizontal: 52,
    fontFamily: 'Helvetica', fontSize: 10, color: TINTA, lineHeight: 1.55,
  },

  // ── Encabezado ──────────────────────────────────────────────────────────
  cabecera: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: LINEA, marginBottom: 26,
  },
  escudo: { width: 108, height: 36, objectFit: 'contain' },
  marca: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: TINTA },
  marcaPie: { fontSize: 8, color: GRIS, marginTop: 1 },

  // ── Destinatario ────────────────────────────────────────────────────────
  dirigida: { fontSize: 9, color: GRIS, marginBottom: 2 },
  entidad: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: TINTA },
  alcalde: { fontSize: 10, color: GRIS, marginTop: 2, marginBottom: 26 },

  titular: { fontFamily: 'Helvetica-Bold', fontSize: 21, lineHeight: 1.25, marginBottom: 12 },
  bajada: { fontSize: 11, color: GRIS, lineHeight: 1.6, marginBottom: 26 },

  // ── Secciones ───────────────────────────────────────────────────────────
  etiqueta: {
    fontFamily: 'Helvetica-Bold', fontSize: 8, color: VERDE,
    letterSpacing: 1.1, marginBottom: 5, textTransform: 'uppercase',
  },
  titulo: { fontFamily: 'Helvetica-Bold', fontSize: 14, marginBottom: 9 },
  parrafo: { marginBottom: 9, color: GRIS },
  seccion: { marginBottom: 24 },

  fila: { flexDirection: 'row', marginBottom: 7 },
  vineta: { width: 12, color: VERDE, fontFamily: 'Helvetica-Bold' },
  filaTexto: { flex: 1, color: GRIS },
  destacado: { fontFamily: 'Helvetica-Bold', color: TINTA },

  // ── Actores ─────────────────────────────────────────────────────────────
  actor: {
    borderLeftWidth: 2, borderLeftColor: VERDE, paddingLeft: 11, marginBottom: 14,
  },
  actorQuien: {
    fontFamily: 'Helvetica-Bold', fontSize: 8, color: GRIS,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2,
  },
  actorTitular: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 3 },

  // ── Precio ──────────────────────────────────────────────────────────────
  precios: { flexDirection: 'row', gap: 12, marginTop: 6, marginBottom: 12 },
  precioCaja: {
    flex: 1, borderWidth: 1, borderColor: LINEA, borderRadius: 6,
    padding: 14, backgroundColor: ARENA,
  },
  precioCajaOscura: {
    flex: 1, borderRadius: 6, padding: 14, backgroundColor: TINTA,
  },
  precioRotulo: {
    fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: GRIS,
    letterSpacing: 0.9, textTransform: 'uppercase',
  },
  precioRotuloClaro: {
    fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#9AA6B2',
    letterSpacing: 0.9, textTransform: 'uppercase',
  },
  precioCifra: { fontFamily: 'Helvetica-Bold', fontSize: 19, marginTop: 7, color: TINTA },
  precioCifraClara: { fontFamily: 'Helvetica-Bold', fontSize: 19, marginTop: 7, color: '#FFFFFF' },
  precioQue: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 3, color: TINTA },
  precioQueClaro: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 3, color: '#FFFFFF' },
  precioDetalle: { fontSize: 8.5, color: GRIS, marginTop: 5, lineHeight: 1.5 },
  precioDetalleClaro: { fontSize: 8.5, color: '#9AA6B2', marginTop: 5, lineHeight: 1.5 },

  nota: { fontSize: 8.5, color: GRIS, lineHeight: 1.5 },

  // ── Pie ─────────────────────────────────────────────────────────────────
  pie: {
    position: 'absolute', bottom: 30, left: 52, right: 52,
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: LINEA, paddingTop: 8,
  },
  pieTexto: { fontSize: 7.5, color: GRIS },
})

/**
 * `junta` marca lo que NO puede partirse entre páginas.
 *
 * Por defecto una sección sí se parte, y tiene que ser así: cuando todas eran
 * indivisibles, cualquiera que no cupiera en lo que quedaba de hoja saltaba
 * entera a la siguiente y dejaba media página en blanco detrás. Solo se junta
 * lo que pierde sentido partido — las dos cajas del precio, que se leen
 * comparándolas.
 */
function Seccion({ etiqueta, titulo, junta = false, children }: {
  etiqueta: string; titulo: string; junta?: boolean; children: React.ReactNode
}) {
  return (
    <View style={e.seccion} {...(junta ? { wrap: false } : {})}>
      <Text style={e.etiqueta}>{etiqueta}</Text>
      <Text style={e.titulo}>{titulo}</Text>
      {children}
    </View>
  )
}

function Punto({ children }: { children: React.ReactNode }) {
  return (
    <View style={e.fila}>
      <Text style={e.vineta}>·</Text>
      <Text style={e.filaTexto}>{children}</Text>
    </View>
  )
}

/**
 * Pie de página, repetido en todas las hojas.
 *
 * SIN NÚMERO DE PÁGINA, y no por olvido. La forma de numerar en este
 * renderizador es la propiedad `render` de un <Text>, y en la versión que usa
 * el proyecto esa propiedad hace desaparecer en silencio —sin error— todo el
 * bloque que la contiene. Se probó anidada y suelta, con y sin `fixed`: el
 * mismo resultado. Un pie que identifica el documento en cada hoja hace el
 * trabajo importante; la numeración era un adorno, y no vale la pena cambiar
 * de renderizador por ella.
 */
function Pie() {
  return (
    <View style={e.pie} fixed>
      <Text style={e.pieTexto}>
        Contratista Digital · Propuesta para la Alcaldía Municipal de {GOMEZ_PLATA.municipio}
      </Text>
    </View>
  )
}

export function PropuestaGomezPlataPDF({ escudo }: { escudo: string }) {
  return (
    <Document
      title={`Propuesta · Alcaldía Municipal de ${GOMEZ_PLATA.municipio}`}
      author="Contratista Digital"
      subject="Gestión documental contractual para alcaldías"
    >
      {/* ── Página 1 · Quién y qué ─────────────────────────────────────── */}
      <Page size="A4" style={e.pagina}>
        <Pie />
        <View style={e.cabecera}>
          <View>
            <Text style={e.marca}>Contratista Digital</Text>
            <Text style={e.marcaPie}>Gestión documental contractual para alcaldías</Text>
          </View>
          <Image src={escudo} style={e.escudo} />
        </View>

        <Text style={e.dirigida}>Propuesta preparada para la</Text>
        <Text style={e.entidad}>Alcaldía Municipal de {GOMEZ_PLATA.municipio}</Text>
        <Text style={e.alcalde}>
          En cabeza del señor Alcalde {GOMEZ_PLATA.alcalde}
        </Text>

        <Text style={e.titular}>El cierre del mes deja de ser un problema.</Text>
        <Text style={e.bajada}>
          Ni plantillas de Word, ni consecutivos a mano, ni perseguir soportes uno por
          uno. El contratista reporta desde su celular y el sistema arma el expediente
          completo de cada contrato, listo para cargar a SECOP II.
        </Text>

        <Seccion etiqueta="El momento" titulo="Se envía una vez. El resto lo escribe el sistema.">
          <Text style={e.parrafo}>
            El contratista registra sus actividades y adjunta sus soportes. El supervisor
            revisa cada obligación con la evidencia al lado, y aprueba o devuelve. A
            partir de ahí no interviene nadie más: el sistema escribe el informe de
            actividades, la cuenta de cobro, el acta de supervisión, el acta de pago y el
            acta de terminación — numerados, con sus anexos y verificables.
          </Text>
          <Text style={e.parrafo}>
            Los nombres, las fechas, los consecutivos y el valor en letras no vuelven a
            ser motivo de devolución.
          </Text>
        </Seccion>

        <Seccion etiqueta="Por dentro" titulo="La mejor tecnología del mundo al servicio de su alcaldía.">
          <Punto>
            <Text style={e.destacado}>Reconoce una evidencia repetida. </Text>
            No hace falta que sea el mismo archivo: reconoce la misma foto aunque la
            hayan recortado, achicado o vuelto a fotografiar de la pantalla, y se lo
            advierte al supervisor antes de que apruebe.
          </Punto>
          <Punto>
            <Text style={e.destacado}>Sella cada documento con su huella. </Text>
            Si alguien le cambia un dato —un valor, una fecha, un nombre— la huella deja
            de coincidir y el cambio queda a la vista. Es el estándar SHA-256, el mismo
            que usa la banca.
          </Punto>
          <Punto>
            <Text style={e.destacado}>Trabaja sobre infraestructura certificada. </Text>
            Certificada bajo ISO/IEC 27001, 27017, 27018 y SOC 2 Tipo II. La información
            viaja cifrada, se guarda cifrada y se respalda sola.
          </Punto>
          <Punto>
            <Text style={e.destacado}>Avisa solo, en el momento. </Text>
            Cada vez que algo cambia sale un correo: enviado, aprobado, devuelto. Y todo
            queda anotado con su responsable y su hora, en un historial que nadie puede
            retocar.
          </Punto>
          <Punto>
            <Text style={e.destacado}>No deja enviar lo incompleto. </Text>
            Sin actividades, sin evidencias o sin planilla de seguridad social vigente,
            el informe no sale.
          </Punto>
          <Punto>
            <Text style={e.destacado}>Funciona en lo que ya tienen. </Text>
            Por internet, sin instalar nada, desde el celular, la tableta o el computador
            de la secretaría.
          </Punto>
          <Punto>
            <Text style={e.destacado}>Arma el paquete del mes. </Text>
            Los documentos del periodo se descargan ordenados y con sus anexos numerados,
            listos para cargar a SECOP II. La carga a la plataforma la sigue haciendo una
            persona: el sistema prepara el paquete, no se conecta con SECOP II.
          </Punto>
        </Seccion>

      </Page>

      {/* ── Página 2 · El respaldo, quién hace qué y el precio ─────────── */}
      <Page size="A4" style={e.pagina}>
        <Pie />
        <Seccion etiqueta="Cadena de custodia" titulo="Trazabilidad del 100%.">
          <Text style={e.parrafo}>
            Cada documento deja constancia de quién lo hizo, quién lo aprobó y a qué
            hora. Cuando sale, va sellado con su huella digital y su código QR impreso
            dentro del PDF.
          </Text>
          <Text style={e.parrafo}>
            El día que deje el cargo —o el día que decidan no seguir con nosotros— cada
            documento que usted firmó se sigue pudiendo comprobar. No se vence, no se
            apaga y no depende de que sigamos trabajando juntos.
          </Text>
          <Text style={e.parrafo}>
            Porque la pregunta nunca llega el mes que uno la espera: llega años después,
            cuando ya nadie recuerda quién archivó qué. Y entonces lo que lo respalda no
            es haber hecho bien el trabajo, sino poder demostrarlo — sin tres días de
            angustia revolviendo carpetas para encontrar un acta de supervisión.
          </Text>
        </Seccion>

        <Seccion etiqueta="Quién hace qué" titulo="Cada quien vuelve a su oficio.">
          <Text style={e.parrafo}>
            No se trata de hacer el mismo papeleo más rápido. Se trata de que ya nadie en
            la alcaldía tenga que hacerlo.
          </Text>

          <View style={e.actor}>
            <Text style={e.actorQuien}>El contratista</Text>
            <Text style={e.actorTitular}>Ahora solo se ocupa de evidenciar su trabajo.</Text>
            <Text style={e.filaTexto}>
              Sube actividades y soportes desde el celular, donde esté. No redacta
              informes, no arma cuentas de cobro, no cuadra consecutivos ni escribe
              valores en letras.
            </Text>
          </View>

          <View style={e.actor}>
            <Text style={e.actorQuien}>El supervisor</Text>
            <Text style={e.actorTitular}>Ahora solo se dedica a supervisar lo trabajado.</Text>
            <Text style={e.filaTexto}>
              Revisa cada obligación con su evidencia al lado, y aprueba o devuelve. No
              comprueba fechas, ni si es la cuenta 6 o la 7, ni redacta actas: las escribe
              el sistema. Y al revisar la seguridad social tiene delante la base de
              cotización que le corresponde al contrato y el mes realmente cotizado.
            </Text>
          </View>

          <View style={e.actor}>
            <Text style={e.actorQuien}>Contratación</Text>
            <Text style={e.actorTitular}>Monta el municipio una vez y deja de perseguir papeles.</Text>
            <Text style={e.filaTexto}>
              Crea las secretarías, los usuarios y los contratos con sus obligaciones, sus
              periodos y sus soportes —CDP, CRP, RUT y certificación bancaria— en una sola
              ficha.
            </Text>
          </View>

          <View style={e.actor}>
            <Text style={e.actorQuien}>El alcalde</Text>
            <Text style={e.actorTitular}>Toda la alcaldía en la palma de la mano.</Text>
            <Text style={e.filaTexto}>
              Una tarjeta por secretaría con su secretario, sus contratistas y su
              ejecución. La ejecución mensual del año, el presupuesto por secretaría y el
              calendario de vencimientos. Ve los totales, no los datos de las personas.
            </Text>
          </View>
        </Seccion>

        {/* El precio cierra el documento, igual que cierra la página web: leído
            antes de haber visto qué se compra, no tiene con qué compararse. */}
        <Seccion junta etiqueta="La inversión" titulo={`Lo que cuesta, para ${GOMEZ_PLATA.municipio}.`}>
          <View style={e.precios}>
            <View style={e.precioCaja}>
              <Text style={e.precioRotulo}>Primer mes · una sola vez</Text>
              <Text style={e.precioCifra}>{pesos(GOMEZ_PLATA.implementacion)}</Text>
              <Text style={e.precioQue}>Implementación</Text>
              <Text style={e.precioDetalle}>
                Configuración del municipio y sus secretarías, creación de los usuarios,
                cargue de los contratos vigentes, adaptación de los documentos al formato
                de {GOMEZ_PLATA.municipio} y capacitación por rol. No se repite.
              </Text>
            </View>

            <View style={e.precioCajaOscura}>
              <Text style={e.precioRotuloClaro}>Cada mes</Text>
              <Text style={e.precioCifraClara}>{pesos(GOMEZ_PLATA.mensualidad)}</Text>
              <Text style={e.precioQueClaro}>Operación de la plataforma</Text>
              <Text style={e.precioDetalleClaro}>
                Uso ilimitado para todas las secretarías, soporte, actualizaciones,
                alojamiento y respaldos. No se cobra aparte por usuario, por documento ni
                por almacenamiento.
              </Text>
            </View>
          </View>

          <Text style={e.nota}>
            El primer mes suma los dos conceptos; a partir del segundo, solo la
            mensualidad. El acompañamiento del primer ciclo mensual completo va incluido
            en la implementación.
          </Text>
        </Seccion>

        <Seccion etiqueta="Puesta en marcha" titulo="Podemos empezar por una secretaría.">
          <Text style={e.parrafo}>
            Sin comprometer a todo el municipio desde el primer día. Cuando el primer
            ciclo mensual cierre bien, se extiende al resto.
          </Text>
        </Seccion>

      </Page>
    </Document>
  )
}
