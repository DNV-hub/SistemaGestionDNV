-- Limpieza puntual: al investigar un bug real reportado por el usuario
-- ("nuevo reporte" entraba en bucle de duplicados), se reconstruyó el
-- problema a propósito usando la cuenta de JUAN TICONA (vía "Ver como otra
-- cuenta"), lo que dejó basura de prueba en rdc_reportes — un borrador
-- vacío para OLC/hoy que ni siquiera aparecía en su historial (por eso no
-- se pudo borrar desde la propia app). No es dato real de campo: se borra
-- del todo, no a la papelera.
delete from rdc_reportes
where id = 'c59eee7d-512a-4b65-8b18-8757a91aa347'
  and supervisor_id = (select id from rdc_supervisores where nombre = 'JUAN TICONA')
  and estado = 'Borrador';
