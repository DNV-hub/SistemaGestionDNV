-- Un vale no puede crearse contra un frente cerrado (pedido del usuario tras
-- agregar fecha_cierre/estado a frentes). Se reemplaza la política de
-- INSERT de `vales` para agregar esa condición; el resto de la lógica queda
-- igual a como se definió en 20260822101400_rls_policies.sql.
drop policy vales_insert on vales;
create policy vales_insert on vales for insert
  with check (
    public.has_permission('vales.crear')
    and supervisor_id = auth.uid()
    and exists (select 1 from frentes f where f.id = frente_id and f.estado = 'activo')
  );
