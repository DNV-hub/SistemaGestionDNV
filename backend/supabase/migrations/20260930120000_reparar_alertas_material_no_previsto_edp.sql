-- Reparación puntual: 52 alertas "material_no_previsto" quedaron huérfanas
-- tras 20260930100000. Se crearon cuando esas alertas todavía se guardaban
-- por material_id; el trigger que las resuelve (fn_resolver_alerta_material_
-- previsto) ahora compara por descripcion_edp_id, y esas filas viejas tienen
-- ese campo en null — null nunca es igual a nada, así que jamás iban a
-- poder resolverse solas, ni subiendo el metrado correcto (caso real: el
-- usuario subió metrados y los bloques seguían mostrando "Consumo sin
-- metrado").
--
-- Paso 1: rellenar descripcion_edp_id en esas alertas viejas, a partir del
-- material que ya tenían guardado.
update alertas a
set descripcion_edp_id = m.descripcion_edp_id
from materiales m
where a.tipo = 'material_no_previsto'
  and a.estado = 'activa'
  and a.descripcion_edp_id is null
  and a.material_id = m.id
  and m.descripcion_edp_id is not null;

-- Paso 2: con el grupo ya rellenado (o si ya lo tenía), resolver de una vez
-- las que corresponden a un frente+grupo que YA tiene un metrado vigente —
-- es exactamente lo que el trigger habría hecho solo, si hubiera podido.
update alertas a
set estado = 'resuelta', resuelta_at = now()
where a.tipo = 'material_no_previsto'
  and a.estado = 'activa'
  and a.descripcion_edp_id is not null
  and exists (
    select 1 from metrados_procura mp
    where mp.frente_id = a.frente_id
      and mp.descripcion_edp_id = a.descripcion_edp_id
      and mp.vigente = true
  );
