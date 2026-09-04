-- Extensiones y utilidades genéricas, sin dependencia de ninguna tabla del dominio.
-- Ver docs/MODELO_DATOS_Y_FLUJOS.md para el modelo completo.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger genérico: mantiene updated_at en cada UPDATE. Se adjunta tabla por tabla.';
