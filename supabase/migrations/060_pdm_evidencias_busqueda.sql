-- Migration 060: módulo Plan de Desarrollo — buscar evidencias sin que importen tildes, mayúsculas ni cómo se escribió
--
-- POR QUÉ. Al probar la vista de evidencias con un archivo real, buscar «Transacción» no lo encontraba aunque el
-- nombre se veía igual: algunos equipos (los Mac, por ejemplo) guardan la tilde «descompuesta» —la letra y su tilde
-- como dos caracteres— y lo que se teclea es un solo carácter. Dos textos que se leen idénticos no eran iguales.
--
-- QUÉ CAMBIA, en `pdm_evidencias_vista`:
--   · `nombre` sale normalizado (NFC): se lee igual y se compara bien.
--   · Una columna nueva, `busqueda`: el nombre del archivo, el indicador y su código, en minúsculas y sin tildes. La
--     pantalla busca ahí con el texto escrito pasado por la misma limpieza, así «transaccion», «TRANSACCIÓN» y
--     «Transacción» encuentran lo mismo. Solo SQL corriente: no se instala ninguna extensión.
--
-- No toca tablas, columnas, políticas ni funciones, ni nada de Contratista Digital. La vista conserva sus columnas y
-- sus permisos (corre con los de quien pregunta); solo se agrega una al final.
--
-- Va en una transacción con `lock_timeout` y termina con un comprobador que la aborta si algo de lo prometido no
-- queda cumplido.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.pdm_evidencias_vista with (security_invoker = true) as
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
  -- La versión de este reporte ya fue reemplazada por una corrección: el archivo es historia (si se conservó, su copia está en la nueva).
  exists (select 1 from public.pdm_reportes s where s.corrige_a = r.id) as reemplazada,
  -- La nota más reciente con que la secretaría devolvió ESTE archivo, si lo devolvió.
  (select o->>'motivo'
     from public.pdm_validaciones x cross join lateral jsonb_array_elements(x.observaciones) o
    where x.reporte_id = r.id and o->>'evidencia' = e.id::text
    order by x.created_at desc, x.id desc limit 1) as observacion,
  -- Para buscar: nombre del archivo, indicador y código, en minúsculas y sin tildes.
  translate(lower(normalize(e.nombre || ' ' || i.indicador || ' ' || i.codigo, NFC)),
            'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') as busqueda
from public.pdm_evidencias e
join public.pdm_reportes r on r.id = e.reporte_id
join public.pdm_indicadores i on i.id = r.indicador_id
join public.dependencias d on d.id = i.dependencia_id
left join lateral (
  select x.estado from public.pdm_validaciones x
  where x.reporte_id = r.id order by x.created_at desc, x.id desc limit 1
) v on true;

-- Reemplazar una vista conserva sus permisos; se reafirman por si acaso.
revoke all on public.pdm_evidencias_vista from public, anon, authenticated;
grant select on public.pdm_evidencias_vista to authenticated;

-- ─── Comprobación: esta migración se niega a terminar si no cumple lo que promete ───

do $$
declare
  v_malas text;
begin
  if not exists (select 1 from pg_class c where c.oid = 'public.pdm_evidencias_vista'::regclass and 'security_invoker=true' = any(c.reloptions)) then
    raise exception 'PDM 060: la vista no respeta los permisos de quien pregunta';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pdm_evidencias_vista' and column_name = 'busqueda') then
    raise exception 'PDM 060: falta la columna de búsqueda';
  end if;
  select string_agg(p, ', ') into v_malas
  from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where has_table_privilege('anon', 'public.pdm_evidencias_vista', p)
     or (p <> 'SELECT' and has_table_privilege('authenticated', 'public.pdm_evidencias_vista', p))
     or (p = 'SELECT' and not has_table_privilege('authenticated', 'public.pdm_evidencias_vista', p));
  if v_malas is not null then raise exception 'PDM 060: permisos incorrectos en la vista: %', v_malas; end if;
  -- La normalización y el quitar tildes hacen lo que dicen (con mayúsculas acentuadas y con la tilde descompuesta).
  if translate(lower(normalize(U&'TRANSACCI\00D3N A\00D1O', NFC)), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') <> 'transaccion ano' then
    raise exception 'PDM 060: la búsqueda sin tildes no funciona con mayúsculas acentuadas';
  end if;
  if translate(lower(normalize(U&'Transacci\006F\0301n', NFC)), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') <> 'transaccion' then
    raise exception 'PDM 060: la búsqueda sin tildes no funciona con la tilde descompuesta';
  end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
-- Volver a crear la vista como en la 059 (sin la columna `busqueda`; `create or replace` no puede quitar una columna,
-- así que hay que borrarla y crearla): `drop view public.pdm_evidencias_vista;` y el `create view` de la 059.
