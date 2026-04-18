-- Migration 016: Allow admin backfill on historical periods
--
-- The original trigger blocks ALL updates on es_historico=true periods,
-- including service_role calls from server actions.
--
-- We relax it to allow changes to data-only fields:
--   numero_planilla, planilla_ss_url, planilla_estado, planilla_comentario,
--   valor_cobro, numero_radicado
--
-- Core workflow fields (estado, mes, anio, fecha_inicio, fecha_fin,
-- numero_periodo, contrato_id, motivo_rechazo) remain immutable.

CREATE OR REPLACE FUNCTION prevent_historico_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.es_historico = true AND NEW.es_historico = true THEN
    -- Allow backfill of planilla / payment data on historical periods.
    -- Only block if any workflow-critical field is being changed.
    IF (
      NEW.estado           IS NOT DISTINCT FROM OLD.estado           AND
      NEW.numero_periodo   IS NOT DISTINCT FROM OLD.numero_periodo   AND
      NEW.mes              IS NOT DISTINCT FROM OLD.mes              AND
      NEW.anio             IS NOT DISTINCT FROM OLD.anio             AND
      NEW.fecha_inicio     IS NOT DISTINCT FROM OLD.fecha_inicio     AND
      NEW.fecha_fin        IS NOT DISTINCT FROM OLD.fecha_fin        AND
      NEW.contrato_id      IS NOT DISTINCT FROM OLD.contrato_id      AND
      NEW.motivo_rechazo   IS NOT DISTINCT FROM OLD.motivo_rechazo
    ) THEN
      -- Only data fields changed (planilla, valor, radicado) — allow it.
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No se puede modificar un periodo histórico (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
