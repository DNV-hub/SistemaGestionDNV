-- Deja la app en blanco para cargar datos reales: borra todo lo
-- transaccional (frentes, procura, stock, movimientos, vales, reservas,
-- kardex, alertas) y conserva catálogo (materiales/categorías), almacenes,
-- contratos, usuarios y roles tal como están.
begin;

delete from alertas;
delete from kardex;
delete from salidas;
delete from reservas;         -- cascada: reservas_historial
delete from vales;            -- cascada: vale_detalle
delete from metrados_procura;
delete from stock;
delete from ingresos;
delete from ajustes;

update usuarios set frente_id = null where frente_id is not null;
delete from frentes;

commit;
