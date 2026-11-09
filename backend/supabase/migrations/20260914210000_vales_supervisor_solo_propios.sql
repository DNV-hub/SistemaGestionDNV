-- 20260914190000 igualó Vales para los 4 roles (Developer/Planeamiento/
-- Supervisor/Almacén con el mismo set completo) a pedido del usuario, pero
-- eso le dio a Supervisor vales.ver_todos — y esa política de RLS
-- (vales_select: `supervisor_id = auth.uid() OR has_permission('vales.ver_todos')`)
-- no distingue "Supervisor" de "Almacén/Planeamiento": con ese permiso,
-- cualquier supervisor pasó a ver los vales de TODOS los demás supervisores,
-- sin importar el frente. Reportado como fuga real.
--
-- Se retiran los 3 permisos que esa migración le agregó a Supervisor y que
-- no tenía antes (vales_update también da bypass total con
-- vales.aprobar_rechazar, independiente de vales.ver_todos — mismo
-- problema). Developer, Planeamiento y Almacén conservan el set completo:
-- ellos sí deben ver y gestionar los vales de todos.
delete from rol_permisos
where permiso_id in (
  select id from permisos where codigo in ('vales.ver_todos', 'vales.aprobar_rechazar', 'vales.crear_para_otro')
)
and rol_id = (select id from roles where nombre = 'Supervisor');
