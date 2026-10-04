'use client'

/**
 * La pregunta antes de quitar a alguien de un indicador.
 *
 * «Quitar» estaba al lado de «Asignar…» y quitaba al primer toque: un dedo torpe en el teléfono dejaba un indicador sin
 * responsable. Es reversible y queda en el historial, pero un descuido que hay que deshacer es un descuido. Ahora
 * «Quitar» solo abre esto, DEBAJO de la persona a la que se refiere:
 *
 *   · Dice la consecuencia (con el principal: que el indicador queda sin responsable) y que queda en el historial.
 *   · El foco va a «Cancelar», la salida segura; «Sí, quitar» es rojo y hay que alcanzarlo a propósito.
 *   · Escape cancela SOLO esta pregunta (no cierra la ficha que la contiene).
 *   · Mientras trabaja, el botón cuenta lo que pasa (quitando → quitado) y un error se despliega aquí mismo.
 *
 * Es el mismo gesto de «Disolver grupo», para que las acciones que no se deshacen de un clic se sientan iguales.
 */

import { useEffect, useRef } from 'react'
import BotonAccion, { Despliegue, type FaseBoton } from './Movimiento'
import { useEscapePrimero } from './Ventana'
import { T } from './tema'

export default function ConfirmarQuitar({ abierto, nombre, comoPrincipal, fase, error, onCancelar, onConfirmar }: {
  abierto: boolean
  nombre: string
  /** Quitar al responsable principal (el indicador queda sin responsable) o a un apoyo. */
  comoPrincipal: boolean
  fase: FaseBoton
  error: string | null
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const cancelar = useRef<HTMLButtonElement>(null)
  // Al abrirse, el foco va a la salida segura.
  useEffect(() => { if (abierto) cancelar.current?.focus({ preventScroll: true }) }, [abierto])
  // Escape cancela esta pregunta, salvo que ya se esté quitando (entonces no hay a dónde volver).
  useEscapePrimero(abierto && fase === 'reposo', onCancelar)

  return (
    <Despliegue abierto={abierto} separacion="pb-1">
      <div role="group" aria-label={`Confirmar: quitar a ${nombre}`} className="mt-3 rounded-lg border border-[#F1C0BB] bg-[#FDF3F2] px-4 py-3">
        <p className="text-sm leading-snug text-[#912018]">
          {comoPrincipal
            ? <>¿Quitar a <b>{nombre}</b> como responsable principal? El indicador quedará <b>sin responsable</b> hasta que asignes a alguien.</>
            : <>¿Quitar a <b>{nombre}</b> como apoyo de este indicador?</>}
          {' '}Queda en el historial.
        </p>
        <Despliegue abierto={!!error} separacion="pb-1">
          {error ? <p role="alert" className="mt-2 text-xs font-medium text-[#B42318]">{error}</p> : null}
        </Despliegue>
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* Tamaño normal, no «chico»: es una decisión que importa y, en un teléfono, el dedo tiene que acertar. */}
          <button ref={cancelar} onClick={onCancelar} disabled={fase !== 'reposo'} className={T.accionSecundaria}>Cancelar</button>
          <BotonAccion
            fase={fase}
            onClick={onConfirmar}
            className="!bg-[#B42318] hover:!bg-[#912018]"
            etiquetas={{ reposo: 'Sí, quitar', trabajando: 'Quitando', hecho: 'Quitado' }}
          />
        </div>
      </div>
    </Despliegue>
  )
}
