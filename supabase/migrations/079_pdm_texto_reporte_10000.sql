-- Migration 079: módulo Plan de Desarrollo — «¿Qué se hizo?» admite hasta 10.000 caracteres (antes 5.000)
--
-- POR QUÉ. Felipe (30-oct-2026), un día después de la 078: «lo subamos a 10 mil caracteres». Sigue valiendo lo que eligió con la 078: el
-- formulario dice cuántos caracteres quedan solo al acercarse al límite, y la ficha recorta un texto largo con «Leer todo».
--
-- QUÉ CAMBIA. Solo el número, en los dos lugares de la base donde vive (ver la 078):
--
--   · `pdm_privado.max_texto_reporte()`: de 5.000 a 10.000. `pdm_reportar` y `pdm_borrador_guardar` lo consultan; ninguna se reescribe
--     (y el mensaje dice el número que la función diga: «10.000»). La aplicación tiene su copia en lib/pdm/seguimiento-acciones.ts
--     (MAX_TEXTO_REPORTE) y tests/pdm/seguimiento.test.ts vigila que digan lo mismo.
--   · `pdm_borradores_texto_check`: de 5.000 a 10.000.
--
-- NADA CAMBIA PARA LO YA REPORTADO: no se toca ninguna fila, y todo lo que cabía en 5.000 cabe en 10.000. Conserva los permisos de la
-- función (`create or replace` no los toca). El comprobador del final aborta la migración si algo de lo prometido no queda cumplido.
-- Copia para revertir: supabase/reversiones/079_…; prueba de punta a punta: supabase/tests/pdm_texto_reporte.sql.

begin;

-- ─── 1. El número ─────────────────────────────────────────────────────────────

create or replace function pdm_privado.max_texto_reporte()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $f$ select 10000 $f$;

comment on function pdm_privado.max_texto_reporte() is
  'Cuántos caracteres admite como máximo «¿Qué se hizo?» de un reporte o de su borrador. pdm_reportar y pdm_borrador_guardar lo consultan. La aplicación tiene su copia en lib/pdm/seguimiento-acciones.ts (MAX_TEXTO_REPORTE) y la restricción pdm_borradores_texto_check lleva el mismo número escrito; tests/pdm/seguimiento.test.ts vigila que los tres digan lo mismo.';

-- ─── 2. La restricción de la tabla del borrador ───────────────────────────────

alter table public.pdm_borradores drop constraint pdm_borradores_texto_check;
alter table public.pdm_borradores add constraint pdm_borradores_texto_check check (char_length(texto) <= 10000);

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  -- 1. El número, con los permisos de siempre
  if pdm_privado.max_texto_reporte() <> 10000 then raise exception 'PDM 079: la función del largo no dice 10000'; end if;
  if has_function_privilege('anon', 'pdm_privado.max_texto_reporte()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'pdm_privado.max_texto_reporte()', 'EXECUTE')
     or not has_function_privilege('service_role', 'pdm_privado.max_texto_reporte()', 'EXECUTE') then
    raise exception 'PDM 079: la función del largo no tiene los permisos que debe';
  end if;

  -- 2. Las dos funciones siguen consultando el largo (y ninguna repite un número), de invocador, con ruta fija y sus permisos
  select string_agg(p.proname, ', ') into v_malas
  from pg_proc p
  where p.oid in ('public.pdm_reportar(uuid, integer, numeric, text, jsonb, text, uuid[])'::regprocedure,
                  'public.pdm_borrador_guardar(uuid, integer, integer, numeric, text, text, uuid[], jsonb)'::regprocedure)
    and (p.prosrc not like '%char_length(v_texto) > pdm_privado.max_texto_reporte()%'
         or p.prosrc ~ 'char_length\(v_texto\) > [0-9]'
         or p.prosecdef
         or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
         or has_function_privilege('anon', p.oid, 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or not has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_malas is not null then raise exception 'PDM 079: % no consulta el largo o lo repite', v_malas; end if;

  -- 3. La restricción de la tabla
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pdm_borradores'::regclass and c.conname = 'pdm_borradores_texto_check'
                    and pg_get_constraintdef(c.oid) ~ 'char_length\(texto\) <= 10000') then
    raise exception 'PDM 079: pdm_borradores_texto_check no quedó en 10000';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Hay una copia ejecutable en supabase/reversiones/079_pdm_texto_reporte_10000.sql (vuelve al largo de 5.000; se NIEGA si ya hay un
-- borrador con más de 5.000 caracteres, que la restricción vieja no dejaría existir).
