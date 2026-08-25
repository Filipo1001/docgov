/**
 * Acta de Terminación Bilateral del Contrato o Convenio — formato F-SGG-037.
 *
 * Reproduce el documento que el municipio ya usa en papel. El original está
 * maquetado con cuatro tablas y se respeta esa estructura:
 *
 *   1. Grado de responsabilidad + Información general del contrato (un cuadro)
 *   2. CONSIDERANDO  — cuadro con fila de encabezado
 *   3. ACUERDAN      — cuadro con fila de encabezado
 *   4. El bloque FORMATO / código / versión, que aquí llega como membrete
 *
 * La constancia y las firmas van fuera de los cuadros, como en el original.
 * Todo el contenido sale de datos que el sistema ya tiene: no se le pide nada
 * nuevo a nadie.
 *
 * ── Las tres firmas ──────────────────────────────────────────────────────
 *
 * El acta es tripartita: alcalde, supervisor y contratista.
 *
 * El alcalde no es usuario del sistema: no inicia sesión ni aprueba nada. Su
 * firma es un atributo institucional del municipio y la carga el administrador
 * desde /dashboard/admin/municipio. Se estampa cuando el supervisor aprueba el
 * último informe, porque en el procedimiento del municipio esa aprobación es
 * el acto con el que la administración suscribe el acta — el supervisor firma
 * por sí y por el alcalde.
 *
 * Si el municipio aún no ha cargado esa firma, su espacio queda como línea en
 * blanco para firma manuscrita, como en el formato en papel.
 */

import React from 'react'
import path from 'path'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import type { PDFVerificacion } from './types'
import { FirmaSellada, CodigoPie } from './verificacion-componentes'
import { formatCedula } from '@/lib/format'

/** Membrete institucional del formato, igual que en las otras actas. */
const HEADER_PATH = path.join(process.cwd(), 'public', 'header-acta-terminacion.png')

export interface OtrosiResumen {
  numero: number
  tipo: 'adicion' | 'prorroga' | 'modificatorio' | 'aclaratorio'
  fecha_inicio: string
}

export interface ActaTerminacionData {
  municipio: {
    nombre: string; departamento?: string; nit?: string
    representante_legal?: string
    /** Firma del alcalde, ya firmada para descarga. Ausente → línea en blanco. */
    firma_representante_url?: string
  }
  contrato: {
    numero: string
    anio: number
    objeto: string
    valor_total: number
    valor_letras_total?: string
    fecha_inicio: string
    fecha_fin: string
    /** Vacío si el contrato nunca se modificó — el caso normal, no la excepción. */
    otrosies: OtrosiResumen[]
  }
  contratista: { nombre_completo: string; cedula: string; firma_url?: string }
  supervisor: { nombre_completo: string; cargo?: string; firma_url?: string }
  /** Fecha de terminación congelada al aceptar. */
  fechaTerminacion: string
  fechaAceptacion: string
  verificacion: PDFVerificacion
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** 'YYYY-MM-DD' → "30 de noviembre de 2025", sin cruzar husos horarios. */
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

/** 'YYYY-MM-DD' → "30 días del mes de noviembre de 2025". */
function fechaConstancia(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} días del mes de ${MESES[m - 1]} de ${y}`
}

const TIPO_OTROSI_LABEL: Record<OtrosiResumen['tipo'], string> = {
  adicion: 'Adición', prorroga: 'Prórroga', modificatorio: 'Modificatorio', aclaratorio: 'Aclaratorio',
}

/** [1,2,3] → "No. 1, No. 2 y No. 3" — para nombrar otrosíes en prosa legal. */
function listaNumeros(nums: number[]): string {
  const etiquetas = nums.map(n => `No. ${n}`)
  if (etiquetas.length <= 1) return etiquetas.join('')
  return `${etiquetas.slice(0, -1).join(', ')} y ${etiquetas[etiquetas.length - 1]}`
}

/**
 * Quita el punto final del objeto contractual.
 *
 * El objeto se transcribe del contrato y casi siempre viene con punto. Las
 * frases que lo insertan le añaden su propia puntuación, así que salía
 * «... DEL MUNICIPIO DE FREDONIA.. DIECISIETE MILLONES ...» y «... DE
 * FREDONIA., por cuanto el contratista ...». En un acta que se radica, ese
 * doble signo se lee como un error de transcripción.
 */
function sinPuntoFinal(texto: string): string {
  return texto.replace(/[.\s]+$/, '')
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})

const BORDE = '#111827'

const s = StyleSheet.create({
  // OJO: sin `lineHeight` aquí. Heredado desde Page rompe el pie posicionado
  // en absoluto — deja de pintar su texto y estira el bloque a media página.
  // El interlineado se aplica en los estilos que lo necesitan.
  //
  // Espaciado alineado con acta-pago.tsx, pero un punto más denso que él:
  // aquel es un documento de una página y aquí el aire se acumulaba hasta
  // producir cuatro, dos de ellas casi vacías. El pie ocupa ~44 pt reales
  // (bottom 14 + tres líneas de 7 pt), así que 56 de paddingBottom le dejan
  // holgura sin regalar media página.
  page: {
    paddingTop: 30, paddingBottom: 56, paddingHorizontal: 46,
    fontSize: 9, fontFamily: 'Helvetica', color: '#111827',
  },

  // ── Cuadros ──
  caja: { borderWidth: 0.8, borderColor: BORDE, marginBottom: 8 },
  fila: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: BORDE },
  filaUlt: { flexDirection: 'row' },
  barra: {
    fontFamily: 'Helvetica-Bold', textAlign: 'center', padding: 6,
    backgroundColor: '#E5E7EB', borderBottomWidth: 0.8, borderBottomColor: BORDE,
  },
  etiqueta: {
    width: 122, padding: 6, fontFamily: 'Helvetica-Bold',
    borderRightWidth: 0.8, borderRightColor: BORDE, backgroundColor: '#F3F4F6',
  },
  valor: { flex: 1, padding: 6 },
  celdaAncha: { padding: 6, lineHeight: 1.3 },
  cuerpoCaja: { padding: 9 },

  // Casillas del tipo de vínculo
  tipos: { flexDirection: 'row', padding: 6, gap: 24 },
  tipoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  casilla: {
    width: 11, height: 11, borderWidth: 0.8, borderColor: BORDE,
    fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center', lineHeight: 1.25,
  },

  // 1.35 y no 1.5: en párrafos justificados y largos —el objeto contractual
  // ocupa seis renglones él solo— cada décima de interlineado se multiplica
  // por todo el documento. A 1.5 el acta se leía despegada y sumaba páginas.
  p: { textAlign: 'justify', marginBottom: 6, lineHeight: 1.3 },
  b: { fontFamily: 'Helvetica-Bold' },

  // ── Firmas ──
  // El bloque va con `wrap={false}` —una firma partida en dos páginas no es
  // una firma—, así que su alto decide si cabe tras la constancia o se va
  // solo a la última página. Con 24/20/46 medía ~250 pt y nunca cabía.
  firmas: { marginTop: 14 },
  firmaBloque: { width: 300, marginBottom: 12 },
  firmaEspacio: { height: 38, justifyContent: 'flex-end' },
  firmaLinea: { borderTopWidth: 0.8, borderTopColor: BORDE, marginBottom: 3 },
  firmaNombre: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  firmaCargo: { fontSize: 8, color: '#374151' },
  manuscrita: { fontSize: 6.5, color: '#9CA3AF', marginTop: 1 },

  // ── Pie institucional, idéntico al del acta de supervisión y el de pago ──
  footer: {
    position: 'absolute', bottom: 14, left: 46, right: 46,
    borderTopWidth: 0.5, borderTopColor: '#aaa', paddingTop: 3,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  footerLeft: { flex: 1 },
  footerText: { fontSize: 7, color: '#666', lineHeight: 1.4 },
  footerPage: { fontSize: 7.5, color: '#000', textAlign: 'right', marginLeft: 8 },
})

function Casilla({ marcada, etiqueta }: { marcada: boolean; etiqueta: string }) {
  return (
    <View style={s.tipoItem}>
      <Text style={s.casilla}>{marcada ? 'X' : ' '}</Text>
      <Text style={{ fontSize: 8.5 }}>{etiqueta}</Text>
    </View>
  )
}

function Fila({ etiqueta, children, ultima }: { etiqueta: string; children: React.ReactNode; ultima?: boolean }) {
  return (
    <View style={ultima ? s.filaUlt : s.fila}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <Text style={s.valor}>{children}</Text>
    </View>
  )
}

/**
 * Cuadro con fila de encabezado — la forma de CONSIDERANDO y ACUERDAN.
 * `s.barra` ya centra por defecto; antes se forzaba a la izquierda solo
 * aquí, así que estos dos títulos quedaban desalineados frente a los otros
 * dos encabezados del documento (GRADO DE RESPONSABILIDAD, INFORMACIÓN
 * GENERAL DEL CONTRATO), que sí usan el centrado normal.
 *
 * ── Cómo se evita que el título quede huérfano ───────────────────────────
 *
 * Hubo tres intentos antes de este. `wrap={false}` en todo el cuadro evitaba
 * el huérfano pero empujaba el cuadro entero —y en cascada las firmas—
 * dejando páginas casi vacías. `minPresenceAhead` en el título tampoco: ese
 * prop mide dentro del propio nodo de texto, y el cuerpo es un `View`
 * hermano. El tercero fue un salto de página explícito antes de ACUERDAN,
 * justificado en que el cuadro 1 y CONSIDERANDO llenarían la primera página
 * por sí solos.
 *
 * Esa premisa resultó falsa. En el contrato 136 CONSIDERANDO se pasa a la
 * segunda página por tres renglones, y el salto forzado dejaba el 70 % de
 * esa página en blanco: el acta salía en cuatro páginas, dos casi vacías.
 *
 * Ahora `minPresenceAhead` va en el `View` contenedor, que es donde sí mide
 * el espacio disponible por delante. La diferencia con `wrap={false}` es
 * importante: aquel prohíbe partir el cuadro nunca; este solo exige que
 * quepan el encabezado y un par de renglones antes de empezarlo, y deja que
 * el cuerpo siga fluyendo a la página siguiente si hace falta.
 */
function CajaTitulada({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={s.caja} minPresenceAhead={64}>
      <Text style={s.barra}>{titulo}</Text>
      <View style={s.cuerpoCaja}>{children}</View>
    </View>
  )
}

export function ActaTerminacionPDF({ data }: { data: ActaTerminacionData }) {
  const { municipio, contrato, contratista, supervisor, fechaTerminacion, verificacion } = data

  const nombreContratista = contratista.nombre_completo.toUpperCase()
  const cedula = formatCedula(contratista.cedula)
  const objeto = sinPuntoFinal(contrato.objeto.toUpperCase())
  const numeroContrato = `${contrato.numero}-${contrato.anio}`
  const valorTexto = contrato.valor_letras_total
    ? `${contrato.valor_letras_total.toUpperCase()} (${COP.format(contrato.valor_total)})`
    : COP.format(contrato.valor_total)
  const nit = municipio.nit ? ` NIT ${municipio.nit}` : ''
  const depto = municipio.departamento ? ` - ${municipio.departamento}` : ''

  const otrosies = contrato.otrosies
  const hayOtrosies = otrosies.length > 0
  // Solo la prórroga mueve la fecha que CONSIDERANDO usa para justificar la
  // terminación; una adición o un aclaratorio no la afectan y no necesitan
  // aparecer en esa frase — sí en el inventario del Cuadro 1, ese es completo.
  const prorrogas = otrosies.filter(o => o.tipo === 'prorroga')

  return (
    <Document
      title={`Acta de Terminación — Contrato ${numeroContrato}`}
      author={municipio.nombre}
      subject="Acta de terminación bilateral del contrato"
      creator="Contratista Digital"
    >
      <Page size="A4" style={s.page}>

        {/* Membrete institucional: lleva el bloque FORMATO / código / versión. */}
        <Image src={HEADER_PATH} style={{ width: '100%', marginBottom: 10 }} fixed />

        {/* ── Cuadro 1: responsabilidad + información general ──────
            En el original es una sola tabla, no dos. */}
        <View style={s.caja}>
          <Text style={s.barra}>GRADO DE RESPONSABILIDAD</Text>
          <Text style={[s.celdaAncha, {
            borderBottomWidth: 0.8, borderBottomColor: BORDE, fontSize: 8, textAlign: 'justify',
          }]}>
            Mediante la suscripción de la presente acta, el supervisor y el contratista asumen plena
            responsabilidad por la veracidad de la información en ella contenida.
          </Text>

          <Text style={s.barra}>INFORMACIÓN GENERAL DEL CONTRATO</Text>

          <View style={s.fila}>
            <View style={s.tipos}>
              <Casilla marcada etiqueta="CONTRATO" />
              <Casilla marcada={false} etiqueta="ORDEN" />
              <Casilla marcada={false} etiqueta="CONVENIO" />
            </View>
          </View>

          <Fila etiqueta="CONTRATO">No. {numeroContrato} de PRESTACIÓN DE SERVICIOS</Fila>

          <View style={s.fila}>
            <Text style={[s.celdaAncha, { textAlign: 'justify' }]}>
              <Text style={s.b}>OBJETO DEL CONTRATO: </Text>{objeto}.
            </Text>
          </View>

          <Fila etiqueta="Supervisor">
            {supervisor.nombre_completo.toUpperCase()}
            {supervisor.cargo ? ` — ${supervisor.cargo}` : ''}
          </Fila>
          <Fila etiqueta="Contratista">{nombreContratista}   C.C. {cedula}</Fila>
          <Fila etiqueta="Valor del Contrato">{valorTexto}</Fila>
          {/* Sin "inicial": el contrato pudo prorrogarse por otrosí, y esta
              fecha ya es la vigente —la fila de Otrosíes de abajo aclara si
              cambió—, no la que se pactó el primer día. */}
          <Fila etiqueta="Plazo de ejecución:">
            Desde la suscripción del acta de inicio y hasta el {fechaLarga(contrato.fecha_fin)}
          </Fila>
          <Fila etiqueta="Acta de inicio:" ultima={!hayOtrosies}>
            {fechaLarga(contrato.fecha_inicio)}
          </Fila>
          {hayOtrosies && (
            <Fila etiqueta="Otrosíes:" ultima>
              {otrosies.map(o => `No. ${o.numero} (${TIPO_OTROSI_LABEL[o.tipo]}, ${fechaLarga(o.fecha_inicio)})`).join('; ')}
            </Fila>
          )}
        </View>

        {/* ── Cuadro 2: CONSIDERANDO ──────────────────────────────── */}
        <CajaTitulada titulo="CONSIDERANDO:">
          <Text style={s.p}>
            Que, entre el Municipio de {municipio.nombre}{depto}{nit} y <Text style={s.b}>{nombreContratista}</Text>{' '}
            C.C. {cedula}, se celebró un contrato cuyo objeto es {objeto}. {valorTexto}
          </Text>
          <Text style={s.p}>
            Que de acuerdo con la cláusula cuarta del contrato
            {prorrogas.length > 0 && `, modificada mediante ${prorrogas.length === 1 ? 'el Otrosí' : 'los Otrosíes'} ${listaNumeros(prorrogas.map(o => o.numero))}`},
            {' '}la finalización sería el {fechaLarga(fechaTerminacion)}, razón por la cual, las partes
            declaramos la terminación del contrato por haber ocurrido el vencimiento del plazo fijado en
            dicho acuerdo de voluntades.
          </Text>
          <Text style={[s.p, { marginBottom: 0 }]}>Que, en virtud de lo anterior, las partes:</Text>
        </CajaTitulada>

        {/* ── Cuadro 3: ACUERDAN ──────────────────────────────────── */}
        <CajaTitulada titulo="ACUERDAN:">
          <Text style={s.p}>
            <Text style={s.b}>PRIMERO:</Text> Fijar el {fechaLarga(fechaTerminacion)} como fecha de Terminación
            del contrato No {numeroContrato} cuyo objeto: {objeto}, por cuanto el contratista acreditó el
            cumplimiento del objeto contratado dentro del plazo fijado, frente a lo cual, el supervisor avala
            que fueron prestados los servicios a entera satisfacción.
          </Text>
          <Text style={[s.p, { marginBottom: 0 }]}>
            <Text style={s.b}>SEGUNDO:</Text> Que en virtud de lo anteriormente descrito, recíprocamente aceptan
            lo aquí expresado y que a partir de la fecha de suscripción de la presente acta se liberan mutuamente
            de cualquier obligación que pueda derivarse del contrato en mención: esto es, que se acepta bilateral
            y voluntariamente la cesación de los efectos obligacionales para los intervinientes.
          </Text>
        </CajaTitulada>

        {/* ── Constancia y firmas, fuera de los cuadros ───────────── */}
        <Text style={s.p}>
          Para constancia de lo anterior, firman la presente acta los que en ella intervinieron, a los{' '}
          {fechaConstancia(fechaTerminacion)}.
        </Text>

        <View style={s.firmas} wrap={false}>
          {/* Alcalde — la firma la carga el municipio; si no hay, línea en blanco. */}
          <View style={s.firmaBloque}>
            {municipio.firma_representante_url ? (
              <View style={s.firmaEspacio}>
                <FirmaSellada
                  src={municipio.firma_representante_url}
                  style={{ width: 190, height: 46, objectFit: 'contain' }}
                  v={verificacion}
                  contratoNumero={numeroContrato}
                  documento="EL ACTA DE TERMINACIÓN"
                  firmante={municipio.representante_legal ?? 'ALCALDE'}
                />
              </View>
            ) : (
              <View style={s.firmaEspacio} />
            )}
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombre}>
              {(municipio.representante_legal ?? '').toUpperCase() || ' '}
            </Text>
            <Text style={s.firmaCargo}>ALCALDE</Text>
            {!municipio.firma_representante_url && (
              <Text style={s.manuscrita}>Espacio para firma manuscrita</Text>
            )}
          </View>

          {/* Supervisor */}
          <View style={s.firmaBloque}>
            {supervisor.firma_url ? (
              <View style={s.firmaEspacio}>
                <FirmaSellada
                  src={supervisor.firma_url}
                  style={{ width: 190, height: 46, objectFit: 'contain' }}
                  v={verificacion}
                  contratoNumero={numeroContrato}
                  documento="EL ACTA DE TERMINACIÓN"
                  firmante={supervisor.nombre_completo}
                />
              </View>
            ) : (
              <View style={s.firmaEspacio} />
            )}
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombre}>{supervisor.nombre_completo.toUpperCase()}</Text>
            <Text style={s.firmaCargo}>SUPERVISOR{supervisor.cargo ? ` — ${supervisor.cargo}` : ''}</Text>
          </View>

          {/* Contratista */}
          <View style={s.firmaBloque}>
            {contratista.firma_url ? (
              <View style={s.firmaEspacio}>
                <FirmaSellada
                  src={contratista.firma_url}
                  style={{ width: 190, height: 46, objectFit: 'contain' }}
                  v={verificacion}
                  contratoNumero={numeroContrato}
                  documento="EL ACTA DE TERMINACIÓN"
                  firmante={contratista.nombre_completo}
                />
              </View>
            ) : (
              <View style={s.firmaEspacio} />
            )}
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombre}>{nombreContratista}</Text>
            <Text style={s.firmaCargo}>CONTRATISTA — C.C. {cedula}</Text>
          </View>
        </View>

        {/* ── Pie institucional ───────────────────────────────────── */}
        <View style={s.footer} fixed>
          <View style={s.footerRow}>
            <View style={s.footerLeft}>
              <Text style={s.footerText}>
                Municipio de Fredonia – Centro Administrativo Municipal &quot;Rodrigo Arenas Betancourt&quot;
              </Text>
              <Text style={s.footerText}>
                Teléfono: 8401264 / Dirección: Calle 50 N°50-58 / Código Postal: 055070
              </Text>
              <Text style={s.footerText}>
                Email: contactenos@fredonia-antioquia.gov.co / Sitio web: www.fredonia-antioquia.gov.co
              </Text>
            </View>
            {/* Columna derecha: página + código. Dos líneas frente a las tres
                de la izquierda, así que no aumenta la altura del pie. */}
            <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
              <Text
                style={s.footerPage}
                render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
              />
              <CodigoPie v={verificacion} />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
