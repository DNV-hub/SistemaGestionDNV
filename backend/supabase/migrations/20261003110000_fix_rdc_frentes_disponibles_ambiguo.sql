-- Bug real, reportado en vivo: "column reference "id" is ambiguous" al abrir
-- "Avance de sostenimiento". La función declara RETURNS TABLE(id uuid, ...),
-- y ese `id` de salida queda como variable implícita en todo el cuerpo de la
-- función — adentro de la subconsulta `select frente_id from usuarios where
-- id = auth.uid()`, ese `id` sin calificar podía ser tanto `usuarios.id` como
-- la variable de salida de la función, y Postgres no podía decidir cuál.
-- Se corrige calificando la columna de la tabla explícitamente.
create or replace function public.fn_rdc_frentes_disponibles()
returns table (id uuid, codigo text, nombre text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el avance de sostenimiento (rdc.ver_resumen_campo)';
  end if;

  if public.has_permission('rdc.ver_todos') then
    return query select f.id, f.codigo, f.nombre from frentes f where f.rdc_control_pernos order by f.nombre;
  end if;

  return query
  select distinct f.id, f.codigo, f.nombre
  from frentes f
  where f.rdc_control_pernos
    and (
      f.id = (select u.frente_id from usuarios u where u.id = auth.uid())
      or exists (
        select 1 from rdc_reportes r
        where r.frente_id = f.id and r.eliminado_at is null
          and (r.creado_por = auth.uid() or r.supervisor_id = public.rdc_supervisor_id())
      )
    )
  order by f.nombre;
end;
$$;
