-- REVERSIÓN de la migración 081 (terminación anticipada de un contrato). NO forma parte de la cadena de migraciones: se
-- pega a mano.
--
-- Quita las funciones, los disparadores, la tabla del registro y las dos columnas del contrato. SE NIEGA si hay alguna
-- terminación vigente o algún periodo anulado: primero se deshacen desde la aplicación (o con revertir_terminacion), para
-- que cada periodo vuelva a su estado, su fecha y su valor. Las terminaciones ya deshechas se pierden con la tabla.
--
-- El valor «anulado» del enum (080) se queda: Postgres no quita valores de un enum, y sin la 081 nadie lo escribe.
-- Si solo hace falta deshacer el CÓDIGO, no hace falta esto: con la 081 aplicada y ninguna terminación registrada, el
-- código anterior funciona igual (lee fecha_fin, que no cambió).

begin;

do $$
begin
  if exists (select 1 from public.contrato_terminaciones where revertida_en is null) then
    raise exception 'Reversión 081: hay terminaciones vigentes; deshazlas antes (los periodos anulados volverían a quedar sueltos)';
  end if;
  if exists (select 1 from public.periodos where estado = 'anulado') then
    raise exception 'Reversión 081: hay periodos anulados; no se revierte';
  end if;
  if exists (select 1 from public.contratos where fecha_terminacion is not null or estado = 'terminado') then
    raise exception 'Reversión 081: hay contratos terminados; no se revierte';
  end if;
end $$;

drop trigger if exists otrosies_contrato_no_terminado on public.otrosies;
drop trigger if exists periodos_anulado_protegido on public.periodos;
drop function if exists public.otrosies_contrato_no_terminado();
drop function if exists public.periodos_anulado_protegido();
drop function if exists public.revertir_terminacion(uuid, text, uuid);
drop function if exists public.terminar_contrato(uuid, text, date, date, text, text, numeric, uuid);

drop table if exists public.contrato_terminaciones;

alter table public.contratos drop constraint if exists contratos_terminacion_dentro_del_plazo;
alter table public.contratos drop constraint if exists contratos_terminacion_con_fecha;
drop index if exists public.contratos_fecha_fin_efectiva_idx;
alter table public.contratos drop column if exists fecha_fin_efectiva;
alter table public.contratos drop column if exists fecha_terminacion;

drop function if exists public.terminacion_causal_nombre(text);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contratos'
              and column_name in ('fecha_terminacion', 'fecha_fin_efectiva')) then
    raise exception 'Reversión 081: las columnas del contrato siguen ahí';
  end if;
  if to_regclass('public.contrato_terminaciones') is not null then
    raise exception 'Reversión 081: la tabla del registro sigue ahí';
  end if;
end $$;

commit;
