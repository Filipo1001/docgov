'use client'

/**
 * El historial del administrador: las operaciones de reparto, de grupos y de accesos, de la más reciente a la más
 * antigua, y la forma de DESHACERLAS (migración 067).
 *
 * ── Qué es «deshacer» aquí ───────────────────────────────────────────────
 *
 * No borra el pasado. Crea una operación NUEVA que compensa la anterior, con el motivo de quien la pide, y las dos quedan
 * en esta lista (la reversión se llama «Reversión» y se puede «Rehacer»). Solo se deshace lo MÁS RECIENTE de cada cosa:
 * si lo que la operación tocó volvió a cambiar después, el botón está apagado y la fila dice por qué. Así nunca queda una
 * cadena incoherente.
 *
 * ── Cómo se siente ─────────────────────────────────────────────────────────
 *
 *   · «Deshacer» no actúa al primer toque: abre una ventana que dice QUÉ se va a deshacer, pide el motivo (obligatorio) y
 *     cuenta lo que pasa en el botón (deshaciendo → deshecho).
 *   · Un error no cierra la ventana: se despliega ahí mismo, con la frase que escribió la base.
 *   · Al terminar, la lista se recarga sola y un aviso confirma qué pasó.
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deshacerOperacion } from '@/app/actions/pdm'
import type { Resultado } from '@/lib/pdm/acciones'
import { fechaHoraBogota } from '@/lib/pdm/historial'
import {
  describirOperacion, errorEnMotivoDeshacer, familiaDeOperacion, MAX_MOTIVO_DESHACER, MIN_MOTIVO_DESHACER,
  type OperacionPdm,
} from '@/lib/pdm/operaciones'
import { useAvisar } from './Avisos'
import Dialogo from './Dialogo'
import EncabezadoSeccion from './EncabezadoSeccion'
import BotonAccion, { Despliegue, useConfirmar } from './Movimiento'
import Pagina from './Pagina'
import { T } from './tema'
import { Rotulo, Sello } from './ui'

export default function HistorialPdm({ operaciones, leyo, deshacer = deshacerOperacion }: {
  operaciones: OperacionPdm[]
  /** `false`: no se pudo leer el historial (la pantalla lo dice en vez de mostrar una lista vacía como si no hubiera nada). */
  leyo: boolean
  deshacer?: (lote: string, motivo: string) => Promise<Resultado<{ filas: number }>>
}) {
  const router = useRouter()
  const avisar = useAvisar()
  const [elegida, setElegida] = useState<OperacionPdm | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { fase, correr } = useConfirmar()
  const campo = useRef<HTMLTextAreaElement>(null)

  const porLote = new Map(operaciones.map(o => [o.lote, o]))
  const esReversion = elegida?.operacion === 'deshacer'

  function abrir(op: OperacionPdm) {
    setElegida(op)
    setMotivo('')
    setError(null)
  }
  function cerrar() {
    if (fase !== 'reposo') return
    setElegida(null)
  }
  function confirmar() {
    if (!elegida) return
    const mal = errorEnMotivoDeshacer(motivo)
    if (mal) {
      setError(mal)
      campo.current?.focus()
      return
    }
    setError(null)
    const op = elegida
    void correr(() => deshacer(op.lote, motivo), {
      quedarseHecho: true,
      alTerminar: () => {
        setElegida(null)
        avisar(op.operacion === 'deshacer' ? 'Operación rehecha. Quedó anotada en el historial.' : 'Operación deshecha. Quedó anotada en el historial.', 'bien')
        router.refresh()
      },
      alFallar: mensaje => setError(mensaje),
    })
  }

  const restantes = MAX_MOTIVO_DESHACER - motivo.length

  return (
    <Pagina>
      <EncabezadoSeccion
        titulo="Historial"
        detalle="Los cambios de reparto, de grupos y de accesos, del más reciente al más antiguo. Aquí se pueden deshacer."
        datos={[{ rotulo: 'Operaciones', valor: leyo ? String(operaciones.length) : '—' }]}
      />

      <p className={T.avisoNota}>
        Deshacer no borra nada: crea una operación nueva que compensa la anterior, con tu motivo, y las dos quedan aquí.
        Solo se deshace lo más reciente de cada cosa.
      </p>

      {!leyo ? (
        <p role="alert" className={T.avisoMal}>No se pudo leer el historial. Recarga la página; si sigue igual, avísale a quien administra la plataforma.</p>
      ) : operaciones.length === 0 ? (
        <p className={`${T.panel} px-5 py-10 text-center text-sm ${T.suave}`}>Todavía no hay operaciones: aquí aparecerán los repartos, los grupos y los accesos que cambies.</p>
      ) : (
        <ul className={`${T.panel} divide-y ${T.divide}`}>
          {operaciones.map(op => {
            const original = op.deshace ? porLote.get(op.deshace) ?? null : null
            const reversion = op.operacion === 'deshacer'
            return (
              <li key={op.lote} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Rotulo>{familiaDeOperacion(op.operacion)}</Rotulo>
                    {op.estado === 'deshecha' && <Sello>Deshecha</Sello>}
                  </div>
                  <p className="mt-1 text-[15px] font-medium leading-snug text-[#192031] [overflow-wrap:anywhere]">{describirOperacion(op, original)}</p>
                  <p className={`mt-0.5 text-xs ${T.tenue}`}>{fechaHoraBogota(op.cuando)} · {op.quien}</p>
                  {op.motivo && <p className={`mt-1 text-sm ${T.suave} [overflow-wrap:anywhere]`}>«{op.motivo}»</p>}
                  {op.estado === 'bloqueada' && op.razon && <p className="mt-1.5 text-xs leading-snug text-[#8A5A00]">{op.razon}</p>}
                </div>
                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => abrir(op)}
                    disabled={op.estado !== 'se_puede'}
                    aria-label={`${reversion ? 'Rehacer' : 'Deshacer'}: ${describirOperacion(op, original)}`}
                    className={`${T.accionSecundariaChica} disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {reversion ? 'Rehacer' : 'Deshacer'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {elegida && (
        <Dialogo
          titulo={esReversion ? '¿Rehacer esta operación?' : '¿Deshacer esta operación?'}
          subtitulo={describirOperacion(elegida, elegida.deshace ? porLote.get(elegida.deshace) ?? null : null)}
          onCerrar={cerrar}
          ancho="sm:max-w-lg"
          pie={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={cerrar} disabled={fase !== 'reposo'} className={T.accionSecundaria}>Cancelar</button>
              <BotonAccion
                fase={fase}
                onClick={confirmar}
                etiquetas={esReversion
                  ? { reposo: 'Rehacer', trabajando: 'Rehaciendo', hecho: 'Rehecho' }
                  : { reposo: 'Deshacer', trabajando: 'Deshaciendo', hecho: 'Deshecho' }}
              />
            </div>
          }
        >
          <p className={`text-sm leading-relaxed ${T.suave}`}>
            {esReversion
              ? 'Se volverá a aplicar lo que se había deshecho. '
              : 'Todo lo que cambió esta operación volverá a como estaba antes. '}
            Quedará anotado en el historial, con tu nombre y tu motivo; lo anterior no se borra.
          </p>
          <div>
            <label htmlFor="motivo-deshacer" className={`${T.rotulo} block`}>¿Por qué lo haces?</label>
            <textarea
              id="motivo-deshacer"
              ref={campo}
              autoFocus
              rows={3}
              value={motivo}
              maxLength={MAX_MOTIVO_DESHACER}
              disabled={fase !== 'reposo'}
              onChange={e => { setMotivo(e.target.value); if (error) setError(null) }}
              placeholder="Por ejemplo: se asignó a la persona equivocada."
              aria-describedby="ayuda-motivo-deshacer"
              className={`${T.campo} mt-1.5 resize-none`}
            />
            <p id="ayuda-motivo-deshacer" className={`mt-1 flex justify-between gap-3 text-xs ${T.tenue}`}>
              <span>Obligatorio, al menos {MIN_MOTIVO_DESHACER} caracteres.</span>
              <span aria-hidden className="tabular-nums">{restantes}</span>
            </p>
          </div>
          <Despliegue abierto={!!error} separacion="pb-1">
            {error ? <p role="alert" className="text-sm font-medium text-[#B42318]">{error}</p> : null}
          </Despliegue>
        </Dialogo>
      )}
    </Pagina>
  )
}
