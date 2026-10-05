/**
 * La frase que abre el Resumen: lo que un administrador querría que le dijeran en voz alta antes de mirar nada.
 *
 * La arma `lecturaDelAnio` con las cuentas del año (nada escrito a mano). Dos tonos, para que se lea de un golpe: el
 * titular dice cómo va el año; el detalle, qué lo frena y a quién le toca. Sin caja: es texto, no un objeto.
 *
 * `aria-live`: al elegir otro año la frase cambia, y quien usa lector de pantalla debe oír que cambió.
 */

import { T } from './tema'

export default function Lectura({ titular, detalle }: { titular: string; detalle: string }) {
  return (
    <div aria-live="polite" className="max-w-3xl">
      <p className={`text-[17px] font-medium leading-snug [text-wrap:pretty] sm:text-lg ${T.tinta}`}>{titular}</p>
      {detalle && <p className={`mt-1.5 text-sm leading-relaxed [text-wrap:pretty] ${T.suave}`}>{detalle}</p>}
    </div>
  )
}
