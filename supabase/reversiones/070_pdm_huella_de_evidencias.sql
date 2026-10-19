-- Reversión de la migración 070 (módulo Plan de Desarrollo: huella SHA-256 de las evidencias).
--
-- Devuelve a como estaba antes de la 070: `pdm_evidencias_vista` sin `sha256` ni `huella_calculada_en`, el disparador
-- `pdm_privado.preparar_evidencia` como lo dejó la 058 (sin leer el libro de huellas), y quita el disparador que protege la
-- huella, las dos columnas de `pdm_evidencias` y el libro `pdm_huellas`.
--
-- SE NIEGA a correr si alguna evidencia ya tiene huella: esa huella es lo que permite demostrar, ante un tercero, que un
-- archivo es el que se subió, y borrarla no se puede deshacer (calcularla después no prueba lo mismo: la fecha de cálculo
-- sería otra). En ese caso: exportarlas primero
--   select id, reporte_id, ruta, bytes, sha256, huella_calculada_en from public.pdm_evidencias where sha256 is not null;
-- y solo entonces correr esto con la línea marcada «PUNTO DE NO RETORNO» activada.
--
-- Antes de correrla: si la pantalla que muestra la huella o el servidor que la calcula ya están desplegados, bajarlos
-- primero (consultarían columnas que ya no existen). Se puede correr sin riesgo cuantas veces haga falta (`if exists`).

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_n bigint := 0;
begin
  -- Dinámico a propósito: si la columna ya no existe (se corrió antes), la consulta no se puede ni planificar.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias' and column_name = 'sha256') then
    execute 'select count(*) from public.pdm_evidencias where sha256 is not null' into v_n;
  end if;
  if v_n > 0 then
    raise exception 'Reversión 070: % evidencias ya tienen huella. Expórtalas antes de revertir (ver el encabezado de este archivo).', v_n;
  end if;
end $$;
-- PUNTO DE NO RETORNO: para revertir CON huellas escritas, exportarlas y quitar el bloque de arriba.

-- ─── La vista, como era (la de la 068) ────────────────────────────────────────

drop view if exists public.pdm_evidencias_vista;

create view public.pdm_evidencias_vista with (security_invoker = true) as
select
  e.id,
  e.reporte_id,
  normalize(e.nombre, NFC) as nombre,
  e.tipo,
  e.bytes,
  (e.copia_de is not null) as conservada,
  r.indicador_id,
  i.fila_origen as indicador_fila,
  i.codigo,
  i.indicador,
  i.sector,
  d.nombre as dependencia,
  r.anio,
  r.valor,
  r.autor_nombre,
  r.created_at as reportado_en,
  coalesce(v.estado, 'pendiente') as estado_reporte,
  exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id) as reemplazada,
  (select o->>'motivo'
     from public.pdm_validaciones x cross join lateral jsonb_array_elements(x.observaciones) o
    where x.reporte_id = r.id and o->>'evidencia' = e.id::text
    order by x.created_at desc, x.id desc limit 1) as observacion,
  translate(lower(normalize(e.nombre || ' ' || i.indicador || ' ' || i.codigo, NFC)),
            'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') as busqueda,
  pdm_privado.anulado(r.id) as anulada
from public.pdm_evidencias e
join public.pdm_reportes r on r.id = e.reporte_id
join public.pdm_indicadores i on i.id = r.indicador_id
join public.dependencias d on d.id = i.dependencia_id
left join lateral (
  select x.estado from public.pdm_validaciones x
  where x.reporte_id = r.id order by x.created_at desc, x.id desc limit 1
) v on true;

revoke all on public.pdm_evidencias_vista from public, anon, authenticated;
grant select on public.pdm_evidencias_vista to authenticated;

-- ─── El disparador de preparar la evidencia, como lo dejó la 058 ──────────────

create or replace function pdm_privado.preparar_evidencia() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  o public.pdm_evidencias%rowtype;
  v_corrige uuid;
begin
  if NEW.copia_de is null then return NEW; end if;

  select * into o from public.pdm_evidencias where id = NEW.copia_de;
  select corrige_a into v_corrige from public.pdm_reportes where id = NEW.reporte_id;
  if o.id is null or v_corrige is null or o.reporte_id <> v_corrige then
    raise exception 'PDM: solo se conservan archivos del reporte que se corrige' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pdm_validaciones v, jsonb_array_elements(v.observaciones) x
    where v.reporte_id = o.reporte_id and (x->>'evidencia')::uuid = o.id
  ) then
    raise exception 'PDM: un archivo devuelto no se conserva; reemplázalo o quítalo' using errcode = '23514';
  end if;

  -- Lo conservado es lo que ya estaba: nada se redeclara.
  NEW.ruta := o.ruta;
  NEW.nombre := o.nombre;
  NEW.tipo := o.tipo;
  NEW.bytes := o.bytes;
  return NEW;
end $$;

-- ─── Lo que la 070 añadió ─────────────────────────────────────────────────────

drop trigger if exists pdm_evidencias_proteger_huella on public.pdm_evidencias;
drop function if exists pdm_privado.proteger_huella();

alter table public.pdm_evidencias drop constraint if exists pdm_evidencias_huella_completa;
alter table public.pdm_evidencias drop column if exists sha256;
alter table public.pdm_evidencias drop column if exists huella_calculada_en;

drop table if exists public.pdm_huellas;

-- ─── Comprobación ─────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('pdm_evidencias', 'pdm_evidencias_vista') and column_name in ('sha256', 'huella_calculada_en'))
     or to_regclass('public.pdm_huellas') is not null then
    raise exception 'Reversión 070: quedó algo de la huella';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias_vista' and column_name = 'anulada') then
    raise exception 'Reversión 070: la vista de evidencias perdió la columna anulada';
  end if;
  if (select prosrc from pg_proc where pronamespace = 'pdm_privado'::regnamespace and proname = 'preparar_evidencia') like '%pdm_huellas%' then
    raise exception 'Reversión 070: preparar_evidencia sigue leyendo el libro de huellas';
  end if;
end $$;

commit;
