-- La política de DELETE de rdc_reportes (20260911140000) solo dejaba
-- borrar un borrador a su propio autor o al supervisor vinculado al frente
-- — igual que la de UPDATE, antes de que existiera rdc.editar_todos. Eso
-- deja un hueco real: un reporte de prueba creado suplantando a un
-- supervisor (desde Developer) queda con creado_por de ESE supervisor, no
-- de quien lo creó de verdad — así que ni Developer ni Planeamiento podían
-- borrarlo después, aunque nunca se haya enviado.
--
-- Se agrega el mismo bypass que ya tiene UPDATE. Sigue exigiendo
-- estado = 'Borrador': un reporte Finalizado (ya enviado a SharePoint)
-- sigue sin poder borrarse nunca — eso es historia real, no algo que
-- limpiar. Para eso ya existe "Corregir y reenviar" (rdc.editar_todos).
drop policy rdc_reportes_delete on rdc_reportes;

create policy rdc_reportes_delete on rdc_reportes for delete
  using (
    estado = 'Borrador'
    and (
      public.has_permission('rdc.editar_todos')
      or creado_por = auth.uid()
      or supervisor_id = public.rdc_supervisor_id()
    )
  );
