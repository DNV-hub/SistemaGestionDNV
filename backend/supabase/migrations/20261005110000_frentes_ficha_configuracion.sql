-- Fase 2 de la ficha de frente: columnas nuevas para la pestaña
-- Configuración. Reversible: todas son nullable o con default seguro, así
-- que un rollback es `alter table frentes drop column ...` sin pérdida de
-- datos para los frentes que no usan lo nuevo — igual que ya pasa con
-- `rdc_control_pernos` hoy.
alter table frentes
  add column tipo_rd text not null default 'S' check (tipo_rd in ('S', 'P')),
  add column rd_padre_id uuid references frentes(id),
  add column residente_id uuid references usuarios(id),
  add column rdc_dias_ambar int check (rdc_dias_ambar > 0),
  add column rdc_dias_rojo int check (rdc_dias_rojo > rdc_dias_ambar),
  add column carpeta_fotos text,
  add column mapa_sector_url text,
  add column firma_residente_url text;

-- Reglas de integridad del multifrente (RD P con varios RD S agrupados):
-- un check normal no puede hacer subconsultas, por eso es un trigger.
-- Reversible: drop trigger trg_frentes_validar_rd_padre on frentes; drop
-- function public.fn_frentes_validar_rd_padre();
create or replace function public.fn_frentes_validar_rd_padre()
returns trigger
language plpgsql
as $$
begin
  if new.rd_padre_id is not null then
    if new.rd_padre_id = new.id then
      raise exception 'Un frente no puede ser su propio RD P';
    end if;
    if new.tipo_rd <> 'S' then
      raise exception 'Solo un frente tipo S (secundario) puede agruparse bajo un RD P';
    end if;
    if not exists (select 1 from frentes p where p.id = new.rd_padre_id and p.tipo_rd = 'P') then
      raise exception 'El RD padre debe ser un frente tipo P (principal)';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_frentes_validar_rd_padre
  before insert or update on frentes
  for each row execute function public.fn_frentes_validar_rd_padre();

-- Umbrales ámbar/rojo que aplican a un frente: el propio (si lo configuró)
-- o si no, el global de `configuracion` (rdc_avance_dias_ambar/rojo, el
-- mismo que ya usa Control de sostenimiento hoy) — una sola función para
-- no repetir ese fallback en cada lugar que lo necesite.
create or replace function public.fn_rdc_umbrales(p_frente_id uuid)
returns table (dias_ambar int, dias_rojo int)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(f.rdc_dias_ambar, (select (valor #>> '{}')::int from configuracion where clave = 'rdc_avance_dias_ambar'), 3),
    coalesce(f.rdc_dias_rojo,  (select (valor #>> '{}')::int from configuracion where clave = 'rdc_avance_dias_rojo'), 7)
  from frentes f where f.id = p_frente_id;
$$;
grant execute on function public.fn_rdc_umbrales(uuid) to authenticated;

-- rdc_partidas_edt: tipo de medición (cómo se calcula el acumulado de cada
-- partida) + filtros zona/tipo para que "suma de paños de malla"/"suma de
-- tramos de cable" sepan de qué subconjunto exacto de rdc_reporte_elementos
-- leer — mismo criterio zona+tipo que ya corrigió el bug de mezclar mallas/
-- cables de tipos distintos entre sí (ver 20261003130000). "Previsto" y
-- "rendimiento de referencia" son las columnas que le faltaban a esta tabla
-- para que el pedido del usuario (Fase 3/4: acumulado, alertas de
-- rendimiento) tenga de dónde leer. Reversible: alter table
-- rdc_partidas_edt drop column ... (todas nullable o con default).
alter table rdc_partidas_edt
  add column metrado_previsto numeric(14,3),
  add column tipo_medicion text not null default 'digitado'
    check (tipo_medicion in ('digitado', 'conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable')),
  add column zona_filtro text,
  add column tipo_filtro text,
  add column rendimiento_cantidad numeric(10,2),
  add column rendimiento_minimo numeric(10,2),
  add column rendimiento_maximo numeric(10,2),
  add constraint rdc_partidas_edt_filtro_obligatorio check (
    tipo_medicion not in ('suma_panos_malla', 'suma_tramos_cable') or tipo_filtro is not null
  );
