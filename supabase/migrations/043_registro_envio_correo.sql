-- Registro del envío de correo en cada notificación.
--
-- Por qué: hasta ahora el sistema no guardaba NINGUNA señal de si el correo
-- de una notificación llegó a salir. Cuando la radicación rápida dejó de
-- notificar por correo, la fila de `notificaciones` existía igual, así que
-- desde los datos era imposible distinguir «se envió» de «se rechazó»: el
-- fallo pasó semanas inadvertido y no había forma de saber a quién le faltaba
-- el aviso. Estas columnas convierten eso en un dato consultable.
--
-- `notificaciones` no tiene permisos por columna (0 columnas con ACL al
-- crear esta migración), así que no hace falta GRANT por columna — ver la
-- regla 2 de CLAUDE.md. Se comprueba igual antes de cada cambio futuro.

alter table public.notificaciones
  add column if not exists email_estado text
    check (email_estado in ('enviado', 'omitido', 'fallido')),
  add column if not exists email_id      text,
  add column if not exists email_error   text,
  add column if not exists email_at      timestamptz;

comment on column public.notificaciones.email_estado is
  'enviado = Resend lo aceptó; omitido = sin correo real o canal desactivado; '
  'fallido = rechazado o excepción. NULL = anterior a esta migración, se desconoce.';
comment on column public.notificaciones.email_id is 'Id que devuelve Resend, para rastrear el envío en su panel.';
comment on column public.notificaciones.email_error is 'Motivo del fallo, para diagnosticar sin depender de los registros de Vercel.';

-- Búsqueda de pendientes por tipo: la usa el reenvío de avisos faltantes.
create index if not exists notificaciones_email_estado_idx
  on public.notificaciones (tipo, email_estado);
