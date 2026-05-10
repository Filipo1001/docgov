/**
 * lib/numero-letras.ts — Convert a number to Spanish words (Colombian peso format)
 *
 * Extracted from NuevoContratoClient.tsx — single source of truth.
 * Safe to use in both Server Actions and Client Components.
 */
export function numerosALetras(n: number): string {
  if (!n || n === 0) return ''
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const centenas = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  function menorMil(num: number): string {
    if (num === 0) return ''
    if (num < 20) return unidades[num]
    if (num < 30) return num === 20 ? 'VEINTE' : 'VEINTI' + unidades[num - 20]
    if (num < 100) {
      const d = Math.floor(num / 10), u = num % 10
      return decenas[d] + (u > 0 ? ' Y ' + unidades[u] : '')
    }
    const c = Math.floor(num / 100), r = num % 100
    const cStr = (c === 1 && r > 0) ? 'CIENTO' : centenas[c]
    return cStr + (r > 0 ? ' ' + menorMil(r) : '')
  }

  function convertir(num: number): string {
    if (num === 0) return ''
    if (num < 1000) return menorMil(num)
    if (num < 1_000_000) {
      const miles = Math.floor(num / 1000), r = num % 1000
      return (miles === 1 ? 'MIL' : menorMil(miles) + ' MIL') + (r > 0 ? ' ' + menorMil(r) : '')
    }
    if (num < 1_000_000_000) {
      const mill = Math.floor(num / 1_000_000), r = num % 1_000_000
      return (mill === 1 ? 'UN MILLÓN' : menorMil(mill) + ' MILLONES') + (r > 0 ? ' ' + convertir(r) : '')
    }
    return num.toString()
  }

  return convertir(Math.round(n)) + ' PESOS M/CTE'
}
