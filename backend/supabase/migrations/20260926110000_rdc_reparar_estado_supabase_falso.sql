-- Segundo bug real con el mismo síntoma que 20260925100000 (estado_sharepoint
-- = 'enviado' pero estado = 'Borrador'), causa distinta esta vez: en
-- rdcService.js, obtenerReporteCompleto() marcaba `estadoSupabase: 'enviado'`
-- a la fuerza para CUALQUIER reporte traído del servidor ("si está en el
-- servidor, por definición llegó") — cierto para uno Finalizado, falso para
-- un Borrador (que también vive en el servidor mientras se llena, ver
-- rdcSync.js). Un supervisor que adoptó un borrador ajeno a medio llenar
-- heredaba ese `estadoSupabase: 'enviado'` de mentira; al finalizarlo después
-- en ESE dispositivo, la sincronización ya no volvía a subir la cabecera
-- (la creía subida desde antes) — el Excel llegaba bien a SharePoint, pero
-- `rdc_reportes.estado` se quedaba en 'Borrador' para siempre en Supabase,
-- aunque localmente (y para SharePoint) el reporte sí estaba Finalizado.
--
-- Ya se corrigió en el frontend (obtenerReporteCompleto ahora solo marca
-- 'enviado' si el reporte que trae es de verdad Finalizado). Esta migración
-- repara los que ya quedaron mal con el mismo criterio seguro que la vez
-- pasada: solo toca filas donde el archivo real ya se generó en SharePoint
-- y no es un caso en curso de "Corregir y reenviar".
update rdc_reportes
set estado = 'Finalizado'
where estado = 'Borrador' and estado_sharepoint = 'enviado' and es_correccion = false;
