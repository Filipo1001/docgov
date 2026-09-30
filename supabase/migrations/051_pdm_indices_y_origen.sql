-- Migration 051: módulo Plan de Desarrollo — un índice mal cubierto y el texto de origen
--
-- DOS COSAS PEQUEÑAS, sobre tablas propias del módulo (`pdm_*`), que siguen sin
-- ser leídas por ninguna pantalla de Contratista Digital.
--
-- 1. UN ÍNDICE QUE NO CUBRÍA SU CLAVE. `pdm_reportes` tiene una clave foránea
--    compuesta, (corrige_a, indicador_id) → (id, indicador_id), que obliga a que
--    una corrección apunte a un reporte DEL MISMO indicador. El índice que creé
--    en la 050 cubría solo `corrige_a`. El comprobador de aquella migración
--    exigía que el índice EMPEZARA por la primera columna de la clave; el asesor
--    de Supabase exige cubrirla ENTERA, y lo avisó (`unindexed_foreign_keys`).
--    Se reemplaza por un índice sobre las dos columnas, y el comprobador de esta
--    migración exige lo mismo que el asesor: la clave completa, en orden.
--
-- 2. EL TEXTO ORIGINAL DEL RESPONSABLE. En el Excel, «Funcionario Responsable» es
--    texto libre: una persona, o «Equipo Psicosocial ZOE», o una oficina, o varias
--    personas, o nada. La carga inicial convirtió en asignaciones solo los 149
--    indicadores cuyo responsable es una persona con usuario; para los otros 108
--    no quedaba dónde guardar QUÉ decía el archivo. Ese dato importa: quien debe
--    decidir a quién asignar «Equipo Psicosocial ZOE» necesita verlo. Se guarda tal
--    cual venía en `responsable_origen`, que es información del plan —no
--    seguimiento— y que las asignaciones reales irán dejando atrás.
--
--    La columna es opcional y solo se añade; los datos se cargan aparte.
--
-- LO QUE NO HACE. No toca ninguna tabla de Contratista Digital. `pdm_reportes` no
-- tiene ninguna fila, así que reemplazar su índice es instantáneo.
--
-- Va en una transacción con `lock_timeout`, y termina con un comprobador que la
-- aborta si alguna clave foránea del módulo no queda cubierta entera.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Índice que cubre la clave compuesta entera (se crea antes de quitar el viejo).
create index pdm_reportes_corrige_idx2 on public.pdm_reportes (corrige_a, indicador_id);
drop index public.pdm_reportes_corrige_idx;
alter index public.pdm_reportes_corrige_idx2 rename to pdm_reportes_corrige_idx;

-- 2. Lo que decía el archivo en «Funcionario Responsable».
alter table public.pdm_indicadores add column responsable_origen text;
comment on column public.pdm_indicadores.responsable_origen is
  'Texto original de «Funcionario Responsable» en el Excel de la Alcaldía (una persona, un equipo, una oficina, varias personas o nada). Es información del plan, no seguimiento; las asignaciones reales viven en pdm_asignaciones.';

-- Comprobación: toda clave foránea de pdm_* queda cubierta ENTERA, en orden, por algún índice.
do $$
declare
  v_malas text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ') into v_malas
  from pg_constraint c
  where c.contype = 'f'
    and c.conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace and relname like 'pdm\_%')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and array_to_string((i.indkey::int2[])[0:array_length(c.conkey, 1) - 1], ',') = array_to_string(c.conkey, ',')
    );
  if v_malas is not null then raise exception 'PDM: clave foránea sin índice que la cubra entera: %', v_malas; end if;
end $$;

commit;

-- ─── PARA REVERTIR (no forma parte de la migración) ─────────────────────────
--
--   begin;
--   alter table public.pdm_indicadores drop column responsable_origen;
--   commit;
--
-- (El índice compuesto es estrictamente mejor que el de una columna: no hace falta volver atrás.)
