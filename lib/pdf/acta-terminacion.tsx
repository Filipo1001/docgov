/**
 * Acta de Terminación Bilateral del Contrato o Convenio — formato F-SGG-037.
 *
 * Reproduce el documento que el municipio ya usa en papel, con su tabla de
 * información general, el CONSIDERANDO y los dos acuerdos. Todo el contenido
 * sale de datos que el sistema ya tiene: no se le pide nada nuevo a nadie.
 *
 * ── Las tres firmas ──────────────────────────────────────────────────────
 *
 * El acta es tripartita: alcalde, supervisor y contratista. El sistema tiene
 * firma registrada de los dos últimos y las estampa selladas, con su código de
 * verificación, igual que en el resto de documentos.
 *
 * El alcalde NO es usuario del sistema y no tiene firma registrada, así que su
 * espacio queda como línea en blanco para firma manuscrita — exactamente como
 * en el formato en papel. Es deliberado: inventar una firma de quien no ha
 * entrado a aceptar nada sería falsificarla.
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { PDFVerificacion } from './types'
import { SelloVerificacion, FirmaSellada } from './verificacion-componentes'
import { formatCedula } from '@/lib/format'

export interface ActaTerminacionData {
  municipio: { nombre: string; departamento?: string; nit?: string; representante_legal?: string }
  contrato: {
    numero: string
    anio: number
    objeto: string
    valor_total: number
    valor_letras_total?: string
    fecha_inicio: string
    fecha_fin: string
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

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
})

const s = StyleSheet.create({
  page: {
    paddingTop: 34, paddingBottom: 76, paddingHorizontal: 46,
    fontSize: 9, fontFamily: 'Helvetica', color: '#111827', lineHeight: 1.42,
  },
  // Tabla de encabezado
  caja: { borderWidth: 0.8, borderColor: '#111827' },
  cajaFila: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: '#111827' },
  cajaFilaUlt: { flexDirection: 'row' },
  celdaEtiqueta: {
    width: 118, padding: 5, fontFamily: 'Helvetica-Bold',
    borderRightWidth: 0.8, borderRightColor: '#111827', backgroundColor: '#F3F4F6',
  },
  celdaValor: { flex: 1, padding: 5 },
  tituloBarra: {
    fontFamily: 'Helvetica-Bold', textAlign: 'center', padding: 5,
    backgroundColor: '#E5E7EB', borderBottomWidth: 0.8, borderBottomColor: '#111827',
  },
  responsabilidad: { padding: 6, fontSize: 8, textAlign: 'justify' },
  // Casillas tipo de vínculo
  tipos: { flexDirection: 'row', padding: 5, gap: 22 },
  tipoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  casilla: {
    width: 11, height: 11, borderWidth: 0.8, borderColor: '#111827',
    fontSize: 8, fontFamily: 'Helvetica-Bold',
    textAlign: 'center', lineHeight: 1.25,
  },
  // Cuerpo
  h: { fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  p: { textAlign: 'justify', marginBottom: 8 },
  b: { fontFamily: 'Helvetica-Bold' },
  // Firmas
  firmas: { marginTop: 20 },
  firmaBloque: { width: 300, marginBottom: 18 },
  firmaEspacio: { height: 46, justifyContent: 'flex-end' },
  firmaLinea: { borderTopWidth: 0.8, borderTopColor: '#111827', marginBottom: 3 },
  firmaNombre: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  firmaCargo: { fontSize: 8, color: '#374151' },
  manuscrita: { fontSize: 6.5, color: '#9CA3AF', marginTop: 1 },
  // Pie
  pie: { position: 'absolute', bottom: 20, left: 46, right: 46 },
  pieFormato: {
    flexDirection: 'row', borderWidth: 0.6, borderColor: '#9CA3AF',
    fontSize: 6.5, marginBottom: 5,
  },
  pieCelda: { padding: 3, borderRightWidth: 0.6, borderRightColor: '#9CA3AF' },
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
    <View style={ultima ? s.cajaFilaUlt : s.cajaFila}>
      <Text style={s.celdaEtiqueta}>{etiqueta}</Text>
      <Text style={s.celdaValor}>{children}</Text>
    </View>
  )
}

export function ActaTerminacionPDF({ data }: { data: ActaTerminacionData }) {
  const { municipio, contrato, contratista, supervisor, fechaTerminacion, verificacion } = data

  const nombreContratista = contratista.nombre_completo.toUpperCase()
  const cedula = formatCedula(contratista.cedula)
  const objeto = contrato.objeto.toUpperCase()
  const numeroContrato = `${contrato.numero}-${contrato.anio}`
  const valorTexto = contrato.valor_letras_total
    ? `${contrato.valor_letras_total.toUpperCase()} (${COP.format(contrato.valor_total)})`
    : COP.format(contrato.valor_total)
  const nit = municipio.nit ? ` NIT ${municipio.nit}` : ''
  const depto = municipio.departamento ? ` - ${municipio.departamento}` : ''

  return (
    <Document
      title={`Acta de Terminación — Contrato ${numeroContrato}`}
      author={municipio.nombre}
      subject="Acta de terminación bilateral del contrato"
      creator="Contratista Digital"
    >
      <Page size="A4" style={s.page}>

        {/* ── Grado de responsabilidad ─────────────────────────── */}
        <View style={[s.caja, { marginBottom: 10 }]}>
          <Text style={s.tituloBarra}>GRADO DE RESPONSABILIDAD</Text>
          <Text style={s.responsabilidad}>
            Mediante la suscripción de la presente acta, el supervisor y el contratista asumen plena
            responsabilidad por la veracidad de la información en ella contenida.
          </Text>
        </View>

        {/* ── Información general del contrato ─────────────────── */}
        <View style={s.caja}>
          <Text style={s.tituloBarra}>INFORMACIÓN GENERAL DEL CONTRATO</Text>

          <View style={s.cajaFila}>
            <View style={s.tipos}>
              <Casilla marcada etiqueta="CONTRATO" />
              <Casilla marcada={false} etiqueta="ORDEN" />
              <Casilla marcada={false} etiqueta="CONVENIO" />
            </View>
          </View>

          <Fila etiqueta="Contrato No.">{numeroContrato} de PRESTACIÓN DE SERVICIOS</Fila>
          <Fila etiqueta="Objeto">{objeto}</Fila>
          <Fila etiqueta="Supervisor">
            {supervisor.nombre_completo.toUpperCase()}
            {supervisor.cargo ? ` — ${supervisor.cargo}` : ''}
          </Fila>
          <Fila etiqueta="Contratista">{nombreContratista}   C.C. {cedula}</Fila>
          <Fila etiqueta="Valor del contrato">{valorTexto}</Fila>
          <Fila etiqueta="Plazo de ejecución">
            Desde la suscripción del acta de inicio y hasta el {fechaLarga(contrato.fecha_fin)}
          </Fila>
          <Fila etiqueta="Acta de inicio" ultima>{fechaLarga(contrato.fecha_inicio)}</Fila>
        </View>

        {/* ── Considerando ─────────────────────────────────────── */}
        <Text style={s.h}>CONSIDERANDO:</Text>

        <Text style={s.p}>
          Que, entre el Municipio de {municipio.nombre}{depto}{nit} y <Text style={s.b}>{nombreContratista}</Text>{' '}
          C.C. {cedula}, se celebró un contrato cuyo objeto es {objeto}, por valor de {valorTexto}.
        </Text>

        <Text style={s.p}>
          Que de acuerdo con la cláusula cuarta del contrato, la finalización sería el{' '}
          {fechaLarga(fechaTerminacion)}, razón por la cual, las partes declaramos la terminación del contrato
          por haber ocurrido el vencimiento del plazo fijado en dicho acuerdo de voluntades.
        </Text>

        <Text style={s.p}>Que, en virtud de lo anterior, las partes:</Text>

        {/* ── Acuerdan ─────────────────────────────────────────── */}
        <Text style={s.h}>ACUERDAN:</Text>

        <Text style={s.p}>
          <Text style={s.b}>PRIMERO:</Text> Fijar el {fechaLarga(fechaTerminacion)} como fecha de terminación del
          contrato No. {numeroContrato} cuyo objeto es {objeto}, por cuanto el contratista acreditó el cumplimiento
          del objeto contratado dentro del plazo fijado, frente a lo cual, el supervisor avala que fueron prestados
          los servicios a entera satisfacción.
        </Text>

        <Text style={s.p}>
          <Text style={s.b}>SEGUNDO:</Text> Que en virtud de lo anteriormente descrito, recíprocamente aceptan lo
          aquí expresado y que a partir de la fecha de suscripción de la presente acta se liberan mutuamente de
          cualquier obligación que pueda derivarse del contrato en mención; esto es, que se acepta bilateral y
          voluntariamente la cesación de los efectos obligacionales para los intervinientes.
        </Text>

        <Text style={s.p}>
          Para constancia de lo anterior, firman la presente acta los que en ella intervinieron, a los{' '}
          {fechaLarga(fechaTerminacion)}.
        </Text>

        {/* ── Firmas ───────────────────────────────────────────── */}
        <View style={s.firmas}>
          {/* Alcalde — sin firma en el sistema: espacio para firma manuscrita. */}
          <View style={s.firmaBloque}>
            <View style={s.firmaEspacio} />
            <View style={s.firmaLinea} />
            <Text style={s.firmaNombre}>
              {(municipio.representante_legal ?? '').toUpperCase() || ' '}
            </Text>
            <Text style={s.firmaCargo}>ALCALDE</Text>
            <Text style={s.manuscrita}>Espacio para firma manuscrita</Text>
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

        {/* ── Pie institucional ────────────────────────────────── */}
        <View style={s.pie} fixed>
          <View style={s.pieFormato}>
            <Text style={[s.pieCelda, { width: 54, fontFamily: 'Helvetica-Bold' }]}>FORMATO</Text>
            <Text style={[s.pieCelda, { flex: 1 }]}>
              ACTA DE TERMINACIÓN BILATERAL DEL CONTRATO O CONVENIO
            </Text>
            <Text style={[s.pieCelda, { width: 62 }]}>F-SGG-037</Text>
            <Text style={[s.pieCelda, { width: 52 }]}>Versión 00</Text>
            <Text style={{ padding: 3, width: 60 }}>01/07/2021</Text>
          </View>
          <SelloVerificacion v={verificacion} />
        </View>
      </Page>
    </Document>
  )
}
