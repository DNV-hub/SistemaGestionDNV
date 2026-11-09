-- Cambiar el código de un perno ya reportado (Control de sostenimiento).
--
-- Caso real (ZCM05): un supervisor reportó perforaciones e inyecciones con el
-- plano antiguo; con el plano nuevo los códigos cambiaron, pero el perno
-- físico es el mismo. Sin esta función el control de pernos bloquea el código
-- nuevo ("ya perforado") y no hay forma de corregir lo ya enviado: el editor
-- del reporte solo cambia ubicación/diámetro, y los reportes finalizados solo
-- se corrigen durante rdc_dias_correccion (7 días).
--
-- fn_rdc_renombrar_perno(frente, código actual, código nuevo, intercambiar):
--   * solo con rdc.editar_todos (Planeamiento / Administrador / Developer);
--   * el código nuevo TIENE que existir en la biblioteca de pernos del frente
--     (de ahí salen la ubicación, zona, sistema, plano y diámetro nuevos);
--   * cambia el código en TODAS las filas de ese perno (perforación,
--     inyección, pull test) de los reportes vigentes del frente;
--   * si el código nuevo ya lo tiene otro perno, se niega (CODIGO_EN_USO)
--     salvo p_intercambiar = true: entonces los dos se intercambian
--     (A→B y B→A) en una sola operación;
--   * deja constancia en auditoria (quién, cuándo, código viejo y nuevo).
-- No toca los Excel ya enviados a SharePoint: solo el dato dentro del Sistema.
--
-- Rollback manual: drop function public.fn_rdc_renombrar_perno(uuid, text, text, boolean);
-- (los códigos ya cambiados se pueden volver a cambiar con la misma función
-- antes de eliminarla, o desde la auditoría).

create or replace function public.fn_rdc_renombrar_perno(
  p_frente_id uuid,
  p_codigo_actual text,
  p_codigo_nuevo text,
  p_intercambiar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_act text := upper(btrim(coalesce(p_codigo_actual, '')));
  v_new text := upper(btrim(coalesce(p_codigo_nuevo, '')));
  v_bib_new rdc_pernos_biblioteca%rowtype;
  v_bib_act rdc_pernos_biblioteca%rowtype;
  v_en_uso boolean;
  v_filas int;
  v_filas_otro int := 0;
begin
  if not public.has_permission('rdc.editar_todos') then
    raise exception 'No tienes permiso para cambiar códigos de pernos ya reportados.';
  end if;
  if v_act = '' or v_new = '' then
    raise exception 'Indica el código actual y el código nuevo.';
  end if;
  if v_act = v_new then
    raise exception 'El código nuevo es igual al actual.';
  end if;

  select * into v_bib_new
  from rdc_pernos_biblioteca
  where frente_id = p_frente_id and upper(btrim(codigo)) = v_new
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'El código % no está en la biblioteca de pernos de este frente. Súbelo primero a la biblioteca.', btrim(p_codigo_nuevo);
  end if;

  if not exists (
    select 1 from rdc_reporte_elementos e join rdc_reportes r on r.id = e.reporte_id
    where r.frente_id = p_frente_id and r.eliminado_at is null
      and e.elemento = 'Perno' and upper(btrim(e.codigo)) = v_act
  ) then
    raise exception 'El código % no tiene reportes en este frente.', btrim(p_codigo_actual);
  end if;

  select exists (
    select 1 from rdc_reporte_elementos e join rdc_reportes r on r.id = e.reporte_id
    where r.frente_id = p_frente_id and r.eliminado_at is null
      and e.elemento = 'Perno' and upper(btrim(e.codigo)) = v_new
  ) into v_en_uso;

  if v_en_uso and not p_intercambiar then
    raise exception 'CODIGO_EN_USO: el código % ya está reportado por otro perno de este frente.', btrim(p_codigo_nuevo);
  end if;

  if v_en_uso then
    select * into v_bib_act
    from rdc_pernos_biblioteca
    where frente_id = p_frente_id and upper(btrim(codigo)) = v_act
    order by created_at desc
    limit 1;
    if not found then
      raise exception 'Para intercambiar, el código % también debe estar en la biblioteca de pernos.', btrim(p_codigo_actual);
    end if;

    -- 1) el perno que hoy tiene el código nuevo pasa a un marcador temporal
    update rdc_reporte_elementos e
       set codigo = '__INTERCAMBIO__' || e.id::text
      from rdc_reportes r
     where r.id = e.reporte_id and r.frente_id = p_frente_id and r.eliminado_at is null
       and e.elemento = 'Perno' and upper(btrim(e.codigo)) = v_new;
  end if;

  -- 2) el perno actual toma el código nuevo (y los datos de ese código en la biblioteca)
  update rdc_reporte_elementos e
     set codigo = btrim(v_bib_new.codigo),
         ubicacion = coalesce(v_bib_new.ubicacion, e.ubicacion),
         zona = coalesce(v_bib_new.zona, e.zona),
         sistema = coalesce(v_bib_new.sistema, e.sistema),
         plano = coalesce(v_bib_new.plano, e.plano),
         diametro = case
           when e.actividad = 'Perforación' and v_bib_new.diametro is not null
             then trim_scale(v_bib_new.diametro)::text || 'mm'
           else e.diametro
         end
    from rdc_reportes r
   where r.id = e.reporte_id and r.frente_id = p_frente_id and r.eliminado_at is null
     and e.elemento = 'Perno' and upper(btrim(e.codigo)) = v_act;
  get diagnostics v_filas = row_count;

  -- 3) (intercambio) el otro perno toma el código y los datos del actual
  if v_en_uso then
    update rdc_reporte_elementos e
       set codigo = btrim(v_bib_act.codigo),
           ubicacion = coalesce(v_bib_act.ubicacion, e.ubicacion),
           zona = coalesce(v_bib_act.zona, e.zona),
           sistema = coalesce(v_bib_act.sistema, e.sistema),
           plano = coalesce(v_bib_act.plano, e.plano),
           diametro = case
             when e.actividad = 'Perforación' and v_bib_act.diametro is not null
               then trim_scale(v_bib_act.diametro)::text || 'mm'
             else e.diametro
           end
      from rdc_reportes r
     where r.id = e.reporte_id and r.frente_id = p_frente_id and r.eliminado_at is null
       and e.elemento = 'Perno' and left(e.codigo, 15) = '__INTERCAMBIO__';
    get diagnostics v_filas_otro = row_count;
  end if;

  insert into auditoria (tabla, registro_id, accion, usuario_id, valor_anterior, valor_nuevo)
  values (
    'rdc_reporte_elementos', p_frente_id, 'UPDATE', auth.uid(),
    jsonb_build_object('operacion', 'renombrar_perno', 'codigo', btrim(p_codigo_actual)),
    jsonb_build_object('operacion', 'renombrar_perno', 'codigo', btrim(p_codigo_nuevo),
                       'filas', v_filas, 'intercambio', v_en_uso, 'filas_del_otro', v_filas_otro)
  );

  return jsonb_build_object('filas', v_filas, 'intercambio', v_en_uso, 'filas_del_otro', v_filas_otro);
end;
$$;

grant execute on function public.fn_rdc_renombrar_perno(uuid, text, text, boolean) to authenticated;
