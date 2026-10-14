-- REVERSIÓN de 064_acta_terminacion_varias_por_contrato.sql
--
-- Solo es posible mientras NINGÚN contrato tenga más de un acta: la restricción única por contrato no se puede
-- recrear si hay duplicados. Comprobar antes:
--   select contrato_id, count(*) from public.actas_terminacion group by 1 having count(*) > 1;
-- Si devuelve filas, hay actas «sin efecto» conservadas junto a una vigente: NO revertir; sería perder la historia.

drop index if exists public.actas_terminacion_vigente_unica;
alter table public.actas_terminacion add constraint actas_terminacion_contrato_unico unique (contrato_id);
