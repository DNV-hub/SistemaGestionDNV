-- Unifica los catálogos de Sector y Frente del RDC con la tabla `frentes`
-- que ya usa el resto del Sistema (Vales, Kardex, Procura, Almacén).
--
-- 20260909100000 (creación de rdc_frentes/rdc_sectores) había dejado esto
-- deliberadamente separado: "el RDC tiene 21 frentes con sector como tabla
-- propia, y el Sistema tiene otros frentes con sector como texto libre...
-- fusionarlos ahora obligaría a sincerar dos maestros a la vez que se migra
-- la aplicación. La uniformización se hará después, como trabajo propio."
-- Este es ese trabajo.
--
-- LO QUE SE VERIFICÓ ANTES DE ESCRIBIR ESTA MIGRACIÓN (no se adivinó nada):
--   - El Sistema tenía 6 frentes; el RDC, 21 repartidos en 10 sectores.
--   - Solo 4 nombres coinciden entre ambos (OPB/Obras a pie de botadero,
--     Tajo Fase 2, ZCM08, ZCM09); un quinto ("MANTENIMIENTO VM01" del
--     Sistema = "VM-01" del RDC) y un sexto caso ("SALA ELECTRICA" del
--     Sistema, que en realidad es un SECTOR con dos frentes reales del RDC
--     debajo) se confirmaron uno por uno con el usuario, no se asumieron.
--   - Se confirmó con consultas reales que NINGÚN frente del Sistema salvo
--     "OBRAS A PIE DE BOTADERO" tiene vales/kardex/reservas/procura/alertas/
--     devoluciones ni usuarios asignados — o sea, casi todo lo que hay que
--     mover es seguro de mover.
--   - "Frente A" / "Nuevo Sector" del RDC son datos de prueba (ya estaban
--     marcados `activo = false` en rdc_sectores desde antes) — el usuario
--     pidió dejarlos fuera. Solo 1 fila de rdc_prefijos los usaba (también
--     de prueba); se pierde con el DROP de las tablas viejas al final.
--
-- Los 3 catálogos que dependen de un frente (rdc_prefijos, rdc_partidas_edt,
-- rdc_pernos_biblioteca) y rdc_reportes se repuntan a la tabla unificada.
-- rdc_supervisores, rdc_capataces, rdc_redline_supervisores, rdc_maquinarias,
-- rdc_partidas_estandar NO se tocan: siguen siendo catálogos propios del RDC,
-- tal como pidió el usuario ("usemos la info de lo demás del RDC").

-- ---------------------------------------------------------------------------
-- 1. Tabla de sectores, nueva para el Sistema (antes solo existía como texto
--    libre en frentes.sector, que se deja intacta para no romper la pantalla
--    de Frentes existente, que no se toca en esta migración).
-- ---------------------------------------------------------------------------
create table sectores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_sectores_updated_at
  before update on sectores
  for each row execute function public.set_updated_at();

alter table frentes add column sector_id uuid references sectores(id);

-- ---------------------------------------------------------------------------
-- 2. Los 8 sectores reales (se excluyen "Frente A" / "Nuevo Sector", de
--    prueba). Ids fijos para poder referenciarlos en los pasos siguientes
--    sin depender de PL/pgSQL.
-- ---------------------------------------------------------------------------
insert into sectores (id, nombre) values
  ('9fb537b1-d6b2-4537-a6c9-10f79588f0eb', 'OPB MINA'),
  ('683a5d23-2b97-4c11-af3e-994d8d4da424', 'BY PASS'),
  ('c1973a8a-1ce6-4bc5-92a3-fb376e68c1b1', 'TAJO'),
  ('07f10e58-4fd1-4453-8ac6-506871a231be', 'POZA'),
  ('3baca676-4b20-47f2-80e1-5a47be4365d9', 'VIA MAR II'),
  -- "SALA ELECTRICA" era un FRENTE en el Sistema, sin ningún uso real en
  -- vales/kardex/reservas/salidas/procura/alertas/devoluciones/usuarios
  -- (verificado). El usuario confirmó que en realidad es un SECTOR, con dos
  -- frentes reales del RDC debajo (Plataforma Sala Eléctrica y Plataforma
  -- de Operaciones, insertados en el paso 4). OJO: ese frente viejo es HOY
  -- el único que existe bajo el contrato "Sala Eléctrica" (20260908120000
  -- separó el stock en dos contratos: Marco y Sala Eléctrica) — no se le
  -- puede quitar el frente a ese contrato sin dejarle ninguno. Por eso los
  -- dos frentes nuevos de abajo nacen con `contrato_id` = Sala Eléctrica,
  -- no Marco: son su reemplazo real, uno por uno se pierde nada.
  ('1c2d8682-a2e6-4349-924c-5981fceddde0', 'SALA ELECTRICA'),
  ('ab562016-de55-4b27-acca-c3009a09fb27', 'DM2'),
  ('4478e481-078a-469a-a67e-8dd03bcf2eea', 'Otro');

-- El frente "SALA ELECTRICA" del Sistema se retira (nace de nuevo como
-- sector arriba). Se borra DESPUÉS de insertar sus dos reemplazos (paso 4),
-- para que el contrato Sala Eléctrica nunca se quede sin ningún frente ni
-- siquiera en un punto intermedio de esta misma transacción.

-- ---------------------------------------------------------------------------
-- 3. Los 5 frentes que YA existían en el Sistema y son, de verdad, el mismo
--    frente que uno del RDC (confirmado uno por uno con el usuario):
--    conservan su id — ningún vale/kardex/procura que ya los referencia se
--    mueve de nada — y solo reciben el sector_id. "MANTENIMIENTO VM01" se
--    renombra a "VM-01", el nombre real que usa el RDC a diario (sin ningún
--    uso real detrás, verificado, así que renombrar es seguro).
-- ---------------------------------------------------------------------------
update frentes set sector_id = '9fb537b1-d6b2-4537-a6c9-10f79588f0eb' where id = 'fddaca4c-5d94-4c5e-a52c-3aed393a0fd1'; -- OBRAS A PIE DE BOTADERO
update frentes set sector_id = 'c1973a8a-1ce6-4bc5-92a3-fb376e68c1b1' where id = '7346fa2f-4674-4f05-a6d1-816229b43d58'; -- TAJO FASE 2
update frentes set sector_id = '3baca676-4b20-47f2-80e1-5a47be4365d9' where id = '355dcdab-971d-41a8-b495-7e5439b11bae'; -- ZCM08
update frentes set sector_id = '3baca676-4b20-47f2-80e1-5a47be4365d9' where id = 'da399722-09f6-4efd-b96c-0a8cf3af6484'; -- ZCM09
update frentes set nombre = 'VM-01', sector_id = '3baca676-4b20-47f2-80e1-5a47be4365d9' where id = '9b5bd398-6157-4e9e-a87f-1eef794207f1'; -- antes "MANTENIMIENTO VM01"

-- ---------------------------------------------------------------------------
-- 4. Los 14 frentes que el RDC tiene y el Sistema todavía no. `area` es NOT
--    NULL en `frentes`: se deriva del área que el RDC codificaba en el
--    nombre del sector ("A: 2000 - ...", etc.), no se inventa. `estado` y
--    `fecha_inicio` toman el default de la tabla (activo / hoy).
-- ---------------------------------------------------------------------------
-- `contrato_id` es NOT NULL en `frentes` (20260908120000): 12 de estos 14
-- van al contrato Marco (como los frentes que ya existían), y los 2 de Sala
-- Eléctrica van al contrato "Sala Eléctrica" — el mismo que tenía el frente
-- placeholder que se retira más abajo, para que ese contrato no se quede
-- sin ningún frente. `sector` (texto) también es NOT NULL (20260908130000,
-- previa a sector_id): se le pone el mismo nombre limpio del sector para
-- que la pantalla de Frentes, que todavía lee esa columna y no sector_id,
-- siga mostrando algo con sentido.
insert into frentes (id, nombre, area, sector, sector_id, contrato_id) values
  ('d53de1aa-67ed-464a-a185-cabebe638804', 'BPN - 32', '2000', 'BY PASS', '683a5d23-2b97-4c11-af3e-994d8d4da424', (select id from contratos where codigo = 'MARCO')),
  ('62936a86-e400-487b-b344-01b1a656f721', 'TAJO F4N - LADO ESTE', '2000', 'TAJO', 'c1973a8a-1ce6-4bc5-92a3-fb376e68c1b1', (select id from contratos where codigo = 'MARCO')),
  ('2c12b004-d846-424d-b3bb-42f93aa5d490', 'POZA PC-003', '3000', 'POZA', '07f10e58-4fd1-4453-8ac6-506871a231be', (select id from contratos where codigo = 'MARCO')),
  ('b32d22fa-8f8d-455a-ba86-66782feafe41', 'ACCESO POZA PC-003', '3000', 'POZA', '07f10e58-4fd1-4453-8ac6-506871a231be', (select id from contratos where codigo = 'MARCO')),
  ('9aa462d2-d7ba-4f8d-b788-95d087c0e3a9', 'VM-08', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('65ada14a-9d50-4372-8d11-310d99a97864', 'VM-07', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('2e53059e-9677-4622-88d5-4c086cbe76d8', 'VM-06', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('08fe6f24-3b73-42c5-927d-9485026557ea', 'VM-05', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('799ad5fe-21f4-4e42-a3dd-7ddb148cfbd8', 'VM-04', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('e319ae43-cc7b-4358-9748-bcc0530c6427', 'VM-13', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('39619f2b-9aba-4e1c-b7f5-f22ffff97a30', 'VM-12', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('7e44e183-0fa5-4014-8d4f-0feba0922051', 'VM_10 SP', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('5b48b5d2-6071-42ee-9410-c7378a653b9e', 'VM-16', '3000', 'VIA MAR II', '3baca676-4b20-47f2-80e1-5a47be4365d9', (select id from contratos where codigo = 'MARCO')),
  ('82599064-cf6e-4206-9c80-3c9c4f43f5da', 'PLATAFORMA SALA ELECTRICA', '4000', 'SALA ELECTRICA', '1c2d8682-a2e6-4349-924c-5981fceddde0', (select id from contratos where codigo = 'SALA-ELEC')),
  ('d3a3bdda-ad2a-482e-a369-59ffe29d0069', 'PLATAFORMA DE OPERACIONES', '4000', 'SALA ELECTRICA', '1c2d8682-a2e6-4349-924c-5981fceddde0', (select id from contratos where codigo = 'SALA-ELEC'));

-- Ahora sí se retira el frente placeholder "SALA ELECTRICA": el contrato
-- Sala Eléctrica ya tiene sus dos reemplazos reales insertados arriba, así
-- que nunca queda sin ningún frente ni en un punto intermedio de esta
-- transacción. Verificado antes de escribir esta migración: 0 vales, 0
-- reservas, 0 salidas, 0 procura, 0 alertas, 0 devoluciones, 0 usuarios lo
-- referenciaban.
delete from frentes where id = 'a9285186-5a03-4e28-bf67-6aa6cb66dc92';

-- ---------------------------------------------------------------------------
-- 5. Quitar PRIMERO las llaves foráneas viejas (apuntan a rdc_frentes/
--    rdc_sectores) para poder escribir valores de la tabla nueva sin que la
--    llave vieja los rechace por no existir ahí — y todavía no poner las
--    nuevas (eso es el paso 7, después de repuntar los datos): agregar una
--    FK valida TODAS las filas existentes en el momento de crearla, y en
--    este punto intermedio las filas todavía tienen los ids viejos.
-- ---------------------------------------------------------------------------
alter table rdc_reportes drop constraint rdc_reportes_frente_id_fkey;
alter table rdc_reportes drop constraint rdc_reportes_sector_id_fkey;
alter table rdc_prefijos drop constraint rdc_prefijos_frente_id_fkey;
alter table rdc_partidas_edt drop constraint rdc_partidas_edt_frente_id_fkey;
alter table rdc_pernos_biblioteca drop constraint rdc_pernos_biblioteca_frente_id_fkey;

-- ---------------------------------------------------------------------------
-- 6. Repuntar los datos existentes, ahora que ninguna FK los puede rechazar.
--    Solo 2 reportes existen hoy en total (verificado) — de ahí que esto se
--    pueda hacer con un UPDATE directo, sin backfill masivo.
-- ---------------------------------------------------------------------------
update rdc_reportes t set frente_id = m.frente_nuevo, sector_id = m.sector_nuevo
from (values
  ('5e8467d0-b9b4-4125-936e-d10d4bec6bfe'::uuid, 'fddaca4c-5d94-4c5e-a52c-3aed393a0fd1'::uuid, '9fb537b1-d6b2-4537-a6c9-10f79588f0eb'::uuid), -- OPB
  ('e7966b91-3a52-4bbd-a43f-05be7a367d10', 'd53de1aa-67ed-464a-a185-cabebe638804', '683a5d23-2b97-4c11-af3e-994d8d4da424'), -- BPN - 32
  ('1a650dd4-80ee-42cb-9182-2bbacb8f3843', '62936a86-e400-487b-b344-01b1a656f721', 'c1973a8a-1ce6-4bc5-92a3-fb376e68c1b1'), -- TAJO F4N - LADO ESTE
  ('521701ee-6dfc-4563-be89-f8734800aea9', '7346fa2f-4674-4f05-a6d1-816229b43d58', 'c1973a8a-1ce6-4bc5-92a3-fb376e68c1b1'), -- TAJO FASE 2
  ('11f7252a-047f-44c1-8563-7cbb219e9f87', '2c12b004-d846-424d-b3bb-42f93aa5d490', '07f10e58-4fd1-4453-8ac6-506871a231be'), -- POZA PC-003
  ('bb30102a-910e-4fe6-baab-fce7fc9e8169', 'b32d22fa-8f8d-455a-ba86-66782feafe41', '07f10e58-4fd1-4453-8ac6-506871a231be'), -- ACCESO POZA PC-003
  ('ca8adb6e-5752-4843-a89f-f2f3e6bfff23', '9aa462d2-d7ba-4f8d-b788-95d087c0e3a9', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-08
  ('88b356b0-b14d-486a-9eaa-9aca008bf847', '65ada14a-9d50-4372-8d11-310d99a97864', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-07
  ('7c6d341f-0b91-4205-8d7e-b9e15cc9e890', '2e53059e-9677-4622-88d5-4c086cbe76d8', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-06
  ('3fd8f4d9-e7c3-4020-a449-473628cbccc9', '08fe6f24-3b73-42c5-927d-9485026557ea', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-05
  ('8cd6f572-05ee-4d6c-b555-1338e991c15c', '799ad5fe-21f4-4e42-a3dd-7ddb148cfbd8', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-04
  ('f6827707-d78c-45b3-a583-f4c3fdde06aa', '9b5bd398-6157-4e9e-a87f-1eef794207f1', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-01
  ('e174856d-9a94-4cc5-850f-076b464865c5', '355dcdab-971d-41a8-b495-7e5439b11bae', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- ZCM08
  ('499d0b71-f615-4262-ab41-339d44890737', 'e319ae43-cc7b-4358-9748-bcc0530c6427', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-13
  ('d341a6d1-9156-44c9-921d-11554721c6a2', '39619f2b-9aba-4e1c-b7f5-f22ffff97a30', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-12
  ('cbd09531-167e-4142-9f04-57f1d0c54a02', '7e44e183-0fa5-4014-8d4f-0feba0922051', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM_10 SP
  ('86a824bb-b59b-49ce-b971-06f5f170dd55', '5b48b5d2-6071-42ee-9410-c7378a653b9e', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- VM-16
  ('d2931b78-8cd7-4123-859f-54157c596b0b', 'da399722-09f6-4efd-b96c-0a8cf3af6484', '3baca676-4b20-47f2-80e1-5a47be4365d9'), -- ZCM09
  ('12826831-02c6-4e7d-94b2-b820df19ed14', '82599064-cf6e-4206-9c80-3c9c4f43f5da', '1c2d8682-a2e6-4349-924c-5981fceddde0'), -- PLATAFORMA SALA ELECTRICA
  ('f590943a-77de-4694-af45-178271cc1414', 'd3a3bdda-ad2a-482e-a369-59ffe29d0069', '1c2d8682-a2e6-4349-924c-5981fceddde0')  -- PLATAFORMA DE OPERACIONES
  -- "Frente A" (a16387a2-...) queda afuera a propósito: 0 rdc_reportes reales
  -- lo usaban (verificado), así que no hay nada que repuntar para ese caso.
) as m(frente_viejo, frente_nuevo, sector_nuevo)
where t.frente_id = m.frente_viejo;

update rdc_prefijos t set frente_id = m.frente_nuevo
from (values
  ('5e8467d0-b9b4-4125-936e-d10d4bec6bfe'::uuid, 'fddaca4c-5d94-4c5e-a52c-3aed393a0fd1'::uuid),
  ('e7966b91-3a52-4bbd-a43f-05be7a367d10', 'd53de1aa-67ed-464a-a185-cabebe638804'),
  ('1a650dd4-80ee-42cb-9182-2bbacb8f3843', '62936a86-e400-487b-b344-01b1a656f721'),
  ('521701ee-6dfc-4563-be89-f8734800aea9', '7346fa2f-4674-4f05-a6d1-816229b43d58'),
  ('11f7252a-047f-44c1-8563-7cbb219e9f87', '2c12b004-d846-424d-b3bb-42f93aa5d490'),
  ('bb30102a-910e-4fe6-baab-fce7fc9e8169', 'b32d22fa-8f8d-455a-ba86-66782feafe41'),
  ('ca8adb6e-5752-4843-a89f-f2f3e6bfff23', '9aa462d2-d7ba-4f8d-b788-95d087c0e3a9'),
  ('88b356b0-b14d-486a-9eaa-9aca008bf847', '65ada14a-9d50-4372-8d11-310d99a97864'),
  ('7c6d341f-0b91-4205-8d7e-b9e15cc9e890', '2e53059e-9677-4622-88d5-4c086cbe76d8'),
  ('3fd8f4d9-e7c3-4020-a449-473628cbccc9', '08fe6f24-3b73-42c5-927d-9485026557ea'),
  ('8cd6f572-05ee-4d6c-b555-1338e991c15c', '799ad5fe-21f4-4e42-a3dd-7ddb148cfbd8'),
  ('f6827707-d78c-45b3-a583-f4c3fdde06aa', '9b5bd398-6157-4e9e-a87f-1eef794207f1'),
  ('e174856d-9a94-4cc5-850f-076b464865c5', '355dcdab-971d-41a8-b495-7e5439b11bae'),
  ('499d0b71-f615-4262-ab41-339d44890737', 'e319ae43-cc7b-4358-9748-bcc0530c6427'),
  ('d341a6d1-9156-44c9-921d-11554721c6a2', '39619f2b-9aba-4e1c-b7f5-f22ffff97a30'),
  ('cbd09531-167e-4142-9f04-57f1d0c54a02', '7e44e183-0fa5-4014-8d4f-0feba0922051'),
  ('86a824bb-b59b-49ce-b971-06f5f170dd55', '5b48b5d2-6071-42ee-9410-c7378a653b9e'),
  ('d2931b78-8cd7-4123-859f-54157c596b0b', 'da399722-09f6-4efd-b96c-0a8cf3af6484'),
  ('12826831-02c6-4e7d-94b2-b820df19ed14', '82599064-cf6e-4206-9c80-3c9c4f43f5da'),
  ('f590943a-77de-4694-af45-178271cc1414', 'd3a3bdda-ad2a-482e-a369-59ffe29d0069')
  -- "Frente A" (excluido a proposito) no esta en esta lista: su unica fila
  -- de rdc_prefijos se borra explicitamente en el paso 7, mas abajo.
) as m(frente_viejo, frente_nuevo)
where t.frente_id = m.frente_viejo;

update rdc_partidas_edt t set frente_id = m.frente_nuevo
from (values
  ('5e8467d0-b9b4-4125-936e-d10d4bec6bfe'::uuid, 'fddaca4c-5d94-4c5e-a52c-3aed393a0fd1'::uuid),
  ('e7966b91-3a52-4bbd-a43f-05be7a367d10', 'd53de1aa-67ed-464a-a185-cabebe638804'),
  ('1a650dd4-80ee-42cb-9182-2bbacb8f3843', '62936a86-e400-487b-b344-01b1a656f721'),
  ('521701ee-6dfc-4563-be89-f8734800aea9', '7346fa2f-4674-4f05-a6d1-816229b43d58'),
  ('11f7252a-047f-44c1-8563-7cbb219e9f87', '2c12b004-d846-424d-b3bb-42f93aa5d490'),
  ('bb30102a-910e-4fe6-baab-fce7fc9e8169', 'b32d22fa-8f8d-455a-ba86-66782feafe41'),
  ('ca8adb6e-5752-4843-a89f-f2f3e6bfff23', '9aa462d2-d7ba-4f8d-b788-95d087c0e3a9'),
  ('88b356b0-b14d-486a-9eaa-9aca008bf847', '65ada14a-9d50-4372-8d11-310d99a97864'),
  ('7c6d341f-0b91-4205-8d7e-b9e15cc9e890', '2e53059e-9677-4622-88d5-4c086cbe76d8'),
  ('3fd8f4d9-e7c3-4020-a449-473628cbccc9', '08fe6f24-3b73-42c5-927d-9485026557ea'),
  ('8cd6f572-05ee-4d6c-b555-1338e991c15c', '799ad5fe-21f4-4e42-a3dd-7ddb148cfbd8'),
  ('f6827707-d78c-45b3-a583-f4c3fdde06aa', '9b5bd398-6157-4e9e-a87f-1eef794207f1'),
  ('e174856d-9a94-4cc5-850f-076b464865c5', '355dcdab-971d-41a8-b495-7e5439b11bae'),
  ('499d0b71-f615-4262-ab41-339d44890737', 'e319ae43-cc7b-4358-9748-bcc0530c6427'),
  ('d341a6d1-9156-44c9-921d-11554721c6a2', '39619f2b-9aba-4e1c-b7f5-f22ffff97a30'),
  ('cbd09531-167e-4142-9f04-57f1d0c54a02', '7e44e183-0fa5-4014-8d4f-0feba0922051'),
  ('86a824bb-b59b-49ce-b971-06f5f170dd55', '5b48b5d2-6071-42ee-9410-c7378a653b9e'),
  ('d2931b78-8cd7-4123-859f-54157c596b0b', 'da399722-09f6-4efd-b96c-0a8cf3af6484'),
  ('12826831-02c6-4e7d-94b2-b820df19ed14', '82599064-cf6e-4206-9c80-3c9c4f43f5da'),
  ('f590943a-77de-4694-af45-178271cc1414', 'd3a3bdda-ad2a-482e-a369-59ffe29d0069')
) as m(frente_viejo, frente_nuevo)
where t.frente_id = m.frente_viejo;

update rdc_pernos_biblioteca t set frente_id = m.frente_nuevo
from (values
  ('5e8467d0-b9b4-4125-936e-d10d4bec6bfe'::uuid, 'fddaca4c-5d94-4c5e-a52c-3aed393a0fd1'::uuid),
  ('e7966b91-3a52-4bbd-a43f-05be7a367d10', 'd53de1aa-67ed-464a-a185-cabebe638804'),
  ('1a650dd4-80ee-42cb-9182-2bbacb8f3843', '62936a86-e400-487b-b344-01b1a656f721'),
  ('521701ee-6dfc-4563-be89-f8734800aea9', '7346fa2f-4674-4f05-a6d1-816229b43d58'),
  ('11f7252a-047f-44c1-8563-7cbb219e9f87', '2c12b004-d846-424d-b3bb-42f93aa5d490'),
  ('bb30102a-910e-4fe6-baab-fce7fc9e8169', 'b32d22fa-8f8d-455a-ba86-66782feafe41'),
  ('ca8adb6e-5752-4843-a89f-f2f3e6bfff23', '9aa462d2-d7ba-4f8d-b788-95d087c0e3a9'),
  ('88b356b0-b14d-486a-9eaa-9aca008bf847', '65ada14a-9d50-4372-8d11-310d99a97864'),
  ('7c6d341f-0b91-4205-8d7e-b9e15cc9e890', '2e53059e-9677-4622-88d5-4c086cbe76d8'),
  ('3fd8f4d9-e7c3-4020-a449-473628cbccc9', '08fe6f24-3b73-42c5-927d-9485026557ea'),
  ('8cd6f572-05ee-4d6c-b555-1338e991c15c', '799ad5fe-21f4-4e42-a3dd-7ddb148cfbd8'),
  ('f6827707-d78c-45b3-a583-f4c3fdde06aa', '9b5bd398-6157-4e9e-a87f-1eef794207f1'),
  ('e174856d-9a94-4cc5-850f-076b464865c5', '355dcdab-971d-41a8-b495-7e5439b11bae'),
  ('499d0b71-f615-4262-ab41-339d44890737', 'e319ae43-cc7b-4358-9748-bcc0530c6427'),
  ('d341a6d1-9156-44c9-921d-11554721c6a2', '39619f2b-9aba-4e1c-b7f5-f22ffff97a30'),
  ('cbd09531-167e-4142-9f04-57f1d0c54a02', '7e44e183-0fa5-4014-8d4f-0feba0922051'),
  ('86a824bb-b59b-49ce-b971-06f5f170dd55', '5b48b5d2-6071-42ee-9410-c7378a653b9e'),
  ('d2931b78-8cd7-4123-859f-54157c596b0b', 'da399722-09f6-4efd-b96c-0a8cf3af6484'),
  ('12826831-02c6-4e7d-94b2-b820df19ed14', '82599064-cf6e-4206-9c80-3c9c4f43f5da'),
  ('f590943a-77de-4694-af45-178271cc1414', 'd3a3bdda-ad2a-482e-a369-59ffe29d0069')
) as m(frente_viejo, frente_nuevo)
where t.frente_id = m.frente_viejo;

-- ---------------------------------------------------------------------------
-- 7. La fila de prueba de rdc_prefijos que colgaba de "Frente A" (excluido
--    a propósito, ver arriba): sin esto, el DROP de rdc_frentes de más
--    abajo fallaría igual por la FK, pero es más claro dejar constancia
--    explícita de qué se está descartando y por qué.
-- ---------------------------------------------------------------------------
delete from rdc_prefijos where frente_id = 'a16387a2-54e3-4d75-96b5-53595fb8416f';

-- ---------------------------------------------------------------------------
-- 8. Ahora sí, poner las llaves foráneas nuevas: los datos ya apuntan a
--    frentes/sectores, así que la validación de cada ALTER TABLE pasa sin
--    problema. Los índices existentes (idx_rdc_reportes_frente, etc.) no se
--    tocan: indexan la columna, no el destino de la FK.
-- ---------------------------------------------------------------------------
alter table rdc_reportes add constraint rdc_reportes_frente_id_fkey foreign key (frente_id) references frentes(id);
alter table rdc_reportes add constraint rdc_reportes_sector_id_fkey foreign key (sector_id) references sectores(id);
alter table rdc_prefijos add constraint rdc_prefijos_frente_id_fkey foreign key (frente_id) references frentes(id) on delete cascade;
alter table rdc_partidas_edt add constraint rdc_partidas_edt_frente_id_fkey foreign key (frente_id) references frentes(id) on delete cascade;
alter table rdc_pernos_biblioteca add constraint rdc_pernos_biblioteca_frente_id_fkey foreign key (frente_id) references frentes(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 9. Retirar los catálogos viejos, ya sin nada que los referencie.
-- ---------------------------------------------------------------------------
drop table rdc_frentes;
drop table rdc_sectores;

-- ---------------------------------------------------------------------------
-- 10. Permisos y RLS de la tabla nueva y de la ampliación de `frentes`.
--
-- `frentes` ya tenía RLS pensada solo para su módulo propio (frentes.ver /
-- .crear / .editar / .cerrar). Se le agrega una política ADICIONAL y
-- permisiva para quien administra catálogos del RDC — Postgres combina
-- políticas permisivas del mismo comando con OR, así que cualquiera de los
-- dos permisos alcanza; no hace falta que Responsable de Catálogo o
-- Consulta (que ya tienen rdc.catalogos_gestionar pero no frentes.ver/
-- .editar) reciban además esos otros permisos solo para poder usar esta
-- pantalla.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on sectores to authenticated;

alter table sectores enable row level security;
create policy sectores_select on sectores for select using (auth.role() = 'authenticated');
create policy sectores_write on sectores for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));

create policy frentes_select_rdc on frentes for select using (public.has_permission('rdc.catalogos_gestionar'));
create policy frentes_write_rdc on frentes for all
  using (public.has_permission('rdc.catalogos_gestionar'))
  with check (public.has_permission('rdc.catalogos_gestionar'));
