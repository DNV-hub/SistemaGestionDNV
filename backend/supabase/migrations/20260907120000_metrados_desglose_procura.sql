-- El metrado deja de ser una sola "cantidad prevista": se separa en
-- cantidad_contractual (lo pactado, cambia poco) y cantidad_procura (lo que
-- realmente sale del plano vigente — Planeamiento la sube o la baja cada vez
-- que el plano cambia). El total para comparar contra consumo es la suma de
-- ambas.
--
-- No hace falta una tabla de "control de modificaciones" aparte: cada
-- cambio en cantidad_contractual o cantidad_procura ya crea una fila nueva
-- por trg_metrados_versionar (la anterior queda vigente = false), así que
-- metrados_procura ES el historial — el reporte de modificaciones del
-- frontend simplemente lee todas las versiones, sin filtrar por vigente.
alter table metrados_procura rename column cantidad_prevista to cantidad_contractual;

alter table metrados_procura
  add column cantidad_procura numeric(14,3) not null default 0 check (cantidad_procura >= 0);

-- CREATE OR REPLACE no sirve aquí: cambia qué columna de la tabla alimenta
-- cada posición de la vista (cantidad_prevista -> cantidad_contractual), y
-- Postgres no permite renombrar una columna de vista existente así. Se
-- recrea entera (nada depende de ella salvo fn_evaluar_alertas, que la
-- referencia en SQL dinámico dentro de una función y no genera una
-- dependencia dura), y se repite el grant que se pierde al recrearla.
drop view if exists procura_vs_consumo;

create view procura_vs_consumo as
select
  mp.frente_id,
  mp.material_id,
  mp.cantidad_contractual,
  mp.cantidad_procura,
  (mp.cantidad_contractual + mp.cantidad_procura) as cantidad_prevista,
  mp.unidad,
  coalesce(r.reservado, 0) as cantidad_reservada,
  coalesce(sol.solicitado, 0) as cantidad_solicitada,
  coalesce(s.entregado, 0) as cantidad_entregada,
  (mp.cantidad_contractual + mp.cantidad_procura) - coalesce(s.entregado, 0) - coalesce(r.reservado, 0) as saldo,
  case when (mp.cantidad_contractual + mp.cantidad_procura) > 0
    then round(coalesce(s.entregado, 0) / (mp.cantidad_contractual + mp.cantidad_procura) * 100, 1)
    else null
  end as porcentaje_consumo,
  coalesce(s.entregado, 0) - (mp.cantidad_contractual + mp.cantidad_procura) as desviacion
from metrados_procura mp
left join (
  select frente_id, material_id, sum(cantidad - cantidad_entregada) as reservado
  from reservas
  where estado in ('Activa', 'Parcial')
  group by frente_id, material_id
) r on r.frente_id = mp.frente_id and r.material_id = mp.material_id
left join (
  select v.frente_id, vd.material_id, sum(vd.cantidad_solicitada) as solicitado
  from vale_detalle vd
  join vales v on v.id = vd.vale_id
  where vd.estado <> 'Cancelado'
  group by v.frente_id, vd.material_id
) sol on sol.frente_id = mp.frente_id and sol.material_id = mp.material_id
left join (
  select frente_id, material_id, sum(cantidad) as entregado
  from salidas
  group by frente_id, material_id
) s on s.frente_id = mp.frente_id and s.material_id = mp.material_id
where mp.vigente = true
  -- Autorización embebida en la vista, igual que en la versión original:
  -- Almacén tiene procura.ver_comparacion sin procura.ver.
  and public.has_permission('procura.ver_comparacion')
  and (not public.es_supervisor() or mp.frente_id = public.current_frente_id());

grant select on procura_vs_consumo to authenticated;
