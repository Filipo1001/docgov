-- Migration 080: Contratista Digital — el estado «anulado» de un periodo (primera mitad de la terminación anticipada)
--
-- POR QUÉ VA SOLA. Postgres no deja USAR un valor nuevo de un enum en la misma transacción que lo crea («unsafe use of
-- new value»). La 081 —la terminación anticipada— anula los periodos posteriores a la terminación y sus comprobaciones
-- lo usan, así que el valor tiene que existir y estar confirmado antes. Por eso esta migración no hace nada más.
--
-- ES INERTE. Agregar un valor al final de `estado_periodo` no cambia ninguna fila, ninguna función ni ningún permiso:
-- hasta que se aplique la 081 nadie escribe «anulado» (y después, solo las funciones de la terminación: ver la 081).
-- El código publicado no lo conoce y no lo necesita, porque ningún periodo lo tiene.
--
-- QUÉ SIGNIFICA. Un periodo que ya no corresponde porque el contrato terminó antes de que empezara. No se borra: queda
-- a la vista, con lo que alguien haya alcanzado a escribir, para poder deshacer la terminación si se registró por error.
-- Ninguna lista de pendientes ni ningún recordatorio lo ve, porque todos filtran por su estado (`borrador`, `enviado`…).
--
-- PARA REVERTIR: Postgres no quita valores de un enum. Si no se aplicó la 081, el valor sobra pero no estorba; si se
-- aplicó, primero se revierte la 081 (ver supabase/reversiones/081_…).

alter type public.estado_periodo add value if not exists 'anulado';
