-- Vincula obligaciones al otrosí que las incorporó.
-- NULL = obligación original del contrato (aplica desde el inicio).
-- Con otrosi_id, data.ts filtra cada obligación para que solo aparezca en
-- los informes a partir de la fecha_inicio del otrosí correspondiente.

ALTER TABLE obligaciones
  ADD COLUMN IF NOT EXISTS otrosi_id UUID REFERENCES otrosies(id) ON DELETE SET NULL;
