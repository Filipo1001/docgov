import EsqueletoPagina from '@/components/pdm/Esqueleto'

/** Lo que se ve mientras llega la pantalla: su forma, no un esqueleto genérico (ver `Esqueleto.tsx`). */
export default function Cargando() {
  return <EsqueletoPagina variante="tablero" />
}
