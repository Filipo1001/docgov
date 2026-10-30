-- Migration 077: módulo Plan de Desarrollo — un reporte admite hasta 100 archivos (antes 30), y la aplicación sigue sin decir cuántos
--
-- POR QUÉ. El 28-oct-2026 llegó el primer reporte que llenó el tope de 30 (un reporte de 2024: 14 fotos y 16 PDF, 31 MB): quien lo
-- envió se quedó sin espacio y la aplicación solo le dijo «Este reporte ya tiene todos los archivos que admite». Felipe (30-oct-2026):
-- «100, sin mostrar el número». Sigue siendo una RED DE SEGURIDAD (cada archivo se lee entero al enviar para calcular su huella y se
-- empaqueta), no un número que la aplicación diga: ni «N de 100», ni «hasta 100», ni en un mensaje de error.
--
-- QUÉ CAMBIA. Solo el número, en los dos lugares de la base donde vive (ver la 075):
--
--   · `pdm_privado.max_evidencias()`: de 30 a 100. `pdm_reportar`, `pdm_validar` y `pdm_borrador_guardar` lo consultan; ninguna se
--     reescribe. La aplicación tiene su copia en lib/pdm/seguimiento-acciones.ts (MAX_EVIDENCIAS) y tests/pdm/seguimiento.test.ts
--     vigila que digan lo mismo.
--   · `pdm_validaciones_observaciones_check`: de 30 a 100 observaciones (al devolver un reporte de 100 archivos, la secretaría tiene que
--     poder marcar el que falle, sea cual sea).
--
-- NADA CAMBIA PARA LO YA REPORTADO: no se toca ninguna fila, y todo lo que cabía en 30 cabe en 100. Conserva los permisos de la función
-- (`create or replace` no los toca). Ningún plan guardado se queda con el 30: Postgres invalida los planes que dependen de una función
-- cuando esta se reemplaza. El comprobador del final aborta la migración si algo de lo prometido no queda cumplido.
-- Copia para revertir: supabase/reversiones/077_…; prueba de punta a punta: supabase/tests/pdm_evidencias_tope.sql (y el tope del
-- borrador, en supabase/tests/pdm_borradores.sql).

begin;

-- ─── 1. El número ─────────────────────────────────────────────────────────────

create or replace function pdm_privado.max_evidencias()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $f$ select 100 $f$;

comment on function pdm_privado.max_evidencias() is
  'Cuántos archivos admite como máximo un reporte (red de seguridad; la aplicación no lo muestra). pdm_reportar, pdm_validar y pdm_borrador_guardar lo consultan. La aplicación tiene su copia en lib/pdm/seguimiento-acciones.ts (MAX_EVIDENCIAS) y la restricción pdm_validaciones_observaciones_check lleva el mismo número escrito; tests/pdm/seguimiento.test.ts vigila que los tres digan lo mismo.';

-- ─── 2. La restricción de la tabla de validaciones ────────────────────────────

alter table public.pdm_validaciones drop constraint pdm_validaciones_observaciones_check;
alter table public.pdm_validaciones add constraint pdm_validaciones_observaciones_check
  check (jsonb_typeof(observaciones) = 'array' and jsonb_array_length(observaciones) <= 100);

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. El número, con los permisos de siempre
  if pdm_privado.max_evidencias() <> 100 then raise exception 'PDM 077: la función del tope no dice 100'; end if;
  if has_function_privilege('anon', 'pdm_privado.max_evidencias()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'pdm_privado.max_evidencias()', 'EXECUTE')
     or not has_function_privilege('service_role', 'pdm_privado.max_evidencias()', 'EXECUTE') then
    raise exception 'PDM 077: la función del tope no tiene los permisos que debe';
  end if;

  -- 2. Quien cuenta archivos sigue consultando la función (y ninguna repite el 30 de antes)
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure,
                  'public.pdm_validar(uuid, text, text, jsonb)'::regprocedure)
    and (p.prosrc not like '%pdm_privado.max_evidencias()%' or p.prosrc ~ '(>|>=|<|<=) 30( |;|$)');
  if v_malas is not null then raise exception 'PDM 077: % no consulta el tope o repite el 30', v_malas; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'pdm_borrador_guardar' and p.prosrc like '%pdm_privado.max_evidencias()%') then
    raise exception 'PDM 077: pdm_borrador_guardar dejó de consultar el tope';
  end if;

  -- 3. La restricción de la tabla
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_validaciones'::regclass and c.conname = 'pdm_validaciones_observaciones_check'
                    and pg_get_constraintdef(c.oid) ~ 'jsonb_array_length\(observaciones\) <= 100\)') then
    raise exception 'PDM 077: pdm_validaciones_observaciones_check no quedó en 100';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/077_pdm_evidencias_hasta_100.sql (vuelve al tope de 30; se NIEGA si ya hay reportes
-- o borradores con más de 30 archivos o validaciones con más de 30 observaciones, que dejarían de poder corregirse o reabrirse).
