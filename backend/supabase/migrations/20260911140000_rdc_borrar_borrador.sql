-- Permite borrar un borrador de RDC también en el servidor.
--
-- La migración 20260909100200 dejó a propósito rdc_reportes sin política de
-- DELETE, razonando que un reporte es registro histórico y no se borra. Eso
-- era cierto en ese momento, porque solo los reportes Finalizados llegaban a
-- Supabase. Desde que los borradores TAMBIÉN se sincronizan solos en segundo
-- plano (para que un supervisor pueda seguir un reporte en otro dispositivo),
-- ese razonamiento ya no cubre el caso real: si el supervisor borra un
-- borrador solo en su celular, la copia que ya había subido a la nube se
-- queda ahí para siempre, sin ninguna manera de quitarla — y reaparece en el
-- historial de cualquier dispositivo como un borrador que nadie puede tocar.
--
-- Esta política permite el DELETE únicamente mientras el reporte sigue
-- siendo Borrador, y únicamente a su propio autor o al supervisor
-- responsable — exactamente el mismo alcance que ya usa la política de
-- UPDATE. Un reporte Finalizado sigue sin poder borrarse nunca: eso sí es
-- historia real.
create policy rdc_reportes_delete on rdc_reportes for delete
  using (
    estado = 'Borrador'
    and (creado_por = auth.uid() or supervisor_id = public.rdc_supervisor_id())
  );

-- Las tablas de detalle ya tienen "on delete cascade" hacia rdc_reportes
-- desde que se crearon (20260909100100): borrar la cabecera se lleva sus
-- filas de personal, maquinaria, hitos, etc. sin necesidad de una política
-- de DELETE aparte en cada una — el cascade de la base no pasa por RLS de
-- esas tablas hijas.
