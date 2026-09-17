/**
 * Certificación bajo la gravedad de juramento — Retención en la fuente
 * (Ley 1819 de 2016 · Parágrafo 2, Art. 383 E.T.).
 *
 * Reproduce fielmente el documento original (carta, SIN formato institucional).
 * Reutiliza el sistema de firmas (FirmaSellada, fondo tejido) y de verificación
 * (SelloVerificacion, código + QR) del resto del proyecto.
 *
 * El texto jurídico es fijo. Lo único variable es la respuesta jurada SI/NO
 * ("¿ha vinculado más de un trabajador?") y los datos de identidad, todos
 * provenientes de la base de datos.
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { PDFVerificacion } from './types'
import { SelloVerificacion, FirmaSellada } from './verificacion-componentes'
import { formatCedula } from '@/lib/format'

export interface CertificacionData {
  municipio: { nombre: string; departamento?: string; direccion?: string }
  contratista: { nombre_completo: string; cedula: string; firma_url?: string }
  contrato: { numero: string; anio: number }
  /** Lugar de expedición de la cédula (snapshot del municipio del contrato). */
  lugarExpedicion: string
  /** Respuesta jurada: SI (true) / NO (false). */
  vinculoMasTrabajador: boolean
  /** ISO de la aceptación — encabeza la carta ("Fredonia, 30 de enero de 2026"). */
  fechaAceptacion: string
  verificacion: PDFVerificacion
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** ISO → "30 de enero de 2026" (hora de Colombia). */
function fechaLarga(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso))
  const y = p.find(x => x.type === 'year')!.value
  const m = parseInt(p.find(x => x.type === 'month')!.value, 10)
  const d = parseInt(p.find(x => x.type === 'day')!.value, 10)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

const s = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 48,
    paddingHorizontal: 64,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#111827',
    lineHeight: 1.5,
  },
  linea: { marginBottom: 2 },
  bloque: { marginBottom: 14 },
  ref: { marginTop: 6, marginBottom: 18 },
  titulo: {
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    marginBottom: 18,
  },
  parrafo: { textAlign: 'justify', marginBottom: 12 },
  parrafoBold: { textAlign: 'justify', fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  casillas: { fontFamily: 'Helvetica-Bold', marginBottom: 12, letterSpacing: 0.5 },
  cordial: { marginTop: 6, marginBottom: 4 },
  firmaWrap: { marginTop: 4, marginBottom: 2, height: 56, width: 200, justifyContent: 'flex-end' },
  firmaLinea: { borderTopWidth: 0.8, borderTopColor: '#111827', width: 200, marginBottom: 3 },
  nombre: { fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 22, left: 64, right: 64 },
})

export function CertificacionRetencionPDF({ data }: { data: CertificacionData }) {
  const { municipio, contratista, contrato, lugarExpedicion, vinculoMasTrabajador, fechaAceptacion, verificacion } = data

  const nombre = contratista.nombre_completo.toUpperCase()
  const cedula = formatCedula(contratista.cedula)
  const muniNombre = municipio.nombre
  const marcaSi = vinculoMasTrabajador ? 'X' : ' '
  const marcaNo = vinculoMasTrabajador ? ' ' : 'X'

  return (
    <Document
      title={`Certificación de Retención — Contrato ${contrato.numero}-${contrato.anio}`}
      author={contratista.nombre_completo}
      subject="Certificación bajo la gravedad de juramento — Retención en la fuente"
      creator="Contratista Digital"
    >
      <Page size="A4" style={s.page}>
        {/* Lugar y fecha */}
        <Text style={s.bloque}>{muniNombre}, {fechaLarga(fechaAceptacion)}</Text>

        {/* Destinatario */}
        <View style={s.bloque}>
          <Text style={s.linea}>Señores</Text>
          <Text style={s.linea}>Secretaría de Hacienda Municipal</Text>
          {municipio.direccion ? <Text style={s.linea}>{municipio.direccion}</Text> : null}
          <Text style={s.linea}>{muniNombre}</Text>
        </View>

        {/* Referencia */}
        <Text style={s.ref}>
          REF: CERTIFICACIÓN PARA EFECTOS DE RETENCIÓN EN LA FUENTE LEY 1819 DE 2016 – RENTAS DE TRABAJO.
        </Text>

        {/* Título */}
        <Text style={s.titulo}>CERTIFICACIÓN BAJO LA GRAVEDAD DE JURAMENTO</Text>

        {/* Cuerpo */}
        <Text style={s.parrafo}>
          Yo, <Text style={s.nombre}>{nombre}</Text> identificado con cédula de ciudadanía No. {cedula} expedida
          en {lugarExpedicion.toUpperCase()} con el fin de dar cumplimiento a las disposiciones establecidas en la
          Ley 1819 de 2016 y del parágrafo 2 de artículo 383 del Estatuto Tributario, manifiesto bajo gravedad de
          juramento que:
        </Text>

        <Text style={s.parrafoBold}>
          Para efectos de la aplicación de la tabla de retención en la fuente establecida en el artículo 383 del
          Estatuto Tributario, la cual se le aplica a los pagos o abonos en cuenta por concepto de ingresos por
          honorarios y por compensación por servicios personales, “He contratado o vinculado más de un trabajador
          asociado a mi actividad económica por al menos noventa (90) días continuos o discontinuos”. (Parágrafo 2
          art.383 E.T.)
        </Text>

        <Text style={s.casillas}>SI (  {marcaSi}  )          NO (  {marcaNo}  )</Text>

        <Text style={s.parrafo}>
          De la misma manera, en el momento en que contrate o vincule más de un trabajador asociado a mi actividad
          económica, me comprometo a informar.
        </Text>

        {/* Cierre + firma */}
        <Text style={s.cordial}>Cordialmente,</Text>

        {contratista.firma_url ? (
          <View style={s.firmaWrap}>
            <FirmaSellada
              src={contratista.firma_url}
              style={{ width: 200, height: 56, objectFit: 'contain' }}
              v={verificacion}
              contratoNumero={`${contrato.numero}-${contrato.anio}`}
              documento="LA CERTIFICACIÓN DE RETENCIÓN EN LA FUENTE"
              firmante={contratista.nombre_completo}
            />
          </View>
        ) : (
          <View style={{ height: 56, justifyContent: 'flex-end' }}>
            <View style={s.firmaLinea} />
          </View>
        )}

        <Text style={s.nombre}>{nombre}</Text>
        <Text>C.C. {cedula}</Text>

        {/* Pie de verificación (código + QR) */}
        <View style={s.footer} fixed>
          <SelloVerificacion v={verificacion} />
        </View>
      </Page>
    </Document>
  )
}
