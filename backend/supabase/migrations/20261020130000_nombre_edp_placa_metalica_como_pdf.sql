-- El nombre EDP de la placa metálica debe quedar escrito igual que en la lista
-- de Planeamiento ("20X20X 8MM", con espacio); la migración anterior lo había
-- normalizado sin el espacio.
update public.nombres_edp
set nombre = 'PLACA METÁLICA 20X20X 8MM'
where nombre = 'PLACA METÁLICA 20X20X8MM';
