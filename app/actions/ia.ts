'use server'

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * Sugiere una mejora de gramática, ortografía y redacción para la
 * descripción de una actividad escrita por un contratista.
 *
 * Devuelve SOLO el texto mejorado, sin explicaciones ni comentarios.
 */
export async function mejorarDescripcion(
  descripcion: string
): Promise<{ texto?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'Función de IA no configurada. Contacta al administrador.' }
  }

  const texto = descripcion.trim()
  if (!texto) return { error: 'El texto está vacío.' }
  if (texto.length > 2000) return { error: 'El texto es demasiado largo (máx. 2 000 caracteres).' }

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Eres un asistente de redacción para documentos oficiales de contratación pública en Colombia.

Mejora el siguiente texto corrigiendo ortografía, gramática y redacción.
Mantén el mismo significado y nivel de detalle.
Usa lenguaje formal y profesional propio de informes de gestión.
Devuelve ÚNICAMENTE el texto corregido, sin explicaciones, sin comillas, sin preámbulo.

Texto a mejorar:
${texto}`,
        },
      ],
    })

    const resultado = message.content[0]
    if (resultado.type !== 'text') return { error: 'Respuesta inesperada del modelo.' }

    return { texto: resultado.text.trim() }
  } catch (err: unknown) {
    console.error('[mejorarDescripcion]', err)
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return { error: `Error al contactar la IA: ${msg}` }
  }
}
