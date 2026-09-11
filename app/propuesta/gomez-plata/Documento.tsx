import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { GOMEZ_PLATA, pesos } from './datos'
import { Ico, TRAZOS } from './iconos-pdf'

/**
 * La propuesta en PDF. NO es la página web impresa.
 *
 * La web vive de sus animaciones, y una animación no se imprime: copiarla
 * daría un documento con recuadros quietos que no explican nada. Esto es otra
 * cosa con el mismo contenido — un documento dirigido que se lleva a un
 * comité, se imprime y se archiva.
 *
 * ── LO QUE SE CORRIGIÓ DE LA PRIMERA VERSIÓN ─────────────────────────────
 *
 * EL ESCUDO ESTABA, PERO NO SE VEÍA: 108 puntos de ancho en una esquina, y
 * como la imagen oficial trae el blasón pequeño dentro de un lienzo blanco,
 * acababa en una marca de treinta puntos que se pasaba por alto. Ahora abre el
 * documento en grande, sobre su propia tarjeta, y se repite en el pie de cada
 * hoja — que es donde se mira cuando el papel lleva rato circulando.
 *
 * Y ERA TEXTO PLANO. Ahora lleva iconografía vectorial —los mismos trazos de
 * la aplicación—, tarjetas, franjas de color y una portada de verdad. En una
 * propuesta comercial, el aspecto no es adorno: es la primera prueba de que
 * quien la manda cuida los detalles.
 *
 * EL PRECIO YA NO VA EN NEGRO. Un bloque oscuro sobre una cifra se lee como
 * una factura; el verde es el color con el que este producto dice
 * «confirmado», y el mismo número dentro de él se lee como una decisión.
 *
 * Helvetica y nada más: es de las catorce que todo lector de PDF trae
 * incorporadas, así que se ve igual en cualquier computador. Mismo criterio
 * que lib/pdf/styles.ts.
 */

const TINTA = '#192031'
const VERDE = '#0B7A5C'
const VERDE_VIVO = '#10b981'
const VERDE_TENUE = '#E9F5F0'
const ARENA = '#F7F4EE'
const LINEA = '#E2E6EA'
const GRIS = '#5B6672'
const GRIS_CLARO = '#8A939D'

const e = StyleSheet.create({
  pagina: {
    paddingTop: 0, paddingBottom: 78, paddingHorizontal: 0,
    fontFamily: 'Helvetica', fontSize: 9.5, color: TINTA, lineHeight: 1.55,
  },
  cuerpo: { paddingHorizontal: 46 },

  // ── Franja superior: da presencia a la primera hoja ─────────────────────
  franja: { height: 5, backgroundColor: VERDE_VIVO },

  // ── Portada ─────────────────────────────────────────────────────────────
  portada: { backgroundColor: ARENA, paddingHorizontal: 46, paddingTop: 30, paddingBottom: 28 },
  filaMarca: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  marca: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: TINTA },
  marcaPie: { fontSize: 8, color: GRIS, marginTop: 2 },
  tarjetaEscudo: {
    backgroundColor: '#FFFFFF', borderRadius: 5, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: LINEA,
  },
  escudoGrande: { width: 150, height: 50, objectFit: 'contain' },

  dirigida: {
    fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: VERDE,
    letterSpacing: 1.2, marginTop: 26, marginBottom: 5,
  },
  entidad: { fontFamily: 'Helvetica-Bold', fontSize: 17, color: TINTA, lineHeight: 1.2 },
  alcalde: { fontSize: 10, color: GRIS, marginTop: 4 },

  titular: { fontFamily: 'Helvetica-Bold', fontSize: 20, lineHeight: 1.25, marginTop: 24, marginBottom: 10 },
  bajada: { fontSize: 10.5, color: GRIS, lineHeight: 1.6 },

  // ── Secciones ───────────────────────────────────────────────────────────
  seccion: { marginTop: 24 },
  cabeceraSec: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  etiqueta: {
    fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: VERDE,
    letterSpacing: 1.2, marginLeft: 6,
  },
  titulo: { fontFamily: 'Helvetica-Bold', fontSize: 14, marginBottom: 8, lineHeight: 1.3 },
  parrafo: { marginBottom: 8, color: GRIS },

  // ── Tarjetas de capacidad, en dos columnas ──────────────────────────────
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  celda: { width: '50%', paddingHorizontal: 5, marginBottom: 10 },
  tarjeta: {
    borderWidth: 1, borderColor: LINEA, borderRadius: 5,
    padding: 10, minHeight: 88,
  },
  tarjetaFila: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  chip: {
    width: 22, height: 22, borderRadius: 4, backgroundColor: VERDE_TENUE,
    alignItems: 'center', justifyContent: 'center', marginRight: 7,
  },
  tarjetaTitulo: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, flex: 1, lineHeight: 1.3 },
  tarjetaTexto: { fontSize: 8.5, color: GRIS, lineHeight: 1.5 },

  // ── Actores ─────────────────────────────────────────────────────────────
  actor: {
    flexDirection: 'row', borderLeftWidth: 2.5, borderLeftColor: VERDE_VIVO,
    paddingLeft: 10, marginBottom: 12,
  },
  actorCuerpo: { flex: 1 },
  actorQuien: {
    fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: GRIS_CLARO, letterSpacing: 0.9,
  },
  actorTitular: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, marginTop: 2, marginBottom: 3 },
  actorTexto: { fontSize: 8.5, color: GRIS, lineHeight: 1.5 },

  // ── Precio ──────────────────────────────────────────────────────────────
  precios: { flexDirection: 'row', marginHorizontal: -5, marginTop: 4 },
  precioCol: { width: '50%', paddingHorizontal: 5 },
  precioUnico: {
    borderWidth: 1, borderColor: LINEA, borderRadius: 6, padding: 14,
    backgroundColor: '#FFFFFF', minHeight: 150,
  },
  precioMensual: {
    borderWidth: 1.5, borderColor: VERDE_VIVO, borderRadius: 6, padding: 14,
    backgroundColor: VERDE_TENUE, minHeight: 150,
  },
  precioRotulo: {
    fontFamily: 'Helvetica-Bold', fontSize: 7, color: GRIS_CLARO, letterSpacing: 1,
  },
  precioRotuloVerde: {
    fontFamily: 'Helvetica-Bold', fontSize: 7, color: VERDE, letterSpacing: 1,
  },
  precioCifra: {
    fontFamily: 'Helvetica-Bold', fontSize: 21, marginTop: 8, marginBottom: 5,
    lineHeight: 1.25, color: TINTA,
  },
  precioCifraVerde: {
    fontFamily: 'Helvetica-Bold', fontSize: 21, marginTop: 8, marginBottom: 5,
    lineHeight: 1.25, color: VERDE,
  },
  precioQue: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, lineHeight: 1.4 },
  precioDetalle: { fontSize: 8.5, color: GRIS, marginTop: 7, lineHeight: 1.5 },

  nota: {
    fontSize: 8.5, color: GRIS, lineHeight: 1.5, marginTop: 10,
    backgroundColor: ARENA, padding: 10, borderRadius: 4,
  },

  // ── Cierre ──────────────────────────────────────────────────────────────
  cierre: {
    marginTop: 22, borderRadius: 6, padding: 16,
    backgroundColor: TINTA,
  },
  cierreTitulo: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: '#FFFFFF' },
  cierreTexto: { fontSize: 9, color: '#AEB8C2', marginTop: 5, lineHeight: 1.55 },

  // ── Pie, con el escudo ──────────────────────────────────────────────────
  pie: {
    position: 'absolute', bottom: 26, left: 46, right: 46,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: LINEA, paddingTop: 8,
  },
  pieTexto: { fontSize: 7, color: GRIS_CLARO },
  escudoPie: { width: 54, height: 18, objectFit: 'contain' },
})

function Seccion({ icono, etiqueta, titulo, children }: {
  icono: string; etiqueta: string; titulo: string; children: React.ReactNode
}) {
  return (
    <View style={e.seccion}>
      <View style={e.cabeceraSec}>
        <Ico d={icono} tam={12} />
        <Text style={e.etiqueta}>{etiqueta.toUpperCase()}</Text>
      </View>
      <Text style={e.titulo}>{titulo}</Text>
      {children}
    </View>
  )
}

function Capacidad({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }) {
  return (
    <View style={e.celda} wrap={false}>
      <View style={e.tarjeta}>
        <View style={e.tarjetaFila}>
          <View style={e.chip}><Ico d={icono} tam={12} /></View>
          <Text style={e.tarjetaTitulo}>{titulo}</Text>
        </View>
        <Text style={e.tarjetaTexto}>{texto}</Text>
      </View>
    </View>
  )
}

function Actor({ quien, titular, texto }: { quien: string; titular: string; texto: string }) {
  return (
    <View style={e.actor} wrap={false}>
      <View style={e.actorCuerpo}>
        <Text style={e.actorQuien}>{quien.toUpperCase()}</Text>
        <Text style={e.actorTitular}>{titular}</Text>
        <Text style={e.actorTexto}>{texto}</Text>
      </View>
    </View>
  )
}

/**
 * El pie lleva el escudo, y no solo el nombre.
 *
 * Cuando un papel lleva rato circulando por una alcaldía, el pie es lo que se
 * mira para saber de quién es. Sin número de página: la forma de numerar en
 * este renderizador —la propiedad `render` de un <Text>— hace desaparecer en
 * silencio, sin error, todo el bloque que la contiene. Se probó anidada y
 * suelta, con y sin `fixed`.
 */
function Pie({ escudo }: { escudo: string }) {
  return (
    <View style={e.pie} fixed>
      <Text style={e.pieTexto}>
        Contratista Digital · Propuesta para la Alcaldía Municipal de {GOMEZ_PLATA.municipio}
      </Text>
      <Image src={escudo} style={e.escudoPie} />
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
      {/* Una sola hoja lógica: el contenido fluye y el renderizador reparte
          las físicas. Solo «La inversión» fuerza su propio comienzo. */}
      <Page size="A4" style={e.pagina}>
        <View style={e.franja} fixed />

        <View style={e.portada}>
          <View style={e.filaMarca}>
            <View>
              <Text style={e.marca}>Contratista Digital</Text>
              <Text style={e.marcaPie}>Gestión documental contractual para alcaldías</Text>
            </View>
            <View style={e.tarjetaEscudo}>
              <Image src={escudo} style={e.escudoGrande} />
            </View>
          </View>

          <Text style={e.dirigida}>PROPUESTA PREPARADA PARA LA</Text>
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
        </View>

        <View style={e.cuerpo}>
          <Seccion icono={TRAZOS.chispa} etiqueta="El momento"
            titulo="Se envía una vez. El resto lo escribe el sistema.">
            <Text style={e.parrafo}>
              El contratista registra sus actividades y adjunta sus soportes. El supervisor
              revisa cada obligación con la evidencia al lado, y aprueba o devuelve. A partir
              de ahí no interviene nadie más: el sistema escribe el informe de actividades,
              la cuenta de cobro, el acta de supervisión, el acta de pago y el acta de
              terminación — numerados, con sus anexos y verificables.
            </Text>
            <Text style={e.parrafo}>
              Los nombres, las fechas, los consecutivos y el valor en letras no vuelven a ser
              motivo de devolución.
            </Text>
          </Seccion>

          <Seccion icono={TRAZOS.escudo} etiqueta="Por dentro"
            titulo="La mejor tecnología del mundo al servicio de su alcaldía.">
            <View style={e.rejilla}>
              <Capacidad icono={TRAZOS.duplicados} titulo="Reconoce una evidencia repetida"
                texto="No hace falta que sea el mismo archivo: reconoce la misma foto aunque la hayan recortado, achicado o vuelto a fotografiar de la pantalla, y se lo advierte al supervisor antes de que apruebe." />
              <Capacidad icono={TRAZOS.huella} titulo="Sella cada documento con su huella"
                texto="Si alguien le cambia un dato —un valor, una fecha, un nombre— la huella deja de coincidir y el cambio queda a la vista. Es el estándar SHA-256, el mismo que usa la banca." />
              <Capacidad icono={TRAZOS.escudo} titulo="Infraestructura certificada"
                texto="Certificada bajo ISO/IEC 27001, 27017, 27018 y SOC 2 Tipo II. La información viaja cifrada, se guarda cifrada y se respalda sola." />
              <Capacidad icono={TRAZOS.correo} titulo="Avisa solo, en el momento"
                texto="Cada vez que algo cambia sale un correo: enviado, aprobado, devuelto. Y todo queda anotado con su responsable y su hora, en un historial que nadie puede retocar." />
              <Capacidad icono={TRAZOS.candado} titulo="No deja enviar lo incompleto"
                texto="Sin actividades, sin evidencias o sin planilla de seguridad social vigente, el informe no sale. El expediente se arma completo porque no hay forma de armarlo a medias." />
              <Capacidad icono={TRAZOS.dispositivos} titulo="Funciona en lo que ya tienen"
                texto="Por internet, sin instalar nada, desde el celular, la tableta o el computador de la secretaría. La alcaldía no compra equipos ni mantiene servidores." />
            </View>

            <View style={e.rejilla}>
              <View style={{ width: '100%', paddingHorizontal: 5 }} wrap={false}>
                <View style={e.tarjeta}>
                  <View style={e.tarjetaFila}>
                    <View style={e.chip}><Ico d={TRAZOS.paquete} tam={12} /></View>
                    <Text style={e.tarjetaTitulo}>
                      Arma el paquete del mes y lo deja listo para SECOP II
                    </Text>
                  </View>
                  <Text style={e.tarjetaTexto}>
                    Los documentos del periodo se descargan ordenados y con sus anexos
                    numerados, listos para cargar. La carga a la plataforma la sigue haciendo
                    una persona: el sistema prepara el paquete, no se conecta con SECOP II.
                  </Text>
                </View>
              </View>
            </View>
          </Seccion>

          <Seccion icono={TRAZOS.huella} etiqueta="Cadena de custodia"
            titulo="Trazabilidad del 100%.">
            <Text style={e.parrafo}>
              Cada documento deja constancia de quién lo hizo, quién lo aprobó y a qué hora.
              Cuando sale, va sellado con su huella digital y su código QR impreso dentro del
              PDF.
            </Text>
            <Text style={e.parrafo}>
              El día que deje el cargo —o el día que decidan no seguir con nosotros— cada
              documento que usted firmó se sigue pudiendo comprobar. No se vence, no se apaga
              y no depende de que sigamos trabajando juntos.
            </Text>
            <Text style={e.parrafo}>
              Porque la pregunta nunca llega el mes que uno la espera: llega años después,
              cuando ya nadie recuerda quién archivó qué. Y entonces lo que lo respalda no es
              haber hecho bien el trabajo, sino poder demostrarlo — sin tres días de angustia
              revolviendo carpetas para encontrar un acta de supervisión.
            </Text>
          </Seccion>

          <Seccion icono={TRAZOS.persona} etiqueta="Quién hace qué"
            titulo="Cada quien vuelve a su oficio.">
            <Text style={e.parrafo}>
              No se trata de hacer el mismo papeleo más rápido. Se trata de que ya nadie en la
              alcaldía tenga que hacerlo.
            </Text>

            <Actor quien="El contratista"
              titular="Ahora solo se ocupa de evidenciar su trabajo."
              texto="Sube actividades y soportes desde el celular, donde esté. No redacta informes, no arma cuentas de cobro, no cuadra consecutivos ni escribe valores en letras." />
            <Actor quien="El supervisor"
              titular="Ahora solo se dedica a supervisar lo trabajado."
              texto="Revisa cada obligación con su evidencia al lado, y aprueba o devuelve. No comprueba fechas, ni si es la cuenta 6 o la 7, ni redacta actas: las escribe el sistema. Y al revisar la seguridad social tiene delante la base de cotización que le corresponde al contrato y el mes realmente cotizado." />
            <Actor quien="Contratación"
              titular="Monta el municipio una vez y deja de perseguir papeles."
              texto="Crea las secretarías, los usuarios y los contratos con sus obligaciones, sus periodos y sus soportes —CDP, CRP, RUT y certificación bancaria— en una sola ficha." />
            <Actor quien="El alcalde"
              titular="Toda la alcaldía en la palma de la mano."
              texto="Una tarjeta por secretaría con su secretario, sus contratistas y su ejecución. La ejecución mensual del año, el presupuesto por secretaría y el calendario de vencimientos. Ve los totales, no los datos de las personas." />
          </Seccion>
          {/* El precio ABRE HOJA NUEVA, y es el único salto forzado del
              documento: es lo que se mira primero cuando el papel vuelve a la
              mesa, y no puede quedar partido ni colgando al pie de una hoja.
              Todo lo demás fluye, que es lo que evita las medias páginas en
              blanco de la versión anterior. */}
          <View break />
          <Seccion icono={TRAZOS.billete} etiqueta="La inversión"
            titulo={`Lo que cuesta, para ${GOMEZ_PLATA.municipio}.`}>
            <View style={e.precios}>
              <View style={e.precioCol}>
                <View style={e.precioUnico}>
                  <Text style={e.precioRotulo}>PRIMER MES · UNA SOLA VEZ</Text>
                  <Text style={e.precioCifra}>{pesos(GOMEZ_PLATA.implementacion)}</Text>
                  <Text style={e.precioQue}>Implementación</Text>
                  <Text style={e.precioDetalle}>
                    Configuración del municipio y sus secretarías, creación de los usuarios,
                    cargue de los contratos vigentes, adaptación de los documentos al formato
                    de {GOMEZ_PLATA.municipio} y capacitación por rol. No se repite.
                  </Text>
                </View>
              </View>

              {/* En verde y no en negro: un bloque oscuro sobre una cifra se lee
                  como una factura. El verde es el color con el que este producto
                  dice «confirmado», y es además la cifra con la que el municipio
                  va a convivir — conviene que se lea como una decisión, no como
                  una carga. */}
              <View style={e.precioCol}>
                <View style={e.precioMensual}>
                  <Text style={e.precioRotuloVerde}>CADA MES</Text>
                  <Text style={e.precioCifraVerde}>{pesos(GOMEZ_PLATA.mensualidad)}</Text>
                  <Text style={e.precioQue}>Operación de la plataforma</Text>
                  <Text style={e.precioDetalle}>
                    Uso ilimitado para todas las secretarías, soporte, actualizaciones,
                    alojamiento y respaldos. No se cobra aparte por usuario, por documento ni
                    por almacenamiento.
                  </Text>
                </View>
              </View>
            </View>

            <Text style={e.nota}>
              El primer mes suma los dos conceptos; a partir del segundo, solo la mensualidad.
              El acompañamiento del primer ciclo mensual completo va incluido en la
              implementación.
            </Text>
          </Seccion>

          <View style={e.cierre} wrap={false}>
            <Text style={e.cierreTitulo}>Podemos empezar por una secretaría.</Text>
            <Text style={e.cierreTexto}>
              Sin comprometer a todo el municipio desde el primer día. Cuando el primer ciclo
              mensual cierre bien, se extiende al resto.
            </Text>
          </View>
        </View>

        <Pie escudo={escudo} />
      </Page>
    </Document>
  )
}
