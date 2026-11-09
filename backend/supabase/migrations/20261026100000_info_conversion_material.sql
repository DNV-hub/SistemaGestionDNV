-- Para transferir "2 ML de una barra de 5 m" el formulario necesita saber
-- cuánto mide cada unidad (factor de conversión del ingreso más reciente, el
-- mismo criterio que usa Procura vs consumo). Un supervisor no tiene
-- stock.ver (no puede leer `ingresos`), así que se expone solo este dato.
-- Reversible: drop function public.fn_info_conversion_material(uuid);
create or replace function public.fn_info_conversion_material(p_material_id uuid)
returns table (tipo_conversion text, factor numeric, unidad_edp text)
language sql
stable
security definer
set search_path = public
as $$
  select m.tipo_conversion,
         (select i.factor_conversion from ingresos i
           where i.material_id = m.id and i.factor_conversion is not null
           order by i.fecha desc, i.created_at desc limit 1),
         m.unidad_edp
    from materiales m
   where m.id = p_material_id
     and (public.has_permission('transferencias.crear')
          or public.has_permission('vales.crear')
          or public.has_permission('stock.ver'));
$$;
grant execute on function public.fn_info_conversion_material(uuid) to authenticated;
