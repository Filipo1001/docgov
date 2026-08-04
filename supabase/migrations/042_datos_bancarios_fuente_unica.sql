-- 042 — Los datos bancarios viven solo en `usuarios`
--
-- `contratos` tenía copia de banco, tipo_cuenta y numero_cuenta. En producción
-- 56 de 115 contratos estaban desincronizados con la ficha de su contratista:
-- 48 con la copia vacía y 4 con un número de cuenta DISTINTO.
--
-- No llegó a producir documentos equivocados porque el generador de PDF ya
-- prefería el dato del usuario, pero sí dejaba una segunda copia que cualquier
-- consulta futura podía leer por error — y de hecho una ruta lo hacía.
--
-- La cuenta bancaria es un dato de la PERSONA, no del contrato: si cambia de
-- banco, cambia para todos sus contratos a la vez.

-- 1. Red de seguridad: si algún contrato tuviera el dato y el usuario no, se
--    conserva antes de limpiar. (Medido: 0 casos, pero el orden importa.)
UPDATE usuarios u
   SET banco         = COALESCE(u.banco,         c.banco),
       tipo_cuenta   = COALESCE(u.tipo_cuenta,   c.tipo_cuenta),
       numero_cuenta = COALESCE(u.numero_cuenta, c.numero_cuenta)
  FROM contratos c
 WHERE c.contratista_id = u.id
   AND (u.banco IS NULL OR u.tipo_cuenta IS NULL OR u.numero_cuenta IS NULL);

-- 2. Se elimina la copia. Las columnas se conservan para no romper consultas
--    con select('*'), pero quedan vacías y marcadas como obsoletas.
UPDATE contratos SET banco = NULL, tipo_cuenta = NULL, numero_cuenta = NULL;

COMMENT ON COLUMN contratos.banco IS
  'OBSOLETA — la cuenta bancaria vive en usuarios. No escribir ni leer aquí.';
COMMENT ON COLUMN contratos.tipo_cuenta IS
  'OBSOLETA — la cuenta bancaria vive en usuarios. No escribir ni leer aquí.';
COMMENT ON COLUMN contratos.numero_cuenta IS
  'OBSOLETA — la cuenta bancaria vive en usuarios. No escribir ni leer aquí.';
