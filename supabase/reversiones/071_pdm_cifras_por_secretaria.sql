-- Reversión de la migración 071 (módulo Plan de Desarrollo: cifras agregadas por secretaría y ritmo semanal).
--
-- Quita las tres funciones que añadió la 071: `public.pdm_cifras_por_secretaria()`, `public.pdm_ritmo_semanal(date)` y
-- `pdm_privado.cifras_por_secretaria()`. La 071 no creó tablas, columnas, políticas ni permisos de tablas, así que no
-- hay nada más que deshacer y no se pierde ningún dato.
--
-- Antes de correrla: si el tablero del secretario ya está desplegado, bajarlo primero (llamaría a funciones que ya no
-- existen y su pantalla fallaría). Se puede correr sin riesgo cuantas veces haga falta (`if exists`).

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop function if exists public.pdm_cifras_por_secretaria();
drop function if exists public.pdm_ritmo_semanal(date);
drop function if exists pdm_privado.cifras_por_secretaria();

do $$
begin
  if exists (
    select 1 from pg_proc
    where (pronamespace = 'public'::regnamespace and proname in ('pdm_cifras_por_secretaria', 'pdm_ritmo_semanal'))
       or (pronamespace = 'pdm_privado'::regnamespace and proname = 'cifras_por_secretaria')) then
    raise exception 'Reversión 071: quedó alguna de las funciones';
  end if;
end $$;

commit;
