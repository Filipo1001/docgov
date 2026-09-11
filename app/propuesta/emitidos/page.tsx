import type { Metadata } from 'next'
import { MARCA } from '@/lib/marca'
import { enlaceWhatsApp } from '@/lib/dominio'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import Contador from './Contador'

/**
 * A dónde lleva el código QR del folleto.
 *
 * LA RAZÓN DE QUE ESTA PÁGINA EXISTA. El folleto necesitaba un código
 * escaneable de verdad —un dibujo decorativo se nota y desarma el argumento—
 * pero apuntarlo a un documento real habría publicado en una página abierta
 * el nombre, la dependencia, el valor y el supervisor de un contratista de
 * carne y hueso. Un contador no expone a nadie: es un entero.
 *
 * Y demuestra lo mismo, o más. Quien escanea en una reunión no comprueba UN
 * documento: ve cuántos lleva emitidos el sistema, ahora, y que la cifra se
 * mueve sola. Es más difícil de fingir que un papel.
 *
 * SIN CACHÉ. Una cifra «en tiempo real» servida desde caché sería justo lo
 * contrario de lo que promete, y quien la escanea en una demostración va a
 * recargar para ver si de verdad cambia.
 *
 * NO SE INDEXA. No por los datos —no hay— sino porque es el reverso de un
 * folleto que todavía es preview, y una cifra suelta en un buscador, sin lo
 * que la rodea, no significa nada.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Documentos emitidos · Contratista Digital',
  description: 'Cuántos documentos verificables lleva emitidos la plataforma, en este momento.',
  robots: { index: false, follow: false },
}

async function contar(): Promise<number | null> {
  const admin = createAdminSupabaseClient()
  const { count, error } = await admin
    .from('documentos_emitidos')
    .select('*', { count: 'exact', head: true })
  return error ? null : count ?? 0
}

export default async function EmitidosPage() {
  const emitidos = await contar()

  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: MARCA }}>
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-lg w-full text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#10b981' }}>
            En este momento
          </p>

          {emitidos === null ? (
            /* Si la consulta falla, se dice. Un cero sería mentira y un
               esqueleto de carga eterno, peor: quien escaneó está esperando. */
            <p className="mt-6 text-2xl font-semibold text-white">
              No pudimos consultar la cifra ahora mismo.
            </p>
          ) : (
            <>
              <div className="mt-6">
                <Contador inicial={emitidos} />
              </div>
              <p className="mt-4 text-lg" style={{ color: 'rgba(255,255,255,.72)' }}>
                documentos emitidos con verificación por código QR
              </p>
            </>
          )}

          <div className="mt-10 pt-8 text-left" style={{ borderTop: '1px solid rgba(255,255,255,.12)' }}>
            <p className="leading-relaxed" style={{ color: 'rgba(255,255,255,.62)' }}>
              Cada uno de esos documentos —informes de actividades, cuentas de
              cobro, actas de supervisión, de pago y de terminación— salió con un
              código único impreso dentro del PDF. Quien lo reciba confirma que
              es auténtico y que nadie lo cambió después, sin cuenta y sin pedirle
              permiso a nadie.
            </p>
            <p className="mt-4 leading-relaxed" style={{ color: 'rgba(255,255,255,.62)' }}>
              Esta cifra se actualiza sola. Si la deja abierta y la plataforma
              emite un documento, la verá subir.
            </p>
          </div>

          <a
            href={enlaceWhatsApp('Buen día. Escaneé el código del folleto y quisiera conocer Contratista Digital para mi alcaldía.')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex items-center gap-3 rounded-full px-7 py-3.5 font-semibold transition-transform hover:scale-[1.03]"
            style={{ backgroundColor: '#10b981', color: '#06281F' }}
          >
            Hablar con un asesor
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </main>
  )
}
