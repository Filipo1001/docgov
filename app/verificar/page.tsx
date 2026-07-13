/**
 * app/verificar/page.tsx — Landing de verificación: búsqueda manual por código.
 *
 * El pie de cada PDF invita a "visitar contratistadigital.com/verificar" para
 * quien no pueda escanear el QR. Esta página es ese destino: permite escribir
 * el código a mano y llegar al mismo resultado que el escaneo.
 */

'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function VerificarLandingPage() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const limpio = codigo.trim().toUpperCase()
    if (!limpio) return
    router.push(`/verificar/${encodeURIComponent(limpio)}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, background: '#0f172a', borderRadius: 12, marginBottom: 8 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>CD</span>
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Contratista Digital</h1>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Verificación de documentos</p>
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
          <label htmlFor="codigo" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
            Código de verificación
          </label>
          <input
            id="codigo"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            placeholder="CD-XXXX-XXXX"
            autoFocus
            autoCapitalize="characters"
            autoComplete="off"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 15,
              letterSpacing: 1, fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase',
              border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12, color: '#0f172a',
            }}
          />
          <button
            type="submit"
            disabled={!codigo.trim()}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14, fontWeight: 600, color: '#fff',
              background: codigo.trim() ? '#0f172a' : '#94a3b8', border: 'none', borderRadius: 8,
              cursor: codigo.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Verificar documento
          </button>
          <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginTop: 12, marginBottom: 0 }}>
            Escriba el código impreso en el pie del documento (formato CD-XXXX-XXXX) o escanee el código QR directamente.
          </p>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#cbd5e1', marginTop: 20 }}>
          Contratista Digital — Alcaldía Municipal de Fredonia, Antioquia
        </p>
      </div>
    </div>
  )
}
