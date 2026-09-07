-- No existe un permiso "catalogo.eliminar" en la matriz aprobada (ver
-- docs/MODELO_DATOS_Y_FLUJOS.md §2): los materiales se desactivan, no se
-- borran, porque stock/vales/kardex/etc. los referencian y perderían su
-- historial. Aun así, permitimos el DELETE en la base para los materiales
-- que todavía no tienen ningún movimiento asociado: las FK de esas tablas
-- (sin "on delete cascade") bloquean el borrado en cuanto exista una fila
-- relacionada, así que el intento falla solo y de forma segura para
-- materiales que sí están en uso. El permiso reutiliza catalogo.desactivar,
-- el mismo que ya controla quién puede dar de baja un material.
create policy materiales_delete on materiales for delete
  using (public.has_permission('catalogo.desactivar'));
