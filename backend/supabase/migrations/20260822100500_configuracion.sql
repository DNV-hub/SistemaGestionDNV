-- Parámetros ajustables sin migración (§6.4 y §6.5 aprobados).
create table configuracion (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  updated_at timestamptz not null default now(),
  actualizado_por uuid references usuarios(id)
);

create trigger trg_configuracion_updated_at
  before update on configuracion
  for each row execute function public.set_updated_at();

insert into configuracion (clave, valor, descripcion) values
  ('umbral_riesgo_sobreconsumo', '90',
   'Porcentaje de consumo (entregado/previsto) desde el cual se genera la alerta de riesgo de sobreconsumo.'),
  ('dias_reserva_prolongada', '15',
   'Días de antigüedad de una reserva Activa/Parcial sin completarse antes de generar la alerta de reserva prolongada.');
