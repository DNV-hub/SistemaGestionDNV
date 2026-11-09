-- Una línea de vale rechazada (Almacén decidió no entregar ese material) no
-- debe impedir que el vale llegue a "Atendido". Antes solo se excluían las
-- líneas Canceladas del conteo, así que un vale con una línea rechazada y
-- todas las demás entregadas se quedaba en "Parcialmente atendido" para
-- siempre.
create or replace function public.fn_actualizar_estado_vale(p_vale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_entregadas int;
begin
  select count(*), count(*) filter (where estado = 'Entregado')
    into v_total, v_entregadas
  from vale_detalle
  where vale_id = p_vale_id and estado not in ('Cancelado', 'Rechazado');

  if v_total = 0 then
    return;
  end if;

  if v_entregadas = v_total then
    update vales set estado = 'Atendido' where id = p_vale_id and estado <> 'Cerrado';
  elsif v_entregadas > 0 then
    update vales set estado = 'Parcialmente atendido' where id = p_vale_id and estado <> 'Cerrado';
  end if;
end;
$$;

-- Corrige los vales que ya quedaron trabados por este motivo.
select public.fn_actualizar_estado_vale(id) from vales where estado = 'Parcialmente atendido';
