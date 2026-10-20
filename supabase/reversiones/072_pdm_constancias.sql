-- Reversión de la migración 072 (constancias de reportes y verificación pública por QR).
--
-- Se NIEGA si ya hay constancias: cada una es el código de un QR que pudo imprimirse, y quitarle su código haría que ese
-- papel dejara de verificarse (regla 1 de CLAUDE.md: lo emitido tiene que seguir resolviendo). Con la tabla vacía no hay
-- nada impreso y se puede quitar todo sin consecuencias.

begin;

set local lock_timeout = '3s';

do $$
begin
  if exists (select 1 from public.pdm_constancias) then
    raise exception 'PDM 072 (reversión): ya hay constancias emitidas; sus QR pueden estar impresos. No se revierte.';
  end if;
end $$;

drop function if exists public.pdm_constancia_publica(text);
drop function if exists public.pdm_constancia_emitir(uuid, text);
drop table if exists public.pdm_constancias;
drop function if exists pdm_privado.proteger_constancia();

commit;
