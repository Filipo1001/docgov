# Contratista Digital

SaaS de gestión documental contractual para alcaldías. Automatiza el ciclo mensual
de los contratos de prestación de servicios: el contratista reporta actividades y
evidencias, el supervisor aprueba, y el sistema genera informe de actividades,
cuenta de cobro, acta de supervisión y acta de pago — numerados, con anexos y
verificables por QR.

En producción en la Alcaldía de Fredonia (Antioquia) desde julio de 2026.

**`PRODUCTO.md` es la fuente de verdad sobre qué hace el sistema, qué no hace y
cuánto cuesta.** Cualquier afirmación comercial sale de ahí, no de la memoria.

## Un repositorio, dos sitios

El `middleware.ts` enruta por host sobre un único despliegue:

| Host | Sirve |
|---|---|
| `contratistadigital.com` (+ `www` → 301) | Sitio comercial: la raíz se reescribe a `app/inicio/` |
| `app.contratistadigital.com` | La aplicación |

Comparten `layout.tsx`, `lib/marca.ts`, `lib/seo.ts`, `lib/dominio.ts`,
`components/Logo.tsx` y los iconos. **No son proyectos separables.**

## Reglas que no se negocian

**1. `contratistadigital.com/verificar/*` no puede dejar de responder. Nunca.**
Hay 240+ documentos emitidos cuyo QR lleva esa URL grabada en el mapa de bits, ya
radicados en SECOP II y en manos de terceros. Si el ápice deja de servir este
proyecto, quien lo sustituya debe reimplementar esa redirección. Ver `lib/dominio.ts`.

**2. `usuarios` tiene permisos POR COLUMNA.** Una columna nueva nace sin permiso y
rompe cualquier consulta que la pida con sesión de usuario — ya tumbó la vista de
contratos en producción. Antes de añadir una columna a cualquier tabla:

```sql
select count(*) filter (where attacl is not null) from pg_attribute
where attrelid = 'public.TABLA'::regclass and attnum > 0 and not attisdropped;
```

Si devuelve > 0, la migración necesita su `GRANT SELECT (columna)`.

La escritura sigue la lógica contraria. Desde la migración 062 una sesión de usuario solo puede actualizar
`usuarios.telefono`. Si una función nueva deja al usuario editar otra columna de su perfil, necesita su
`GRANT UPDATE (columna)`; `rol`, `activo`, `dependencia_id`, `municipio_id`, `cedula` y `email` no se conceden
nunca (el disparador `usuarios_proteger_columnas` los rechaza aunque alguien lo haga por error). Vigilancia de
solo lectura: `supabase/tests/usuarios_permisos_de_columna.sql` debe dar 0 fallas.

`periodos` sigue la misma lógica desde la migración 065: una sesión de usuario solo actualiza `estado`, `fecha_envio`,
`motivo_rechazo`, `fecha_aprobacion`, `planilla_estado` y `planilla_comentario`, y el disparador `periodos_proteger_cambios`
decide qué transiciones vale cada rol (`periodos_transicion_permitida`: una línea por transición). Radicar, valores, planilla,
factura, histórico y devoluciones del administrador van por `createAdminSupabaseClient`. Una función nueva que escriba otra
columna con la sesión necesita su `GRANT UPDATE (columna)`, nunca el de `valor_cobro`, `numero_radicado` ni las URLs; una
transición nueva necesita su línea en la función. Vigilancia de solo lectura: `supabase/tests/periodos_permisos_y_transiciones.sql`
debe dar 0 fallas.

**3. Un documento ya emitido no se reescribe.** Los códigos de verificación son
estables e idempotentes; los cambios de datos no reescriben lo ya radicado. Los
estados cacheables (`enviado`, `revision`, `aprobado`, `radicado`) y los editables
(`borrador`, `rechazado`) son disjuntos a propósito.

**4. `/verificar/*` no se indexa.** Muestra nombre, dependencia, valor y supervisor
de personas reales. Pública no es lo mismo que indexable — ver `app/robots.ts` y la
cabecera en `middleware.ts`.

**5. No tocar el DNS.** Ahí viven el SPF y el DKIM de Resend (envío de correo) y la
verificación de Search Console. El dominio **no tiene MX**: no puede recibir correo.

**6. «Contrato activo» se decide con `fecha_fin_efectiva`, nunca con `fecha_fin`.** Desde la migración 081 un
contrato puede terminar antes de su fecha pactada. `fecha_fin` sigue siendo la pactada (documentos, otrosíes, plazo);
`fecha_fin_efectiva` es una columna calculada (la pactada o el último día de ejecución) y es la que dice si está
vigente (`lib/vigencia-contrato.ts`). Los periodos posteriores a una terminación quedan `anulado`, y un periodo anulado
no es un informe presentado (`informePresentado` en `lib/constants.ts`). La terminación se registra y se deshace solo
con `terminar_contrato` / `revertir_terminacion`. Vigilancia: `tests/cd/terminacion-contrato.test.ts` falla si una
consulta vuelve a filtrar contratos activos por `fecha_fin`; `supabase/tests/terminacion_anticipada.sql` debe dar 0 fallas.

## Estructura

```
app/inicio/       Sitio comercial          → ver app/inicio/CLAUDE.md
app/dashboard/    Aplicación por rol
app/actions/      Server actions ('use server': solo exporta funciones async)
app/verificar/    Verificación pública por código
lib/pdf/          Generación de PDF (@react-pdf/renderer)
lib/dominio.ts    Hosts, rutas y enrutamiento
lib/seo.ts        Metadatos y datos estructurados
lib/marca.ts      Tinta #192031 y clases de marca
supabase/migrations/
```

Roles: `admin`, `supervisor` (secretarías), `contratista`, `asesor`, `contratacion`.

## Trabajo

```bash
npx tsc --noEmit     # typecheck
npm run build        # build
```

- Supabase: proyecto `vuisqgjfwhabmyszidmn`. Migraciones numeradas en `supabase/migrations/`.
- Despliegue: push a `main` → Vercel. Las ramas generan preview.
- El servidor de desarrollo se levanta con las herramientas de preview, no con Bash.
- Comentarios y mensajes de commit en español; el código existente mezcla, no lo unifiques.

## Antes de dar por bueno un cambio

Verifica contra producción, no contra la suposición. Si tocaste enrutamiento,
comprueba que un código real de `/verificar` sigue devolviendo "Documento auténtico".

`AUDITORIA.md` es una auditoría de junio de 2026: útil como contexto histórico,
desactualizada en los detalles.
