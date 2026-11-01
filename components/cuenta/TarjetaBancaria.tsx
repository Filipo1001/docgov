'use client'

/**
 * La cuenta donde el contratista recibe sus pagos, como una tarjeta del color de su banco.
 *
 * Arriba, el icono oficial de la app del banco, el nombre y la entidad que emite la cuenta; detrás, el mismo icono en
 * grande y casi transparente, que es lo que hace que la tarjeta «sea» de ese banco. Abajo, el número completo agrupado
 * para dictarlo sin perderse, el titular y un botón para copiar solo los dígitos (lo que piden las apps de los bancos).
 *
 * Un banco que no está en el catálogo (lib/bancos.ts) usa la misma tarjeta en la tinta de la marca, sin icono.
 */

import { useState } from 'react'
import Icono from '@/components/ui/Icono'
import { Iconos } from '@/lib/iconos'
import { MARCA } from '@/lib/marca'
import { bancoDe, agruparNumeroCuenta } from '@/lib/bancos'

export interface CuentaBancaria {
  banco: string | null
  tipo: string | null
  numero: string | null
}

function tipoLegible(tipo: string | null): string | null {
  if (!tipo) return null
  if (/^ahorro/i.test(tipo)) return 'Ahorros'
  if (/^corriente/i.test(tipo)) return 'Corriente'
  return tipo
}

export default function TarjetaBancaria({ cuenta, titular }: { cuenta: CuentaBancaria; titular: string }) {
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null)

  if (!cuenta.banco && !cuenta.numero) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
          <Icono glifo={Iconos.dominio.cuentaBancaria} tamano="md" />
        </span>
        <p className="text-sm font-semibold text-gray-900">Aún no tienes una cuenta registrada</p>
        <p className="text-sm text-gray-600">Pídele a la oficina de contratación que la registre para recibir tus pagos.</p>
      </div>
    )
  }

  const banco = bancoDe(cuenta.banco)
  const color = banco?.color ?? MARCA
  const oscuro = !!banco?.textoOscuro
  const tinta = oscuro ? '#1F1F1F' : '#FFFFFF'
  // Velo para las etiquetas y el botón: sobre amarillo, una sombra; sobre colores oscuros, una luz.
  const velo = oscuro ? 'rgba(31,31,31,0.10)' : 'rgba(255,255,255,0.16)'
  const nombre = banco?.nombre ?? cuenta.banco ?? 'Cuenta bancaria'
  const tipo = tipoLegible(cuenta.tipo)
  const numero = cuenta.numero ? agruparNumeroCuenta(cuenta.numero, banco) : null
  const icono = banco?.icono ? `/bancos/${banco.icono}.png` : null

  async function copiar() {
    if (!cuenta.numero) return
    try {
      await navigator.clipboard.writeText(cuenta.numero.replace(/[\s-]/g, ''))
      setCopiado('ok')
    } catch {
      setCopiado('error')
    }
    setTimeout(() => setCopiado(null), 2500)
  }

  return (
    <div
      className="relative isolate flex flex-col gap-3 overflow-hidden rounded-2xl p-4"
      style={{ backgroundColor: color, color: tinta }}
    >
      {/* La marca de agua: el icono del banco en grande, girado y casi transparente. */}
      {icono ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icono}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -bottom-10 -z-10 h-32 w-32 -rotate-[14deg] rounded-[30px] opacity-[0.14]"
        />
      ) : (
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-8 -z-10 h-28 w-28 -rotate-[14deg] rounded-[30px] opacity-[0.10]" style={{ backgroundColor: tinta }} />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icono ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icono} alt="" className="h-9 w-9 shrink-0 rounded-[10px] ring-2 ring-white/60" width={36} height={36} />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ring-2 ring-white/40" style={{ backgroundColor: velo }}>
              <Icono glifo={Iconos.dominio.cuentaBancaria} tamano="md" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{nombre}</p>
            {banco && <p className="mt-0.5 truncate text-[11px] leading-snug">{banco.entidad}</p>}
          </div>
        </div>
        {tipo && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: velo }}
            aria-label={`Cuenta de ${tipo.toLowerCase()}`}
          >
            {tipo}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 font-mono text-lg leading-tight tracking-[0.08em] tabular-nums break-all">
          <span className="sr-only">{banco?.billetera ? 'Número (tu celular): ' : 'Número de cuenta: '}</span>
          {numero ?? 'Sin número registrado'}
        </p>
        {cuenta.numero && (
          <button
            type="button"
            onClick={copiar}
            aria-label={copiado === 'ok' ? 'Número copiado' : 'Copiar número de cuenta'}
            title={copiado === 'ok' ? 'Copiado' : copiado === 'error' ? 'No se pudo copiar' : 'Copiar número'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            style={{ backgroundColor: velo }}
          >
            <Icono glifo={copiado === 'ok' ? Iconos.estado.ok : Iconos.accion.copiar} tamano="sm" />
          </button>
        )}
      </div>
      <p className="truncate text-xs" aria-live="polite">
        {copiado === 'ok' ? 'Número copiado' : copiado === 'error' ? 'No se pudo copiar el número' : titular}
      </p>
    </div>
  )
}
