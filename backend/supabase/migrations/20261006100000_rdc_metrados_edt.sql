-- Fase 3: liga por primera vez el metrado diario del RDC con
-- rdc_partidas_edt (hasta ahora esa tabla solo alimentaba un dropdown de
-- sugerencia en "Programar mañana", sin relación real con lo reportado).
--
-- Solo las partidas tipo_medicion='digitado' usan esta tabla nueva — el
-- supervisor tipea la cantidad de hoy para esa partida. Las derivadas
-- (conteo_pernos/suma_panos_malla/suma_tramos_cable) NO guardan nada acá:
-- se calculan agregando rdc_reporte_elementos al vuelo, filtrado por
-- zona_filtro/tipo_filtro — mismo criterio que ya corrigió el bug de sumar
-- mallas/cables de tipos distintos (20261003130000).
--
-- No se reusa rdc_reporte_metrados (bloques 1/3 del RDC): su FK a
-- rdc_partidas_estandar es NOT NULL por diseño para esos bloques
-- (rdc_reporte_metrados_codigo_por_bloque) — mezclar el catálogo EDT ahí
-- rompería esa restricción.
--
-- Reversible: drop function fn_rdc_acumulado_edt(uuid,date); drop table
-- rdc_reporte_metrados_edt.
create table rdc_reporte_metrados_edt (
  id uuid primary key default gen_random_uuid(),
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  partida_edt_id uuid not null references rdc_partidas_edt(id),
  cantidad numeric(14,3) not null check (cantidad >= 0),
  orden int,
  unique (reporte_id, partida_edt_id)
);
create index idx_rdc_reporte_metrados_edt_reporte on rdc_reporte_metrados_edt(reporte_id);

alter table rdc_reporte_metrados_edt enable row level security;
create policy rdc_reporte_metrados_edt_select on rdc_reporte_metrados_edt for select
  using (public.rdc_puede_ver_reporte(reporte_id));
create policy rdc_reporte_metrados_edt_write on rdc_reporte_metrados_edt for all
  using (public.rdc_puede_editar_reporte(reporte_id))
  with check (public.rdc_puede_editar_reporte(reporte_id));

-- Acumulado unificado de los 4 tipos de medición hasta una fecha (por
-- defecto, ayer). Esta versión (Fase 3) cuenta TODO lo reportado, sin
-- filtrar por confirmación — Fase 4 reemplaza esta misma función (misma
-- firma) para que el "acumulado oficial" cuente solo lo confirmado/
-- corregido. Acepta p_frente_id null para la descarga masiva de catálogos
-- del RDC (mismo patrón que fn_rdc_pernos_estado/malla/cable), devolviendo
-- frente_id en el resultado para poder agrupar del lado del cliente.
create or replace function public.fn_rdc_acumulado_edt(p_frente_id uuid default null, p_hasta date default current_date - 1)
returns table (frente_id uuid, partida_edt_id uuid, previsto numeric, acumulado numeric, saldo numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_propios') and not public.has_permission('rdc.ver_todos') then
    raise exception 'No tiene permiso para ver metrados';
  end if;

  return query
  with digitado as (
    select r.frente_id, m.partida_edt_id, sum(m.cantidad) as cantidad
    from rdc_reporte_metrados_edt m
    join rdc_reportes r on r.id = m.reporte_id
    where r.fecha <= p_hasta and r.eliminado_at is null
      and (p_frente_id is null or r.frente_id = p_frente_id)
    group by r.frente_id, m.partida_edt_id
  ), derivado as (
    -- e.cantidad ya es el m2/ML directo para Malla/Cable (misma convención
    -- que fn_rdc_malla_estado/fn_rdc_cable_estado) — no usar e.area_m2.
    select p.frente_id, p.id as partida_edt_id, sum(
      case
        when p.tipo_medicion = 'conteo_pernos' then 1
        else e.cantidad
      end
    ) as cantidad
    from rdc_partidas_edt p
    join rdc_reporte_elementos e on
      (p.tipo_medicion = 'conteo_pernos' and e.elemento = 'Perno' and e.actividad = 'Perforación')
      or (p.tipo_medicion = 'suma_panos_malla' and e.elemento = 'Malla' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro)))
      or (p.tipo_medicion = 'suma_tramos_cable' and e.elemento = 'Cable' and e.actividad = 'Instalación'
          and upper(btrim(e.tipo)) = upper(btrim(p.tipo_filtro)))
    join rdc_reportes r on r.id = e.reporte_id
    where r.fecha <= p_hasta and r.eliminado_at is null
      and (p.zona_filtro is null or e.zona = p.zona_filtro)
      and p.tipo_medicion in ('conteo_pernos', 'suma_panos_malla', 'suma_tramos_cable')
      and (p_frente_id is null or p.frente_id = p_frente_id)
    group by p.frente_id, p.id
  )
  select p.frente_id, p.id, p.metrado_previsto,
         coalesce(d.cantidad, der.cantidad, 0),
         p.metrado_previsto - coalesce(d.cantidad, der.cantidad, 0)
  from rdc_partidas_edt p
  left join digitado d on d.partida_edt_id = p.id
  left join derivado der on der.partida_edt_id = p.id
  where p.activo and (p_frente_id is null or p.frente_id = p_frente_id);
end;
$$;
grant execute on function public.fn_rdc_acumulado_edt(uuid, date) to authenticated;
