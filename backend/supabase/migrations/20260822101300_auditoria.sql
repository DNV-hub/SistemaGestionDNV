create table auditoria (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,
  registro_id uuid not null,
  accion text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  usuario_id uuid references usuarios(id),
  fecha_hora timestamptz not null default now(),
  valor_anterior jsonb,
  valor_nuevo jsonb
);

create index idx_auditoria_tabla_registro on auditoria(tabla, registro_id);
create index idx_auditoria_usuario on auditoria(usuario_id);

create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into auditoria (tabla, registro_id, accion, usuario_id, valor_anterior, valor_nuevo)
  values (
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    TG_OP,
    auth.uid(),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

-- Tablas críticas (spec §16, confirmado en la aprobación de fase 2).
create trigger trg_audit_materiales after insert or update or delete on materiales for each row execute function public.fn_audit();
create trigger trg_audit_usuarios after insert or update or delete on usuarios for each row execute function public.fn_audit();
create trigger trg_audit_roles after insert or update or delete on roles for each row execute function public.fn_audit();
create trigger trg_audit_rol_permisos after insert or update or delete on rol_permisos for each row execute function public.fn_audit();
create trigger trg_audit_vales after insert or update or delete on vales for each row execute function public.fn_audit();
create trigger trg_audit_vale_detalle after insert or update or delete on vale_detalle for each row execute function public.fn_audit();
create trigger trg_audit_reservas after insert or update or delete on reservas for each row execute function public.fn_audit();
create trigger trg_audit_metrados_procura after insert or update or delete on metrados_procura for each row execute function public.fn_audit();
create trigger trg_audit_ajustes after insert or update or delete on ajustes for each row execute function public.fn_audit();
create trigger trg_audit_configuracion after insert or update or delete on configuracion for each row execute function public.fn_audit();
