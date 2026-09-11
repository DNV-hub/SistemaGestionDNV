-- Error de diseño corregido: el código de catálogo NUNCA fue la identidad
-- de un material, es solo una clasificación para agrupar en el reporte
-- EDP. Dos materiales bien distintos (ej. "Cable 15mm rojo, rollos de 5m"
-- y "Cable 15mm verde, rollos de 3m") pueden compartir código (CA.15) sin
-- ser el mismo material — cada uno necesita su propia fila de catálogo,
-- su propio stock, su propio historial. El `unique` en materiales.codigo
-- lo impedía de raíz: obligaba a fusionar en una sola fila (o a inventar
-- códigos únicos por variante) todo lo que compartiera clasificación.
--
-- Ningún otro FK del sistema apunta a materiales(codigo) — todo referencia
-- material_id (uuid, materiales.id) — así que sacar el unique no rompe
-- nada más. Se deja un índice normal (no único) porque el código sigue
-- siendo un dato visible y buscado seguido.
alter table materiales drop constraint if exists materiales_codigo_key;
create index if not exists idx_materiales_codigo on materiales(codigo);
