-- PRUEBA · Corrección de datos 18/11/2026
-- ZCM06 no tiene plano de sistema activo (topografía recién marca puntos).
-- Los 14 pernos D32 L=5 m (P1-A1 a P1-A14) son anclajes del Pasivo 1 según CE1087.
-- Regla: un sector solo se crea si existe su plano o una directriz escrita.
-- Idempotente. Solo toca objetos ctl_ del frente ZCM06.
begin;
update public.ctl_metrado_plano
   set sector_codigo = 'P1',
       item_codigo   = 'ZCM06-P1-25',
       descripcion   = 'Perno D32 L=5.00 m · cuerpo de talud 20° (anclaje puntual)'
 where frente_id = '289cf1e7-9c87-4a47-8407-966cfe4aee6a' and sector_codigo = 'A1';

insert into public.ctl_material_sector (frente_id, material_id, sector_codigo, criterio)
select frente_id, material_id, 'P1', coalesce(criterio,'') || ' · Pasivo 1 según CE1087 (sin plano activo)'
  from public.ctl_material_sector
 where frente_id = '289cf1e7-9c87-4a47-8407-966cfe4aee6a' and sector_codigo = 'A1'
on conflict (frente_id, material_id, sector_codigo) do nothing;

delete from public.ctl_material_sector
 where frente_id = '289cf1e7-9c87-4a47-8407-966cfe4aee6a' and sector_codigo = 'A1';

delete from public.ctl_sectores
 where frente_id = '289cf1e7-9c87-4a47-8407-966cfe4aee6a' and codigo = 'A1';
commit;
