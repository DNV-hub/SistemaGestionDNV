-- Un frente que Planeamiento recién define en el catálogo, pero cuyo
-- trabajo todavía no arranca, no tenía dónde vivir: los únicos estados eran
-- activo/paralizado/cerrado, y "paralizado" significa otra cosa (un frente
-- que SÍ empezó y se detuvo — sigue teniendo cuadrilla, equipo, motivo de
-- stand by que reportar). Sin un estado propio, cualquier frente nuevo
-- nacía "activo" de entrada y aparecía de inmediato en el Reporte Diario y
-- en el selector de Vales, aunque nadie hubiera puesto un pie ahí todavía.
--
-- 'planificado' es ese estado: existe en el catálogo (Procura ya puede
-- presupuestarlo, Planeamiento puede ir armando sus prefijos/partidas en
-- Catálogos RDC) pero no aparece en ningún selector operativo hasta que se
-- pase a 'activo' a mano.
alter table frentes drop constraint frentes_estado_check;
alter table frentes add constraint frentes_estado_check
  check (estado in ('planificado', 'activo', 'paralizado', 'cerrado'));

-- Los frentes que se creen de ahora en más nacen 'planificado', no
-- 'activo': el default anterior asumía que un frente nuevo ya estaba listo
-- para operar, que es justo lo contrario de lo que pidió el usuario. Los
-- frentes que ya existen no se tocan.
alter table frentes alter column estado set default 'planificado';
