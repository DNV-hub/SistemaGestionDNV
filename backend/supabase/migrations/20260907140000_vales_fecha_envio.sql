-- La bandeja de Almacén necesita ordenar por "cuándo se envió" el vale, no
-- por cuándo se creó (un supervisor puede dejarlo en Borrador un rato) ni
-- por updated_at (que se pisa con cada aprobación/entrega posterior).
alter table vales add column fecha_envio timestamptz;
