-- 064 — Varias actas de terminación por contrato (parte 2 de 2)
--
-- ⚠ APLICAR DESPUÉS de desplegar el código que acompaña a la 063. El código anterior hace
-- `upsert … onConflict: 'contrato_id'` al aceptar el acta, y eso necesita la restricción única que esta migración
-- reemplaza: con ella relajada y el código viejo, la aceptación del acta fallaría.
--
-- Hasta hoy el acta era única por contrato (`UNIQUE (contrato_id)`). Con la vigencia (063) lo que debe ser único es el
-- acta VIGENTE: un contrato puede conservar actas anteriores «sin efecto» y tener una nueva vigente. Ninguna fila
-- existente cambia: todas son 'vigente' y hay una sola por contrato.
--
-- Reversión: ver supabase/reversiones/064_acta_terminacion_varias_por_contrato.sql (solo posible mientras ningún
-- contrato tenga más de un acta).

alter table public.actas_terminacion drop constraint if exists actas_terminacion_contrato_unico;

create unique index if not exists actas_terminacion_vigente_unica
  on public.actas_terminacion (contrato_id) where vigencia = 'vigente';
