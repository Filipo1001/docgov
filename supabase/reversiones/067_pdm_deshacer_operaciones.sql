-- Reversión de la migración 067 (módulo Plan de Desarrollo: deshacer operaciones).
--
-- La 067 solo AÑADIÓ funciones; no cambió ninguna tabla, política, disparador ni fila. Revertirla es quitarlas.
-- Lo que ya se haya deshecho con ellas NO se revierte aquí (no hace falta): sus filas `lote_deshacer` y las de cada cambio
-- quedan en `pdm_historial` como historia, y los cambios de reparto, grupos y accesos que se hicieron siguen como quedaron.
--
-- Antes de correrla: si la pantalla del historial ya está desplegada, bajarla primero (o quedará una pestaña que falla al
-- cargar). Se puede correr sin riesgo cuantas veces haga falta (`if exists`).

begin;

drop function if exists public.pdm_deshacer(uuid, text);
drop function if exists public.pdm_operaciones(integer);
drop function if exists pdm_privado.bloqueos_de_lote(uuid);
drop function if exists pdm_privado.clave_historial(text, uuid, jsonb);
drop function if exists pdm_privado.operaciones_deshacibles();

-- Comprobación: no queda nada de la 067.
do $$
begin
  if exists (select 1 from pg_proc p where p.proname in ('pdm_deshacer', 'pdm_operaciones', 'bloqueos_de_lote', 'clave_historial', 'operaciones_deshacibles')) then
    raise exception 'Reversión 067: quedan funciones de la 067';
  end if;
  -- Y lo anterior sigue en pie.
  if to_regprocedure('public.pdm_asignar(uuid[],uuid,boolean,text,text)') is null then
    raise exception 'Reversión 067: falta una función anterior';
  end if;
end $$;

commit;
