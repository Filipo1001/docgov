-- 035 — Unificación: "Secretaría de Planeación" → "Secretaría de Desarrollo Territorial"
--
-- Institucionalmente son UNA sola dependencia; el sistema las tenía separadas.
-- La evidencia lo confirmaba: los 18 contratos de Desarrollo Territorial ya los
-- supervisaba el titular cuya ficha lo ubicaba en Planeación.
--
-- Planeación no tenía contratos asociados, solo ese usuario, así que la fusión
-- no altera ningún contrato existente.
--
-- Idempotente: si Planeación ya no existe, no hace nada.

DO $$
DECLARE
  v_destino uuid;
  v_origen  uuid;
BEGIN
  SELECT id INTO v_destino FROM dependencias WHERE nombre = 'Secretaría de Desarrollo Territorial';
  SELECT id INTO v_origen  FROM dependencias WHERE nombre = 'Secretaría de Planeación';

  IF v_origen IS NULL OR v_destino IS NULL THEN
    RAISE NOTICE 'Nada que unificar (origen o destino inexistente)';
    RETURN;
  END IF;

  -- Reasignar todo lo que apunte a la dependencia absorbida.
  UPDATE contratos SET dependencia_id = v_destino WHERE dependencia_id = v_origen;
  UPDATE usuarios  SET dependencia_id = v_destino WHERE dependencia_id = v_origen;

  -- El cargo del titular se imprime en los documentos generados: si la
  -- dependencia deja de llamarse Planeación, su cargo tampoco puede.
  -- Los PDF ya sellados conservan el texto anterior — que es lo correcto:
  -- un documento firmado no se reescribe.
  UPDATE usuarios
     SET cargo = 'SECRETARIO DE DESARROLLO TERRITORIAL'
   WHERE dependencia_id = v_destino
     AND rol = 'supervisor'
     AND cargo ILIKE '%PLANEACI%';

  DELETE FROM dependencias WHERE id = v_origen;
END $$;

-- Desarrollo Territorial no tenía abreviatura; el resto de secretarías sí y se
-- usa en los encabezados de documento.
UPDATE dependencias
   SET abreviatura = 'SDT'
 WHERE nombre = 'Secretaría de Desarrollo Territorial'
   AND abreviatura IS NULL;
