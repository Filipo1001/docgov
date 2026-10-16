'use client'
// TEMPORAL — prueba del panel de revisión de la planilla (supervisor / asesor / administrador). NO se mezcla a main.
import { useEffect, useState } from 'react'
import PanelRevisionPlanilla from '@/components/ui/PanelRevisionPlanilla'
import Icono from '@/components/ui/Icono'
import { AYUDA_DOCUMENTO } from '@/lib/ayudas-documentos'
import { motivoBaseBloqueada, mostrarControlDeBaseEnPeriodo } from '@/lib/base-cotizacion'
import { DEFAULT_BASE_COTIZACION_SS } from '@/lib/constants'
import { explicarBasePorDefecto } from '@/lib/importe'
import { Iconos } from '@/lib/iconos'

type Rol = 'supervisor' | 'asesor' | 'admin'
type EstadoInforme = 'enviado' | 'revision' | 'aprobado'
type EstadoPlanilla = 'pendiente' | 'aprobada' | 'rechazada'
type Alerta = 'ninguna' | 'naranja' | 'roja'
type Docs = 'todos' | 'sin_soporte' | 'sin_planilla'

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO']

function Grupo<T extends string>({ titulo, valor, opciones, onCambio }: { titulo: string; valor: T; opciones: { v: T; t: string }[]; onCambio: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{titulo}</p>
      <div className="flex flex-wrap gap-1">
        {opciones.map((o) => (
          <button key={o.v} onClick={() => onCambio(o.v)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${valor === o.v ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{o.t}</button>
        ))}
      </div>
    </div>
  )
}

/** La tarjeta con el MISMO contenedor desplegable que la página real (overflow-hidden mientras anima). */
function Tarjeta(p: { rol: Rol; informe: EstadoInforme; planilla: EstadoPlanilla; alerta: Alerta; docs: Docs; mesDistinto: boolean; ibcPersonalizado: boolean; mensualAlto: boolean }) {
  const [abierta, setAbierta] = useState(true)
  const [libre, setLibre] = useState(true)
  useEffect(() => {
    setLibre(false)
    if (!abierta) return
    const t = setTimeout(() => setLibre(true), 220)
    return () => clearTimeout(t)
  }, [abierta])

  const MES_INFORME = 'ABRIL'
  // El valor por defecto sale del valor mensual del periodo: con 4 millones el 40 % queda bajo el piso; con 6, lo supera.
  const EXPL = explicarBasePorDefecto(p.mensualAlto ? 6_000_000 : 4_000_000)
  const [mes, setMes] = useState(p.mesDistinto ? 'MARZO' : MES_INFORME)
  const [confirmado, setConfirmado] = useState(false)
  const [base, setBase] = useState<number | null>(p.ibcPersonalizado ? 2_100_000 : null)
  const [estado, setEstado] = useState<EstadoPlanilla>(p.planilla)
  const [motivo, setMotivo] = useState<string | null>(p.planilla === 'rechazada' ? 'No coincide el IBC con el valor del contrato.' : null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setMes(p.mesDistinto ? 'MARZO' : MES_INFORME); setConfirmado(false) }, [p.mesDistinto])
  useEffect(() => { setBase(p.ibcPersonalizado ? 2_100_000 : null) }, [p.ibcPersonalizado])
  useEffect(() => { setEstado(p.planilla); setMotivo(p.planilla === 'rechazada' ? 'No coincide el IBC con el valor del contrato.' : null) }, [p.planilla])

  const SUPERVISOR = 'u-sup'
  const ctx = { rol: p.rol, usuarioId: p.rol === 'supervisor' ? SUPERVISOR : 'u-otro', supervisorId: SUPERVISOR, estado: p.informe, esHistorico: false }
  const puedeCambiarBase = mostrarControlDeBaseEnPeriodo(ctx)
  const simular = (f: () => void) => { setOcupado(true); setTimeout(() => { f(); setOcupado(false) }, 600) }

  const hayPlanilla = p.docs !== 'sin_planilla'
  // Igual que la aplicación real: la alerta de «mes vencido» solo existe mientras el mes de la planilla ≠ el del informe.
  const alerta = p.alerta === 'roja'
    ? { nivel: 'roja' as const, titulo: 'Posible cotización faltante', mensaje: 'La planilla N.° 6016087440 se está usando en 3 periodos de este contrato. El "mes vencido" solo cubre un desfase de un mes; reutilizarla más veces sugiere que un mes de cotización quedó sin pagar. Verifica que no falte la planilla de un mes intermedio antes de aprobar.' }
    : p.alerta === 'naranja' && mes !== MES_INFORME
      ? { nivel: 'naranja' as const, titulo: 'Pago por mes vencido', mensaje: `Esta planilla cotiza ${mes}, distinto al mes del informe (${MES_INFORME}). Corresponde a un pago de seguridad social por mes vencido, lo cual es válido. Verifica que sea correcto.` }
      : null

  const color = estado === 'aprobada' ? 'border-green-200 bg-green-50' : estado === 'rechazada' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'
  return (
    <div className="relative">
      <button onClick={() => setAbierta(v => !v)} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${color}`}>
        <Icono glifo={Iconos.dominio.seguridadSocial} tamano="md" className="text-gray-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">Planilla de Seguridad Social</p>
          <p className="text-xs text-gray-500">{estado === 'aprobada' ? 'Aprobada' : estado === 'rechazada' ? 'Rechazada — requiere corrección' : 'Cargada · Pendiente revisión'}</p>
        </div>
        <Icono glifo={Iconos.accion.desplegar} tamano="sm" className={`text-gray-400 transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </button>
      <div className={`transition-all duration-200 ease-in-out ${abierta ? 'max-h-[900px] opacity-100' : 'max-h-0 opacity-0'} ${abierta && libre ? 'overflow-visible' : 'overflow-hidden'}`}>
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <PanelRevisionPlanilla
            planilla={{ icono: Iconos.documentos.planilla, etiqueta: 'Planilla', ayuda: AYUDA_DOCUMENTO.planilla, url: hayPlanilla ? '#' : null }}
            soporte={{ icono: Iconos.documentos.soportePago, etiqueta: 'Soporte de pago', ayuda: AYUDA_DOCUMENTO.soportePago, url: p.docs === 'sin_soporte' ? null : '#' }}
            numero={{ ayuda: AYUDA_DOCUMENTO.numeroPlanilla, valor: hayPlanilla ? '6016087440' : null }}
            mes={{
              ayuda: 'El mes que cubre la planilla. El sistema sugiere el del informe; confírmalo o cámbialo si la planilla es de otro.',
              valor: mes, confirmado, opciones: MESES, mesDelInforme: MES_INFORME, anio: 2026, puedeCambiar: true, guardando: ocupado,
              onCambiar: (m) => simular(() => { setMes(m); setConfirmado(true) }),
            }}
            base={{
              ayuda: 'La base sobre la que se cotiza (IBC). La calcula el acta con el valor del contrato; si la planilla trae otra, se corrige aquí.',
              valor: base ?? EXPL.valor, porDefecto: EXPL.valor, explicacion: EXPL.texto, piso: DEFAULT_BASE_COTIZACION_SS, personalizada: base != null,
              puedeCambiar: puedeCambiarBase, motivoBloqueo: motivoBaseBloqueada(ctx), guardando: ocupado,
              onGuardar: (v) => simular(() => setBase(v)), onRestablecer: () => simular(() => setBase(null)),
            }}
            alerta={alerta}
            decision={{
              estado, motivoAnterior: motivo, puedeDecidir: hayPlanilla, decidiendo: ocupado,
              onAprobar: () => simular(() => { setEstado('aprobada'); setMotivo(null) }),
              onDevolver: (m) => simular(() => { setEstado('rechazada'); setMotivo(m) }),
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default function Prueba() {
  const [rol, setRol] = useState<Rol>('supervisor')
  const [informe, setInforme] = useState<EstadoInforme>('revision')
  const [planilla, setPlanilla] = useState<EstadoPlanilla>('pendiente')
  const [alerta, setAlerta] = useState<Alerta>('naranja')
  const [docs, setDocs] = useState<Docs>('todos')
  const [mesDistinto, setMesDistinto] = useState(true)
  const [ibc, setIbc] = useState(false)
  const [mensualAlto, setMensualAlto] = useState(false)
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">Planilla de Seguridad Social — vista del revisor</h1>
      <p className="mb-4 text-sm text-gray-500">Prueba cada caso con los controles de arriba. Todo es interactivo: abre los documentos, cambia el mes y la base, devuelve o aprueba.</p>
      <div className="sticky top-0 z-40 mb-6 grid gap-3 rounded-xl border bg-white/95 p-3 shadow-sm backdrop-blur sm:grid-cols-3">
        <Grupo titulo="Quién mira" valor={rol} onCambio={setRol} opciones={[{ v: 'supervisor', t: 'Supervisor del contrato' }, { v: 'asesor', t: 'Asesor' }, { v: 'admin', t: 'Administrador' }]} />
        <Grupo titulo="Estado del informe" valor={informe} onCambio={setInforme} opciones={[{ v: 'enviado', t: 'Enviado' }, { v: 'revision', t: 'En revisión' }, { v: 'aprobado', t: 'Aprobado' }]} />
        <Grupo titulo="Estado de la planilla" valor={planilla} onCambio={setPlanilla} opciones={[{ v: 'pendiente', t: 'Pendiente' }, { v: 'aprobada', t: 'Aprobada' }, { v: 'rechazada', t: 'Devuelta' }]} />
        <Grupo titulo="Alerta" valor={alerta} onCambio={setAlerta} opciones={[{ v: 'ninguna', t: 'Ninguna' }, { v: 'naranja', t: 'Mes vencido' }, { v: 'roja', t: 'Cotización faltante' }]} />
        <Grupo titulo="Documentos" valor={docs} onCambio={setDocs} opciones={[{ v: 'todos', t: 'Completos' }, { v: 'sin_soporte', t: 'Sin soporte' }, { v: 'sin_planilla', t: 'Sin planilla' }]} />
        <div className="flex flex-col gap-1.5 text-xs font-medium text-gray-700">
          <label className="flex items-center gap-2"><input type="checkbox" checked={mesDistinto} onChange={(e) => setMesDistinto(e.target.checked)} /> El mes de la planilla ≠ mes del informe</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={ibc} onChange={(e) => setIbc(e.target.checked)} /> Base ya personalizada</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={mensualAlto} onChange={(e) => setMensualAlto(e.target.checked)} /> Valor mensual alto (el 40 % supera el piso)</label>
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1" style={{ minWidth: 340 }}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Escritorio</p>
          <Tarjeta key={`d-${rol}-${informe}`} rol={rol} informe={informe} planilla={planilla} alerta={alerta} docs={docs} mesDistinto={mesDistinto} ibcPersonalizado={ibc} mensualAlto={mensualAlto} />
        </div>
        <div style={{ width: 340 }}>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Teléfono</p>
          <Tarjeta key={`t-${rol}-${informe}`} rol={rol} informe={informe} planilla={planilla} alerta={alerta} docs={docs} mesDistinto={mesDistinto} ibcPersonalizado={ibc} mensualAlto={mensualAlto} />
        </div>
      </div>
    </div>
  )
}
