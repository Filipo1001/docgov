-- 044_rls_initplan.sql
--
-- auth.uid() deja de evaluarse una vez POR FILA en seis políticas.
--
-- ── El problema ──────────────────────────────────────────────────────────
--
-- Postgres trata `auth.uid()` dentro de una política como una expresión que
-- depende de la fila, así que la ejecuta en cada una. Envuelta en un
-- subselect —`(select auth.uid())`— la reconoce como constante de la consulta
-- y la resuelve una sola vez (InitPlan). Es la corrección que recomienda el
-- linter de Supabase (0003_auth_rls_initplan).
--
-- Se midió antes de escribir esto: `usuarios` tiene 127 filas y acumula 67,4
-- millones de lecturas por índice, y las consultas sobre `actividades` —2.982
-- filas— promedian 64 ms. Ese tiempo no lo explica el volumen de datos: lo
-- explica la evaluación repetida de las políticas.
--
-- ── Qué NO cambia ────────────────────────────────────────────────────────
--
-- El criterio de acceso es idéntico, expresión por expresión. `auth.uid()`
-- depende del JWT de la sesión, no de la fila que se esté evaluando, así que
-- resolverla una vez o mil da el mismo resultado. Lo único que cambia es
-- cuántas veces se calcula.
--
-- Tampoco cambia a quién aplican: todas siguen siendo permisivas y para
-- PUBLIC, como estaban.
--
-- Quedan sin tocar las 101 políticas permisivas solapadas que reporta el
-- mismo linter (20 en `actividades`, 15 en `evidencias`). Consolidarlas
-- redibuja la frontera de permisos y merece su propia revisión.

-- ── actas_terminacion ────────────────────────────────────────────────────
drop policy if exists actas_terminacion_select on public.actas_terminacion;
create policy actas_terminacion_select on public.actas_terminacion
for select using (
  (exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.rol = 'admin'::rol_usuario
  ))
  or (exists (
    select 1 from public.contratos c
    where c.id = actas_terminacion.contrato_id
      and (
        c.contratista_id = (select auth.uid())
        or c.supervisor_id = (select auth.uid())
        or (exists (
          select 1 from public.usuarios u
          where u.id = (select auth.uid())
            and u.rol = 'asesor'::rol_usuario
            and u.dependencia_id = c.dependencia_id
        ))
      )
  ))
);

-- ── certificaciones_retencion ────────────────────────────────────────────
drop policy if exists cert_retencion_select on public.certificaciones_retencion;
create policy cert_retencion_select on public.certificaciones_retencion
for select using (
  (exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.rol = 'admin'::rol_usuario
  ))
  or (exists (
    select 1 from public.contratos c
    where c.id = certificaciones_retencion.contrato_id
      and (
        c.contratista_id = (select auth.uid())
        or c.supervisor_id = (select auth.uid())
        or (exists (
          select 1 from public.usuarios u
          where u.id = (select auth.uid())
            and u.rol = 'asesor'::rol_usuario
            and u.dependencia_id = c.dependencia_id
        ))
      )
  ))
);

-- ── contratos_historial ──────────────────────────────────────────────────
drop policy if exists "historial contratos legible por gestores" on public.contratos_historial;
create policy "historial contratos legible por gestores" on public.contratos_historial
for select using (
  exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid())
      and u.rol = any (array[
        'admin'::rol_usuario,
        'contratacion'::rol_usuario,
        'supervisor'::rol_usuario,
        'asesor'::rol_usuario
      ])
  )
);

-- ── documentos_adjuntos ──────────────────────────────────────────────────
drop policy if exists adjuntos_select on public.documentos_adjuntos;
create policy adjuntos_select on public.documentos_adjuntos
for select using (
  (exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid())
      and u.rol = any (array['admin'::rol_usuario, 'contratacion'::rol_usuario])
  ))
  or (exists (
    select 1
    from public.periodos p
    join public.contratos c on c.id = p.contrato_id
    where documentos_adjuntos.entidad_tipo = 'periodo'::text
      and p.id = documentos_adjuntos.entidad_id
      and (
        c.contratista_id = (select auth.uid())
        or c.supervisor_id = (select auth.uid())
        or (exists (
          select 1 from public.usuarios u
          where u.id = (select auth.uid())
            and u.rol = 'asesor'::rol_usuario
            and u.dependencia_id = c.dependencia_id
        ))
      )
  ))
  or (exists (
    select 1 from public.contratos c
    where documentos_adjuntos.entidad_tipo = 'contrato'::text
      and c.id = documentos_adjuntos.entidad_id
      and (
        c.contratista_id = (select auth.uid())
        or c.supervisor_id = (select auth.uid())
        or (exists (
          select 1 from public.usuarios u
          where u.id = (select auth.uid())
            and u.rol = 'asesor'::rol_usuario
            and u.dependencia_id = c.dependencia_id
        ))
      )
  ))
);

-- ── obligacion_revisiones (lectura) ──────────────────────────────────────
drop policy if exists obligacion_revisiones_select on public.obligacion_revisiones;
create policy obligacion_revisiones_select on public.obligacion_revisiones
for select using (
  (exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.rol = 'admin'::rol_usuario
  ))
  or (exists (
    select 1
    from public.periodos p
    join public.contratos c on c.id = p.contrato_id
    where p.id = obligacion_revisiones.periodo_id
      and (
        c.contratista_id = (select auth.uid())
        or c.supervisor_id = (select auth.uid())
        or (exists (
          select 1 from public.usuarios u
          where u.id = (select auth.uid())
            and u.rol = 'asesor'::rol_usuario
            and u.dependencia_id = c.dependencia_id
        ))
      )
  ))
);

-- ── obligacion_revisiones (escritura) ────────────────────────────────────
-- El contratista no aparece: revisar una obligación es acto del revisor.
drop policy if exists obligacion_revisiones_write on public.obligacion_revisiones;
create policy obligacion_revisiones_write on public.obligacion_revisiones
for all
using (
  (exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.rol = 'admin'::rol_usuario
  ))
  or (exists (
    select 1
    from public.periodos p
    join public.contratos c on c.id = p.contrato_id
    where p.id = obligacion_revisiones.periodo_id
      and (
        c.supervisor_id = (select auth.uid())
        or (exists (
          select 1 from public.usuarios u
          where u.id = (select auth.uid())
            and u.rol = 'asesor'::rol_usuario
            and u.dependencia_id = c.dependencia_id
        ))
      )
  ))
)
with check (
  (exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.rol = 'admin'::rol_usuario
  ))
  or (exists (
    select 1
    from public.periodos p
    join public.contratos c on c.id = p.contrato_id
    where p.id = obligacion_revisiones.periodo_id
      and (
        c.supervisor_id = (select auth.uid())
        or (exists (
          select 1 from public.usuarios u
          where u.id = (select auth.uid())
            and u.rol = 'asesor'::rol_usuario
            and u.dependencia_id = c.dependencia_id
        ))
      )
  ))
);
