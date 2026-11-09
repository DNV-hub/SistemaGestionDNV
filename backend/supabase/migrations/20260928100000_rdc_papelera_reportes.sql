-- Papelera para reportes del RDC.
--
-- POR QUÉ: un reporte de Yeampier Pariente (OPB, 26/09) que ya estaba
-- FINALIZADO y enviado a SharePoint se veía en el Sistema como Borrador —
-- por un bug de sincronización que no logró confirmarse con el detalle
-- exacto, porque una vez borrado no quedó ningún rastro del detalle (la
-- auditoría de rdc_reportes solo guarda la cabecera). Alguien lo confundió
-- con basura y lo borró con el flujo normal de "borrar borrador", que hasta
-- ahora era un DELETE real. Hubo que reconstruirlo a mano desde el Excel.
--
-- De acá en adelante, "borrar un borrador" (desde el propio supervisor o
-- desde la herramienta de Developer) deja de ser un DELETE: pasa a ser un
-- archivado reversible. Nada se pierde para siempre salvo que alguien, ya
-- viendo la papelera, decida vaciarla a propósito.

alter table rdc_reportes add column eliminado_at timestamptz;
alter table rdc_reportes add column eliminado_por uuid references usuarios(id);

create index idx_rdc_reportes_eliminado on rdc_reportes(eliminado_at) where eliminado_at is not null;

-- `eliminado_por` no se confía al cliente: lo llena solo un trigger, a partir
-- de quién está autenticado en el momento del archivado/restauración — igual
-- de espíritu que `creado_por` en el INSERT, pero por trigger en vez de RLS
-- porque acá no hay un `with check` de por medio (ver política más abajo).
create or replace function public.fn_rdc_reportes_marcar_archivado()
returns trigger
language plpgsql
as $$
begin
  if new.eliminado_at is distinct from old.eliminado_at then
    new.eliminado_por := case when new.eliminado_at is not null then auth.uid() else null end;
  end if;
  return new;
end;
$$;

create trigger trg_rdc_reportes_marcar_archivado
  before update on rdc_reportes
  for each row execute function public.fn_rdc_reportes_marcar_archivado();

-- ---------------------------------------------------------------------------
-- La clave de negocio (un supervisor no puede tener dos reportes para el
-- mismo frente en la misma fecha) solo debe regir entre reportes VIGENTES:
-- si el de hoy se archivó por error de sincronización (el caso que motiva
-- esta migración), el supervisor tiene que poder crear uno nuevo para esa
-- misma fecha sin que un fantasma en la papelera se lo impida. Se mantiene
-- el MISMO NOMBRE del constraint original (ahora un índice parcial, no un
-- constraint de tabla, porque Postgres no admite UNIQUE ... WHERE como
-- constraint) para que rdcErrores.js, que reconoce el error de duplicado por
-- ese nombre exacto, no necesite tocarse.
alter table rdc_reportes drop constraint rdc_reportes_supervisor_id_frente_id_fecha_key;

create unique index rdc_reportes_supervisor_id_frente_id_fecha_key
  on rdc_reportes (supervisor_id, frente_id, fecha)
  where eliminado_at is null;

-- ---------------------------------------------------------------------------
-- RLS: un reporte archivado deja de ser visible por las políticas normales
-- (select/update de siempre) y pasa a vivir en una "papelera" que solo puede
-- ver y tocar quien ya podía borrar ese borrador antes de esta migración
-- (su propio autor, el supervisor responsable, o rdc.editar_todos).
-- ---------------------------------------------------------------------------
drop policy rdc_reportes_select on rdc_reportes;

create policy rdc_reportes_select on rdc_reportes for select
  using (
    eliminado_at is null
    and (
      public.has_permission('rdc.ver_todos')
      or (
        public.has_permission('rdc.ver_propios')
        and (creado_por = auth.uid() or supervisor_id = public.rdc_supervisor_id())
      )
    )
  );

create policy rdc_reportes_select_papelera on rdc_reportes for select
  using (
    eliminado_at is not null
    and (
      public.has_permission('rdc.editar_todos')
      or creado_por = auth.uid()
      or supervisor_id = public.rdc_supervisor_id()
    )
  );

-- Archivar y restaurar son la MISMA operación de UPDATE (poner o quitar
-- eliminado_at) — mismas condiciones que tenía la vieja política de DELETE
-- (20260914100000): solo sobre un Borrador, y solo su autor, el supervisor
-- del frente, o quien tenga rdc.editar_todos. Es una política ADICIONAL y
-- permisiva sobre UPDATE (Postgres combina el `using`/`with check` de varias
-- políticas permisivas del mismo comando con OR), así que no reemplaza ni
-- angosta la política rdc_reportes_update ya existente para correcciones.
create policy rdc_reportes_archivar on rdc_reportes for update
  using (
    estado = 'Borrador'
    and (
      public.has_permission('rdc.editar_todos')
      or creado_por = auth.uid()
      or supervisor_id = public.rdc_supervisor_id()
    )
  )
  with check (
    estado = 'Borrador'
    and (
      public.has_permission('rdc.editar_todos')
      or creado_por = auth.uid()
      or supervisor_id = public.rdc_supervisor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Herramienta de Developer: reemplaza el DELETE real de
-- fn_borrar_reporte_rdc_prueba por tres pasos explícitos y reversibles.
-- fn_purgar_reporte_rdc es la única que de verdad borra, y solo puede
-- aplicarse a algo que YA está en la papelera — no se puede pasar de
-- "vigente" a "borrado para siempre" en un solo paso nunca más.
-- ---------------------------------------------------------------------------
drop function if exists public.fn_borrar_reporte_rdc_prueba(uuid);

create or replace function public.fn_archivar_reporte_rdc(p_reporte_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para archivar reportes del RDC (sistema.borrar_pruebas)';
  end if;

  update rdc_reportes set eliminado_at = now() where id = p_reporte_id and eliminado_at is null;
end;
$$;

create or replace function public.fn_restaurar_reporte_rdc(p_reporte_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para restaurar reportes del RDC (sistema.borrar_pruebas)';
  end if;

  update rdc_reportes set eliminado_at = null where id = p_reporte_id;
end;
$$;

create or replace function public.fn_purgar_reporte_rdc(p_reporte_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('sistema.borrar_pruebas') then
    raise exception 'No tiene permiso para eliminar definitivamente reportes del RDC (sistema.borrar_pruebas)';
  end if;

  delete from rdc_reportes where id = p_reporte_id and eliminado_at is not null;
end;
$$;

grant execute on function public.fn_archivar_reporte_rdc(uuid) to authenticated;
grant execute on function public.fn_restaurar_reporte_rdc(uuid) to authenticated;
grant execute on function public.fn_purgar_reporte_rdc(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dos lecturas security-definer que consultan rdc_reportes directamente (no
-- pasan por rdc_reportes_select): sin este filtro, un reporte archivado
-- seguiría apareciendo como "el más reciente" en Frentes en campo o como una
-- fila más en el Mapa de Actividad.
-- ---------------------------------------------------------------------------
create or replace function public.fn_dashboard_frentes_en_campo(p_desde date, p_hasta date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_resultado jsonb;
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el resumen de campo (rdc.ver_resumen_campo)';
  end if;

  with vigentes as (
    select distinct on (r.frente_id)
      r.id, r.fecha, r.frente_id, r.supervisor_id, r.capataz_id,
      r.restriccion_acceso, r.restriccion_descripcion, r.restriccion_inicio, r.restriccion_fin
    from rdc_reportes r
    where r.fecha >= p_desde
      and (p_hasta is null or r.fecha <= p_hasta)
      and r.eliminado_at is null
    order by r.frente_id, r.fecha desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'frente', jsonb_build_object('id', f.id, 'codigo', f.codigo, 'nombre', f.nombre),
        'fecha', v.fecha,
        'supervisor', coalesce(s.nombre, '—'),
        'capataz', c.nombre,
        'personal', coalesce(pj.personal, '[]'::jsonb),
        'maquinaria', coalesce(mj.maquinaria, '[]'::jsonb),
        'restriccion', case
          when v.restriccion_acceso then
            jsonb_build_object('descripcion', v.restriccion_descripcion, 'inicio', v.restriccion_inicio, 'fin', v.restriccion_fin)
          else null
        end
      )
      order by coalesce(f.codigo, f.nombre)
    ),
    '[]'::jsonb
  )
  into v_resultado
  from vigentes v
  join frentes f on f.id = v.frente_id
  left join rdc_supervisores s on s.id = v.supervisor_id
  left join rdc_capataces c on c.id = v.capataz_id
  left join lateral (
    select jsonb_agg(jsonb_build_object('categoria', p.categoria, 'tipo', p.tipo, 'cantidad', p.cantidad)) as personal
    from rdc_reporte_personal p
    where p.reporte_id = v.id
  ) pj on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'categoria', m.categoria, 'cantidad', m.cantidad)) as maquinaria
    from rdc_reporte_maquinaria m
    where m.reporte_id = v.id
  ) mj on true;

  return v_resultado;
end;
$$;

create or replace function public.fn_dashboard_mapa_actividad(p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_resultado jsonb;
begin
  if not public.has_permission('rdc.ver_resumen_campo') then
    raise exception 'No tiene permiso para ver el mapa de actividad (rdc.ver_resumen_campo)';
  end if;

  select jsonb_build_object(
    'frentes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id, 'codigo', f.codigo, 'nombre', f.nombre, 'estado', f.estado,
          'contrato_id', f.contrato_id, 'contrato_nombre', c.nombre
        )
        order by coalesce(f.codigo, f.nombre)
      )
      from frentes f
      left join contratos c on c.id = f.contrato_id
    ), '[]'::jsonb),
    'reportes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'frente_id', r.frente_id,
        'fecha', r.fecha,
        'supervisor_id', r.supervisor_id,
        'supervisor', coalesce(s.nombre, '—'),
        'supervisor_color', s.color,
        'capataz', c.nombre,
        'observaciones', r.observaciones
      ))
      from rdc_reportes r
      left join rdc_supervisores s on s.id = r.supervisor_id
      left join rdc_capataces c on c.id = r.capataz_id
      where r.fecha between p_desde and p_hasta
        and r.eliminado_at is null
    ), '[]'::jsonb)
  )
  into v_resultado;

  return v_resultado;
end;
$$;
