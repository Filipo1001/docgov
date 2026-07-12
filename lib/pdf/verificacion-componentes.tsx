/**
 * lib/pdf/verificacion-componentes.tsx — Componentes react-pdf de verificación.
 *
 * - SelloVerificacion: bloque QR + código para el pie de cada documento.
 * - FirmaSellada: firma con un sello de texto superpuesto (código + contrato)
 *   que la ata visualmente a ESTE documento; recortarla arrastra la marca.
 */

import { View, Text, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { PDFVerificacion } from './types'

/** Pie de verificación: QR + código. Se inserta dentro del footer fixed. */
export function SelloVerificacion({ v }: { v?: PDFVerificacion }) {
  if (!v) return null
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingBottom: 4,
        marginBottom: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: '#e5e7eb',
      }}
    >
      <Image src={v.qr} style={{ width: 26, height: 26 }} />
      <View>
        <Text style={{ fontSize: 6, color: '#374151', fontFamily: 'Helvetica-Bold' }}>
          Documento verificable · Código {v.codigo}
        </Text>
        <Text style={{ fontSize: 5.5, color: '#6b7280' }}>
          Escanee el QR o visite contratistadigital.com/verificar
        </Text>
      </View>
    </View>
  )
}

/**
 * Firma con sello superpuesto. El texto va centrado sobre la imagen mediante
 * una capa absoluta (funciona con cualquier alto de firma). Si no hay
 * verificación, se comporta como una <Image> normal.
 */
export function FirmaSellada({
  src,
  style,
  v,
  contratoNumero,
}: {
  src: string
  style: Style
  v?: PDFVerificacion
  contratoNumero: string
}) {
  if (!v) return <Image src={src} style={style} />
  return (
    <View style={{ position: 'relative' }}>
      <Image src={src} style={style} />
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 4.5, color: '#4361ee', opacity: 0.5 }}>
          {v.codigo} · Contrato {contratoNumero}
        </Text>
      </View>
    </View>
  )
}
