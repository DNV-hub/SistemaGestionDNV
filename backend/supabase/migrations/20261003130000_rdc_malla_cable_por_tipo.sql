-- Corrección de fondo, reportada en vivo por el usuario: sumar m² de malla
-- (o ML de cable) de TODO un frente no sirve para controlar el avance real
-- cuando ese frente tiene más de un tipo de malla/cable — una suma así
-- mezcla, por ejemplo, Tecco con Triple Torsión en un solo número sin
-- sentido. La hoja CONTROL_SOSTENIMIENTO del Excel (la que de verdad se usa
-- para controlar esto hoy) nunca agrega nada: es una fila por elemento, con
-- "Tipo" como columna propia (rdcExcel.js filasControl). Esta migración
-- alinea el módulo de Avance con ese mismo criterio:
--   - fn_rdc_malla_estado / fn_rdc_cable_estado ahora también exponen `tipo`
--     (la columna ya existía en rdc_reporte_elementos, solo faltaba
--     mostrarla) — el desglose por zona+tipo se arma en el cliente a partir
--     de esta lista plana, no hace falta otra función agregada para eso.
--   - fn_rdc_avance_conteo vuelve a ser solo de pernos (perforados/
--     inyectados/pendientes por zona): ahí sí tiene sentido un conteo, un
--     perno está perforado o no más allá de su diámetro/tipo. malla_m2/
--     cable_ml se retiran de esta función — ya no se van a mostrar como un
--     total ciego en ninguna parte.
-- Cambia la forma de RETURNS TABLE en los tres casos, así que hay que
-- borrarlas antes de recrearlas (CREATE OR REPLACE no admite cambiar las
-- columnas de salida de una función existente).
drop function if exists public.fn_rdc_malla_estado(uuid);
drop function if exists public.fn_rdc_cable_estado(uuid);
drop function if exists public.fn_rdc_avance_conteo(uuid);

create function public.fn_rdc_malla_estado(p_frente_id uuid default null)
returns table (
  frente_id uuid,
  zona text,
  tipo text,
  codigo text,
  codigo_norm text,
  area_m2 numeric,
  fecha date,
  reporte_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  return query
  select r.frente_id, e.zona, e.tipo, e.codigo, upper(btrim(e.codigo)), e.cantidad, r.fecha, e.reporte_id
  from rdc_reporte_elementos e
  join rdc_reportes r on r.id = e.reporte_id
  where e.elemento = 'Malla' and e.actividad = 'Instalación' and r.eliminado_at is null
    and e.codigo is not null
    and (p_frente_id is null or r.frente_id = p_frente_id)
    and exists (select 1 from frentes f where f.id = r.frente_id and f.rdc_control_pernos);
end;
$$;
grant execute on function public.fn_rdc_malla_estado(uuid) to authenticated;

create function public.fn_rdc_cable_estado(p_frente_id uuid default null)
returns table (
  frente_id uuid,
  zona text,
  tipo text,
  codigo text,
  longitud_ml numeric,
  fecha date,
  reporte_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  return query
  select r.frente_id, e.zona, e.tipo, e.codigo, e.cantidad, r.fecha, e.reporte_id
  from rdc_reporte_elementos e
  join rdc_reportes r on r.id = e.reporte_id
  where e.elemento = 'Cable' and e.actividad = 'Instalación' and r.eliminado_at is null
    and (p_frente_id is null or r.frente_id = p_frente_id)
    and exists (select 1 from frentes f where f.id = r.frente_id and f.rdc_control_pernos);
end;
$$;
grant execute on function public.fn_rdc_cable_estado(uuid) to authenticated;

create function public.fn_rdc_avance_conteo(p_frente_id uuid)
returns table (
  zona text,
  perforados int,
  inyectados int,
  pendientes int,
  pendiente_mas_antiguo date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  return query
  select
    e.zona,
    count(*)::int as perforados,
    count(*) filter (where e.estado = 'inyectado')::int as inyectados,
    count(*) filter (where e.estado = 'perforado')::int as pendientes,
    min(e.perforacion_fecha) filter (where e.estado = 'perforado') as pendiente_mas_antiguo
  from public.fn_rdc_pernos_estado(p_frente_id) e
  group by e.zona
  order by 1;
end;
$$;
grant execute on function public.fn_rdc_avance_conteo(uuid) to authenticated;
