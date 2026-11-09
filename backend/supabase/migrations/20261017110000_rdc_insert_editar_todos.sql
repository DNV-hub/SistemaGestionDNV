-- Caso real: Gloria Arroyo tenía un reporte del 16/10 que nunca llegó a
-- sincronizar desde su celular (quedó en 'Borrador' solo localmente). El
-- usuario entró con SU PROPIA cuenta (rol con rdc.editar_todos) para
-- terminarlo y enviarlo por ella, y "Terminado y Enviar" falló con un
-- error de RLS: "new row violates row-level security policy for table
-- rdc_reportes".
--
-- La causa: `subirReporte()` hace un upsert(onConflict:'id') — como esta
-- fila nunca había llegado al servidor, Postgres la trata como un INSERT,
-- no un UPDATE. La política de UPDATE sí se extendió para rdc.editar_todos
-- en 20260913160000 (el caso "corregir un reporte ajeno" ya contemplado
-- ahí), pero la de INSERT se quedó en su versión original
-- (20260909100200), que exige `creado_por = auth.uid()` sin excepción —
-- nadie notó que hacía falta el mismo permiso también acá, porque hasta
-- ahora nadie había necesitado subir por primera vez un reporte CREADO por
-- otra persona (el caso normal es que cada quien suba el suyo).
--
-- El `creado_por` de la fila sigue siendo el autor real (Gloria, en este
-- caso) — rdc.editar_todos no cambia autoría, solo permite que otra cuenta
-- con ese permiso haga el INSERT en su nombre, igual que ya puede hacer el
-- UPDATE.
drop policy rdc_reportes_insert on rdc_reportes;

create policy rdc_reportes_insert on rdc_reportes for insert
  with check (
    public.has_permission('rdc.editar_todos')
    or (public.has_permission('rdc.crear') and creado_por = auth.uid())
  );
