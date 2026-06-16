# Auditoría Integral — Contratista Digital (docgov)

> Auditoría de **solo lectura** realizada el **10 de junio de 2026**.
> No se modificó ningún archivo, tabla, política, variable de entorno ni configuración (salvo este informe).
> Cada hallazgo está respaldado por evidencia concreta (archivo:línea, tabla, política o herramienta MCP).
> Esta pasada **revisa al alza** la severidad de los hallazgos de almacenamiento y exposición de datos respecto de la auditoría del 9 de junio: los 4 buckets son `public=true` (no solo "listables"), y la caché pública de PDF anula la autorización del backend.

---

## Fase 1 — Reconocimiento

**Qué hace el proyecto (descripción funcional, no técnica).** "Contratista Digital" (contratistadigital.com) es la plataforma de **gestión documental de la contratación pública de la Alcaldía Municipal de Fredonia (Antioquia)** — actualmente un piloto. Digitaliza el trámite mensual de cuenta de cobro de los contratistas de prestación de servicios:

- Cada mes, el **contratista** registra las actividades que ejecutó (asociadas a las obligaciones de su contrato), adjunta **fotos de evidencia** y sube su **planilla de seguridad social (PILA)**.
- Al enviar el informe, este recorre un **flujo de aprobación**: el **asesor** de la dependencia lo revisa (aprueba o devuelve con motivo), la **secretaria/supervisor** da la aprobación final, y finalmente se marca como **radicado** (archivado, con número de radicado).
- Al aprobarse, el sistema **genera automáticamente los PDF oficiales** (Cuenta de Cobro, Informe de Actividades, Acta de Supervisión, Acta de Pago) con los datos del contrato, valores en letras, firmas y encabezados oficiales, y permite descargarlos individualmente o en paquete ZIP.
- El **administrador** gestiona usuarios, contratos, importación masiva desde Excel (SECOP), datos históricos y datos del municipio. Hay **notificaciones** in-app y por correo/WhatsApp, y un asistente de **IA** que mejora la redacción de las actividades.

El objetivo de negocio es reemplazar el trámite en papel y acelerar el pago a los contratistas.

**Stack y arquitectura.**
- **Frontend/Backend:** Next.js **16.1.7** (App Router), React **19.2.3**, TypeScript (`strict`), Tailwind v4. Desplegado en **Vercel** (`contratistadigital.com`); último deployment de producción `READY`, Node 24.x.
- **Datos/Auth/Storage:** **Supabase** (Postgres 17.6, RLS, Auth, 4 buckets de Storage), región us-west-2.
- **Capas:** `app/actions/` (Server Actions), `services/` (acceso a datos vía cliente del navegador), `lib/` (utilidades, PDF, clientes Supabase, notificaciones), `app/api/` (rutas API para PDFs/ZIPs), `components/`.
- **Datos en producción:** 124 usuarios, 114 contratos, 304 periodos, 16 tablas (todas con RLS), 19 archivos de migración versionados.
- **Integraciones:** Resend (correo), Twilio (WhatsApp/SMS), Anthropic SDK (IA).
- **Patrones notables:** guardas de autorización server-side (`requireRole`, `requireContractAccess`, `requireAdmin`, `verificarAccesoPeriodo`), caché de PDF en Storage, `service_role` para operaciones privilegiadas, presigned uploads, optimistic locking, inmutabilidad de históricos por trigger.

---

## Resumen ejecutivo

El proyecto está **funcionalmente maduro y bien estructurado por capas**: RLS habilitado en las 16 tablas, guardias de autorización en servidor antes de generar documentos, validación fail-fast de variables de entorno, índices correctos en todas las columnas consultadas, y atención visible a rendimiento (caché de PDF, batching que elimina N+1, presigned uploads) y concurrencia (optimistic locking). No hay secretos hardcodeados ni `service_role` filtrado al cliente, ni vectores XSS por `dangerouslySetInnerHTML`, ni inyección SQL.

Sin embargo, **la capa de almacenamiento y la exposición de datos personales tienen fallos críticos reales**, no solo deuda. Los **cuatro buckets de Storage son públicos** (`public=true`), lo que deja planillas de seguridad social, cuentas de cobro con datos bancarios, cédulas, firmas y evidencias **descargables por cualquiera con la URL y enumerables por listado**, anulando los cuidadosos controles del backend. Además, **cualquier usuario autenticado puede leer toda la tabla `usuarios`** (con datos bancarios y cédulas), y las políticas RLS de "revisores" son más amplias que la lógica de la app. Para un sistema gubernamental con PII y datos financieros, esto es lo primero que debe cerrarse.

### Los 5 problemas más importantes

1. 🔴 **Buckets de Storage 100% públicos** — `documentos`, `evidencias`, `pdf-cache` y `avatars` con `public=true`; planillas SS, datos bancarios, cédulas, firmas y evidencias accesibles por URL sin sesión, y listables.
2. 🔴 **La caché pública de PDF anula la autorización** — la ruta `/api/pdf/...` verifica permisos pero luego redirige a un PDF en el bucket público `pdf-cache` con ruta predecible (`{tipo}/{periodoId}.pdf`).
3. 🔴 **Exposición de PII de todos los usuarios** — política `usuarios_authenticated_read` con `USING (true)`: cualquier sesión lee cédula, email, teléfono, banco y número de cuenta de los 124 usuarios.
4. 🔴 **Dependencia `xlsx@0.18.5` con vulnerabilidades High sin parche** (Prototype Pollution + ReDoS) — `npm audit` reporta 13 vulnerabilidades (5 high, 8 moderate).
5. 🟠 **RLS de revisores demasiado amplio** — un `asesor` puede leer *todos* los contratos/periodos/actividades/evidencias del municipio vía consulta directa, ignorando el filtro por dependencia que sí aplica la app.

---

## Hallazgos por severidad

### 🔴 CRÍTICO

#### C-1. Los 4 buckets de Storage son públicos (datos personales y financieros expuestos)
- **Evidencia:** `select public from storage.buckets` → `avatars`, `documentos`, `evidencias`, `pdf-cache` todos con `public = true`. `get_advisors(security)` → `public_bucket_allows_listing` para los 4 (políticas SELECT amplias: `read_documentos`, `pdf_cache_public_read`, `Todos pueden ver evidencias`, `avatars_public_read`, todas con rol `public`/`{public}`).
- **Por qué importa:** El bucket `documentos` contiene **planillas de seguridad social** (datos de salud, ingresos, identificación) y **firmas**; `pdf-cache` contiene cuentas de cobro y actas con **número de cuenta bancaria, banco y cédula**; `evidencias` contiene fotos de los contratistas. Al ser `public=true` y con listado habilitado, cualquier persona en Internet (sin sesión) puede **enumerar y descargar** estos archivos. Es una fuga directa de PII y datos financieros de terceros — especialmente grave en un sistema gubernamental.
- **Recomendación:** Volver los buckets **privados** (`public=false`) y servir los archivos mediante **signed URLs de corta duración** generadas en servidor tras verificar permisos (el código ya usa `getPublicUrl`; migrar a `createSignedUrl`). Reemplazar las políticas SELECT amplias por políticas que validen propiedad/rol.
- **Esfuerzo:** L (toca subida, descarga, generación de PDF y políticas de Storage)

#### C-2. La caché pública de PDF elude `verificarAccesoPeriodo`
- **Evidencia:** `lib/pdf/cache.ts:43` → `const cacheKey = \`${tipo}/${periodoId}.pdf\``; `lib/pdf/cache.ts:67-75` redirige (302) a `getPublicUrl(cacheKey)`. La ruta `app/api/pdf/[periodoId]/cuenta-cobro/route.ts:20` sí llama `verificarAccesoPeriodo` (`lib/pdf/auth.ts`), pero el archivo final vive en el bucket público.
- **Por qué importa:** La autorización del backend queda anulada: basta el `periodoId` (UUID) para construir la URL pública y bajar la cuenta de cobro con datos bancarios, sin pasar por la ruta. El listado público del bucket (C-1) facilita descubrir los `periodoId`. `getOrGeneratePDFBuffer` (`lib/pdf/cache.ts:128-137`) hace además `fetch(publicUrl)`, dependiendo de que el bucket sea público.
- **Recomendación:** Bucket `pdf-cache` privado; servir el PDF cacheado desde la ruta autenticada (descargar el buffer con `supabase.storage.download()` usando el cliente admin y responder con `Content-Type: application/pdf`, o emitir signed URL de segundos de validez).
- **Esfuerzo:** M

#### C-3. Cualquier usuario autenticado lee toda la tabla `usuarios`
- **Evidencia:** Política `usuarios_authenticated_read` → `qual: (auth.role() = 'authenticated')` para `SELECT`, **sin filtro por fila**. La tabla `usuarios` (124 filas) incluye `cedula`, `email`, `telefono`, `banco`, `tipo_cuenta`, `numero_cuenta`, `direccion` (`lib/types.ts:23-39`).
- **Por qué importa:** Un `contratista`, vía el cliente Supabase del navegador (token anon), puede consultar **los datos bancarios y cédulas de todos los demás usuarios**. Exposición horizontal de PII y datos financieros.
- **Recomendación:** Restringir la política a la propia fila + una vista reducida (solo nombre/rol/dependencia) para los joins de UI. Mover la lectura de campos sensibles a consultas server-side con autorización explícita.
- **Esfuerzo:** M (hay UI que asume poder leer otros usuarios)

#### C-4. Dependencia `xlsx` con vulnerabilidades High sin solución disponible
- **Evidencia:** `package.json` → `"xlsx": "^0.18.5"`. `npm audit --omit=dev`: *"xlsx * Severity: high — Prototype Pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9). **No fix available**"*. Total: **13 vulnerabilidades (8 moderate, 5 high)** (verificado en esta pasada).
- **Por qué importa:** `xlsx` se usa para importar contratistas desde Excel (`app/actions/importar.ts`). Prototype Pollution puede manipular el comportamiento de la app al procesar un archivo malicioso; ReDoS puede colgar el servidor. Solo el admin sube estos archivos, lo que reduce (no elimina) la superficie.
- **Recomendación:** Migrar al build oficial parcheado desde `https://cdn.sheetjs.com` (la versión npm está desactualizada) o reemplazar por **`exceljs`** (mantenido). Correr `npm audit fix` para el `ws` moderate que **sí tiene fix**.
- **Esfuerzo:** M

---

### 🟠 ALTO

#### A-1. Políticas RLS de "revisores" más permisivas que la app
- **Evidencia:** `contratos_reviewers_read`, `periodos_asesor_read`, `actividades_reviewers_read`, `evidencias_reviewers_read`, `obligaciones_reviewers_read` → todas con `qual` que solo verifica el **rol** (`get_user_rol() = ANY('asesor','gobierno','hacienda')`), sin filtrar por `dependencia_id`. En cambio, `lib/auth.ts:84-86` y `lib/pdf/auth.ts:79-83` sí limitan al asesor a su dependencia.
- **Por qué importa:** Un asesor, consultando directamente vía PostgREST/cliente del navegador, puede leer **todos los contratos, periodos, actividades y evidencias del municipio**, no solo los de su dependencia — privilegio horizontal mayor al previsto. (Combinado con C-3, agrava la exposición de datos.)
- **Recomendación:** Alinear las políticas con la regla por dependencia (join `usuarios.dependencia_id = contratos.dependencia_id`), como ya hace `periodos_asesor_update_v2`.
- **Esfuerzo:** M

#### A-2. No se pueden agregar/eliminar obligaciones de forma fiable (browser client + RLS)
- **Evidencia:** `app/dashboard/contratos/[id]/ContratoDetalleClient.tsx:4,91,93-94,113-114` → `const supabase = createClient()` (browser client) seguido de `.from('obligaciones').insert(...)` y `.delete()`. La RLS exige `get_user_rol() = 'admin'` (`obligaciones_admin_all`), evaluada con el JWT del browser client.
- **Por qué importa:** Es el mismo patrón ya corregido para actividades (movidas a Server Actions): si la sesión del cliente no está "caliente", RLS bloquea el insert/delete con error confuso o nulo. El admin no puede gestionar obligaciones de forma fiable. Existen `crearObligacion`/`eliminarObligacion` en `services/contratos.ts` sin usar desde una acción servidor con guard.
- **Recomendación:** Migrar agregar/eliminar obligaciones a Server Actions con `requireRole(['admin'])`, igual que actividades.
- **Esfuerzo:** S

#### A-3. Integridad histórica de documentos en riesgo ante otrosíes
- **Evidencia:** `lib/pdf/data.ts:115-119` → la construcción de cualquier PDF lee `.from('obligaciones').select('id, descripcion, es_permanente').eq('contrato_id', contrato.id)` — las obligaciones *actuales* del contrato, sin filtro temporal. La tabla `obligaciones` solo tiene `contrato_id, descripcion, orden, es_permanente` (verificado): **no hay versión/vigencia**.
- **Por qué importa:** Si un contrato cambia sus obligaciones (otrosí, frecuente en contratación pública), al **regenerar** un informe de un mes anterior (al invalidar el caché por edición, cambio de estado o `?force=1`) el documento histórico mostrará las obligaciones **nuevas**. Pérdida de fidelidad documental y trazabilidad legal.
- **Recomendación:** Versionar obligaciones con vigencia temporal (`vigente_desde`/`vigente_hasta`) y filtrar en el PDF por el mes del periodo. (`valor_cobro` y `base_cotizacion_ss` ya están versionados por periodo.)
- **Esfuerzo:** L

#### A-4. Acción de IA sin autenticación ni límite
- **Evidencia:** `app/actions/ia.ts:15-25` — `mejorarDescripcion` no llama a `getAuthContext`/`getUser`; solo valida longitud. Llama a la API de Anthropic con `ANTHROPIC_API_KEY`.
- **Por qué importa:** Las Server Actions son endpoints HTTP invocables; sin verificación de sesión, cualquiera puede invocarla repetidamente y **consumir tu cuota/costo de Anthropic** (abuso económico).
- **Recomendación:** Exigir sesión válida al inicio de la acción y aplicar rate limiting por usuario.
- **Esfuerzo:** S

#### A-5. Sin rate limiting en acciones sensibles
- **Evidencia:** `grep` de rate-limit/upstash = 0 coincidencias. Login (`app/login/page.tsx:39`), recuperación de contraseña, notificaciones masivas (`enviarRecordatoriosMasivos`) y generación de PDF no tienen límite por IP/usuario.
- **Por qué importa:** Permite fuerza bruta de credenciales y abuso de recursos costosos (PDF, correo Resend, WhatsApp Twilio).
- **Recomendación:** Rate limiting (p.ej. Upstash Ratelimit) en middleware/acciones críticas; apoyarse en los límites de Supabase Auth.
- **Esfuerzo:** M

---

### 🟡 MEDIO

#### M-1. Faltan headers de seguridad HTTP (CSP, X-Frame-Options, X-Content-Type-Options)
- **Evidencia:** `next.config.ts` no define `async headers()`; no existe `vercel.json`. `grep` de CSP/HSTS/X-Frame-Options en config = 0.
- **Por qué importa:** Sin `X-Frame-Options`/CSP `frame-ancestors`, riesgo de clickjacking; sin `X-Content-Type-Options: nosniff`, MIME sniffing; CSP es la defensa clave contra XSS. (HSTS lo añade Vercel automáticamente.)
- **Recomendación:** Añadir `async headers()` en `next.config.ts` con `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y una CSP (empezar en `report-only`).
- **Esfuerzo:** S–M

#### M-2. Protección de contraseñas filtradas desactivada
- **Evidencia:** `get_advisors(security)` → `auth_leaked_password_protection`: *"Leaked password protection is currently disabled"*. Mínimo de contraseña en cambio de admin = 8 (`app/actions/admin.ts:325`).
- **Por qué importa:** Permite contraseñas ya comprometidas (HaveIBeenPwned).
- **Recomendación:** Activar en Supabase Dashboard → Auth → Password Security y subir requisitos de complejidad.
- **Esfuerzo:** S

#### M-3. `search_path` mutable + `get_user_rol()` SECURITY DEFINER ejecutable por anon
- **Evidencia:** `get_advisors(security)` → `function_search_path_mutable` en `get_user_rol`, `prevent_historico_update`, `update_updated_at`; y `anon/authenticated_security_definer_function_executable` sobre `public.get_user_rol()` (callable vía `/rest/v1/rpc/get_user_rol`).
- **Por qué importa:** Un `search_path` mutable en funciones SECURITY DEFINER es vector de escalación (search-path hijacking); exponer la función a `anon` es superficie innecesaria.
- **Recomendación:** `ALTER FUNCTION ... SET search_path = ''` en las 3 funciones y `REVOKE EXECUTE ... FROM anon` en `get_user_rol`.
- **Esfuerzo:** S

#### M-4. Políticas RLS muertas / roles y estados inexistentes + 75 políticas permisivas múltiples
- **Evidencia:** Existen políticas que referencian roles `gobierno`/`hacienda` y estados `revision_gobierno`/`revision_hacienda`/`pagado` (`periodos_gobierno_update`, `periodos_hacienda_update`, etc.), pero el dominio solo define `admin|supervisor|contratista|asesor` (`lib/types.ts:5-9`). Hay pares duplicados `_update`/`_update_v2` en `periodos`. Advisor de rendimiento: `multiple_permissive_policies` ×75 (`periodos` ~14 políticas).
- **Por qué importa:** Las políticas permisivas se combinan con OR; una política olvidada puede ampliar acceso. Además degrada el rendimiento de RLS y dificulta auditar la seguridad.
- **Recomendación:** Auditar política por política, eliminar las de roles/estados inexistentes y consolidar los pares `_v2`.
- **Esfuerzo:** M

#### M-5. Manejo de errores que devuelve mensajes internos al cliente
- **Evidencia:** Patrón `return { error: \`Error al ...: ${error.message}\` }` (p.ej. `app/actions/periodos.ts:180,287,734`) propaga el mensaje crudo de Postgres/Supabase a la UI. Además `app/actions/admin.ts` tiene menos cobertura de try/catch que `periodos.ts`.
- **Por qué importa:** Filtra detalles internos (columnas, constraints) útiles a un atacante; UX poco amigable.
- **Recomendación:** Loggear el detalle en servidor y devolver mensajes genéricos; uniformar try/catch en `admin.ts`.
- **Esfuerzo:** M

#### M-6. `getAdminPipeline` no excluye históricos de forma consistente
- **Evidencia:** `services/dashboard.ts:65-71` — solo el conteo `borrador` filtra `es_historico=false`; `enviado/revision/aprobado/radicado/rechazado` no.
- **Por qué importa:** Las métricas del panel de admin pueden inflarse con periodos históricos.
- **Recomendación:** Aplicar `.eq('es_historico', false)` a todos los conteos del pipeline (o documentar la intención).
- **Esfuerzo:** S

#### M-7. Componente monolítico de 2.818 líneas
- **Evidencia:** `app/dashboard/contratos/[id]/periodo/[periodoId]/PeriodoDetalleClient.tsx` = **2.818 líneas** (3× el siguiente archivo). Concentra estado, polling, aprobación de 5 roles, generación de PDF, subida de evidencias, planilla y alertas.
- **Por qué importa:** Difícil de mantener, propenso a regresiones, render pesado.
- **Recomendación:** Extraer sub-componentes por responsabilidad.
- **Esfuerzo:** L

#### M-8. Tipado débil (`any`) recurrente bajo `strict: true`
- **Evidencia:** 72 ocurrencias de `: any`/`as any`/`<any>`. Patrón `p.contrato as unknown as {...}` repetido (`app/actions/periodos.ts:495,570,584`); `supabase: any` en `lib/pdf/cache.ts:38`; `initialObligaciones: any[]` en `ContratoDetalleClient.tsx:28`.
- **Por qué importa:** Anula parcialmente la seguridad de tipos; los casts de joins ocultan cambios de esquema.
- **Recomendación:** Generar tipos con `supabase gen types` (tool MCP `generate_typescript_types`) y tiparlos.
- **Esfuerzo:** M

#### M-9. Imágenes sin optimizar (`<img>` en vez de `next/image`)
- **Evidencia:** Uso de `<img>` y 0 imports de `next/image` (avatares, firmas).
- **Por qué importa:** Mayor ancho de banda y peor LCP en móvil con fotos de contratistas.
- **Recomendación:** Migrar a `next/image` donde aplique. Bajo impacto al volumen actual.
- **Esfuerzo:** S

---

### 🟢 BAJO

- **B-1. No existe `.env.example`** — `.gitignore` ignora `.env*` correctamente (ningún `.env` trackeado). Crear `.env.example` documentando `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `TWILIO_*`, etc. *(S)*
- **B-2. README es el boilerplate de create-next-app** (`README.md`) — no documenta el proyecto ni el setup. *(S)*
- **B-3. Índices no usados** — Advisor `unused_index` (2). Revisar y eliminar si se confirma. *(S)*
- **B-4. `console.*` en código de servidor** — 9 ocurrencias en actions/api/lib; migrar a logger estructurado. *(S)*
- **B-5. `subirFirma` permite 50 MB** (`app/actions/periodos.ts:1299`) para una imagen de firma — límite desproporcionado; bajar a ~2–5 MB. *(S)*
- **B-6. Tablas/políticas sin uso** — `aprobaciones`, `documentos`, `preaprobaciones`, `preferencias_notificacion` (0 filas) con código `@deprecated` asociado (`app/actions/periodos.ts:396-404`). Limpiar código y tablas/políticas muertas. *(M)*
- **B-7. Archivo temporal de Office sin trackear** — `~$SCRIPCION_PROGRAMA_COMPUTADOR.docx` (lock de Word) untracked; borrar y añadir `~$*` al `.gitignore`. *(S)*

---

## Lo que está bien hecho (fortalezas verificadas)

- ✅ **RLS habilitado en las 16 tablas** sin excepción (`list_tables` → `rls_enabled: true` en todas).
- ✅ **Buen modelo de datos e índices:** FKs e índices presentes en todas las columnas consultadas (`idx_periodos_contrato_estado`, `idx_usuarios_rol_dependencia`, índices parciales de notificaciones no leídas, etc.).
- ✅ **Autorización server-side antes de operaciones costosas:** `requireRole`, `requireContractAccess` (`lib/auth.ts`) y `verificarAccesoPeriodo` (`lib/pdf/auth.ts`) al inicio de páginas/rutas; admin actions con `requireAdmin()`.
- ✅ **Gestión de secretos correcta:** `service_role` solo en servidor (`lib/supabase-admin.ts`, `app/actions/admin.ts`), separación de claves pública/privada, validación fail-fast (`lib/env.ts`), `.gitignore` cubre `.env*`. **Sin secretos hardcodeados ni en el historial git.**
- ✅ **Sin XSS por inyección directa:** 0 usos de `dangerouslySetInnerHTML` (verificado); React escapa por defecto.
- ✅ **Sin SQL injection:** acceso vía cliente Supabase parametrizado.
- ✅ **Conciencia de rendimiento:** caché de PDF por estado, batching que elimina N+1 en `aprobarPeriodos`/`rechazarPeriodos` (`app/actions/periodos.ts:454-612`), presigned uploads para evadir el timeout de Vercel, middleware que evita martillar el Auth server.
- ✅ **Concurrencia:** optimistic locking en `marcarRadicado` (`.eq('estado','aprobado')`, `app/actions/periodos.ts:658`) y verificación de `updated.length` tras los updates.
- ✅ **Inmutabilidad de históricos** por trigger `prevent_historico_update` + chequeos `es_historico` en cada acción.
- ✅ **Notificaciones no bloqueantes:** sus fallos no rompen la transacción principal.
- ✅ **Migraciones versionadas** con nombres descriptivos y orden temporal.
- ✅ **Despliegue saludable:** último deployment de producción `READY`; sin errores en runtime logs (últimos 7 días).

---

## Plan de acción sugerido

### Etapa 1 — Esta semana (cerrar la exposición de datos)
1. **C-1 / C-2** — Volver privados los 4 buckets y migrar descargas a signed URLs server-side (incluye ajustar `getOrGeneratePDFBuffer`). *Es el riesgo dominante.* *(L)*
2. **C-3** — Restringir `usuarios_authenticated_read` a la propia fila + vista reducida para joins. *(M)*
3. **C-4** — Reemplazar/parchear `xlsx`; `npm audit fix` para el `ws` moderate. *(M)*
4. **A-4** — Añadir verificación de sesión a `mejorarDescripcion`. *(S)*
5. **M-2 / M-3** — Activar leaked-password protection; fijar `search_path` y `REVOKE EXECUTE` de `get_user_rol`. *(S)*

### Etapa 2 — Este mes (privilegios, robustez y hardening)
6. **A-1 / M-4** — Reescribir políticas de revisores con filtro por dependencia; eliminar políticas/roles/estados muertos y duplicados `_v2`. *(M)*
7. **A-2** — Migrar agregar/eliminar obligaciones a Server Actions (desbloquea funcionalidad rota). *(S)*
8. **A-5 / M-1** — Rate limiting en login/recuperación/IA/envíos; security headers en `next.config.ts`. *(M)*
9. **M-5 / M-6 / B-5** — Mensajes de error genéricos, conteos del pipeline, límites de tamaño. *(M)*
10. **A-3** — Diseñar versionado temporal de obligaciones (otrosíes). *(L)*

### Etapa 3 — Después (calidad y escalabilidad)
11. **M-7 / M-8 / M-9** — Refactorizar `PeriodoDetalleClient.tsx`; reducir `any` con tipos generados; migrar imágenes a `next/image`. *(L/M/S)*
12. **B-1 / B-2 / B-4 / B-6 / B-3 / B-7** — `.env.example`, README, logger estructurado, limpiar código/tablas muertas, revisar índices no usados, archivos temporales. *(S/M)*

---

## No verificado (límites de las herramientas)

- **Configuración completa de Supabase Auth** (confirmación de email, OTP, providers, expiración): no inspeccionable vía MCP. Revisar en Dashboard → Auth → Providers/Settings.
- **Estrategia de backups/PITR:** no inspeccionable vía MCP. Confirmar retención en Dashboard → Database → Backups.
- **Variables de entorno por entorno (preview vs production)** en Vercel: no enumeradas. Verificar que `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `TWILIO_*`, `RESEND_API_KEY` estén solo en Production/Preview y nunca como `NEXT_PUBLIC_`.
- **CORS de las rutas API:** no se detectó configuración CORS explícita; Next.js no expone CORS abierto por defecto, pero no se verificó la respuesta por endpoint.
- **Build logs / Web Vitals / tamaño exacto de bundles:** runtime logs sin errores; no se analizaron build logs ni métricas de cliente.

---

*Fin de la auditoría. Generado en modo solo-lectura — no se modificó ningún recurso del proyecto salvo la creación/actualización de este archivo.*
