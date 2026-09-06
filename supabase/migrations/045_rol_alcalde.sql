-- 045_rol_alcalde.sql
--
-- Nuevo rol `alcalde`: lectura agregada, sin participación en el trámite.
--
-- No lleva políticas RLS propias a propósito. El alcalde no consulta tablas
-- fila a fila: su pantalla la arma `getResumenAlcalde()` en el servidor, que
-- agrega con el cliente de administración y devuelve totales. Darle acceso
-- de lectura a `periodos`, `contratos` o `usuarios` le abriría datos
-- personales —cédulas, cuentas bancarias, teléfonos— que su vista no muestra
-- ni necesita.
--
-- Lo único que sí necesita es leer su propia fila de `usuarios` para iniciar
-- sesión, y esa política ya existe y no depende del rol.
--
-- ADD VALUE va solo en esta migración: Postgres no permite usar un valor de
-- enum en la misma transacción en que se añade.

alter type rol_usuario add value if not exists 'alcalde';
