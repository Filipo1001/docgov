-- Migration 028: nuevo rol 'contratacion' en el enum.
-- Aditivo e inerte: ningún usuario lo tiene aún y ninguna policy lo referencia
-- todavía (las policies llegan en la migración siguiente — un valor de enum no
-- puede usarse en la misma transacción que lo crea).
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'contratacion';
