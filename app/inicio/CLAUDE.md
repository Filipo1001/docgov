# Sitio comercial — `contratistadigital.com`

Esta carpeta es el sitio de negocio, no una sección de la aplicación. Se sirve en
la raíz del dominio: el middleware **reescribe** `/` a `/inicio`, así que el
visitante ve el dominio limpio en la barra.

Su trabajo es uno: **que una alcaldía nos escriba.** Todo lo demás —diseño,
animaciones, contenido— se justifica por eso o sobra.

## A quién le habla

Un secretario de despacho o un jefe de contratación de un municipio pequeño o
mediano. No es técnico. Le importan tres cosas, en este orden:

1. **El riesgo.** Un expediente incompleto es un hallazgo, y lo asume la
   administración, no el contratista.
2. **El desgaste mensual.** Perseguir soportes, rehacer documentos devueltos.
3. **El precio**, cuando ya le interesa.

Escribe con sus palabras —cuenta de cobro, informe de actividades, supervisión,
SECOP II— no con jerga de producto.

## Reglas de contenido

**Nada que el producto no haga.** Toda afirmación sale de `PRODUCTO.md`. Ya
estuvimos a punto de publicar dos cosas que no se sostenían: la certificación ISO
(la tiene la infraestructura, no el producto) y funciones aún no construidas.

**Sin mencionar Fredonia.** Decisión comercial explícita: es el único cliente y
anunciarlo resta fuerza frente a otras alcaldías. El aviso de acceso a la
plataforma está redactado para que sirva a cualquier municipio.

**Sin nombrar la firma ni el papel.** También decisión explícita.

**El aviso de acceso va primero.** Buena parte del tráfico del dominio son
contratistas buscando dónde entrar, no alcaldías evaluando. Cuando ese tráfico
baje, puede pasar a ser una línea en la cabecera.

## SEO — lo que ya está resuelto

No rehacer sin leer primero:

- Metadatos, Open Graph y canónica en la propia página; lo compartido en `lib/seo.ts`
- Datos estructurados: `Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`
- `app/robots.ts` y `app/sitemap.ts` — el ápice los sirve con 200, no redirigidos
- Las preguntas frecuentes alimentan a la vez la página y el JSON-LD: **una sola
  lista**, para que no puedan contradecirse
- Iconos cuadrados en `public/marca/` — Google recorta los favicon que no lo son

Términos que trabajamos: software de contratación pública, cuentas de cobro,
informes de actividades, supervisión contractual, gestión documental contractual,
SECOP II.

## Antes de añadir una sección

Pregunta qué paso del embudo mejora:

```
visitas → clic en "Solicitar demostración" → conversación → demostración
→ propuesta → contrato
```

Si no mejora ninguno, no va. Una sección más bonita que no mueve el embudo es
trabajo que parece progreso.

## Cuidado al tocar el enrutamiento

Las rutas que el ápice sirve por sí mismo están en `RUTAS_COMERCIALES`
(`lib/dominio.ts`). La lista es corta a propósito: todo lo que no esté ahí
redirige a la aplicación — **incluido `/verificar/*`, que debe seguir
redirigiendo para siempre** por los QR ya impresos.
