-- Carga real de Categoría → Tipo de material para el catálogo, a partir del
-- Excel de ejemplo que compartió el usuario ("RESUMEN - STOCK MATERIALES DE
-- SOSTENIMIENTO": PERNOS, MALLA DE ALTA RESISTENCIA, CABLE DE ACERO, BROCA)
-- más el resto del catálogo real (104 materiales), clasificado por similitud
-- con esas mismas familias — el usuario dio libertad explícita para asumir
-- la categoría de lo que el ejemplo no cubría.
--
-- Estructura: `categorias` ya soportaba padre/hijo (categoria_padre_id)
-- desde el inicio pero nunca se había usado — 1 sola fila suelta ("MALLA",
-- sin uso). Categoría = el padre (PERNOS, PLACAS...), Tipo de material = el
-- hijo (Barra Helicoidal D25mm, Placa Bahe...), igual que la plantilla.
--
-- Se asigna por CÓDIGO, no por fila individual: todas las filas que
-- comparten un código son variantes de largo/diámetro del mismo producto
-- (ya lo sabíamos: el código no es identidad, pero dentro de un mismo
-- código, todas las filas SÍ son el mismo tipo de material). La única
-- excepción real es 'M80.4', que el catálogo tiene repetido para dos
-- productos distintos (Minax y Deltax) — se distingue por descripción.
--
-- 'SIN-EDP' (descripción literal "NULL") no se toca: es una fila basura,
-- no un material real — se deja sin categoría a propósito, para que quede
-- visible como pendiente de revisar o borrar.

delete from categorias where nombre = 'MALLA' and categoria_padre_id is null;

do $$
declare
  v_pernos uuid; v_malla_resist uuid; v_geo uuid; v_malla_diversas uuid;
  v_cable uuid; v_broca uuid; v_placas uuid; v_tuercas uuid; v_acoples uuid;
  v_anclajes uuid; v_barreras uuid; v_sujetacables uuid; v_grilletes uuid;
  v_clips uuid; v_insumos uuid; v_perforacion uuid; v_izaje uuid; v_varios uuid;

  v_barra25 uuid; v_barra32 uuid; v_perno_auto uuid;
  v_deltax uuid; v_minax uuid; v_tecco uuid;
  v_geotextil uuid; v_geomalla uuid;
  v_triple_torsion uuid; v_olimpica uuid; v_raschel uuid;
  v_cable_boa uuid;
  v_broca_auto uuid;
  v_placa_bahe uuid; v_placa_abovedada uuid; v_placa_nivelante uuid; v_placa_spike uuid; v_placa_rana uuid;
  v_tuerca_bahe uuid; v_tuerca_auto uuid;
  v_acople_helic uuid; v_acople_auto uuid;
  v_anclaje1 uuid; v_anclaje2 uuid;
  v_gbe1000 uuid; v_gbe500 uuid;
  v_sujetacable uuid;
  v_grillete uuid;
  v_clip uuid;
  v_cemento uuid; v_aditivo uuid; v_acero_corrugado uuid; v_agua uuid;
  v_centralizador uuid;
  v_cancamo uuid; v_garrota uuid;
  v_alambre uuid; v_soga uuid;
begin
  -- Categorías (padre)
  insert into categorias (nombre) values ('PERNOS') returning id into v_pernos;
  insert into categorias (nombre) values ('MALLA DE ALTA RESISTENCIA') returning id into v_malla_resist;
  insert into categorias (nombre) values ('GEOSINTETICOS') returning id into v_geo;
  insert into categorias (nombre) values ('MALLAS DIVERSAS') returning id into v_malla_diversas;
  insert into categorias (nombre) values ('CABLE DE ACERO') returning id into v_cable;
  insert into categorias (nombre) values ('BROCAS') returning id into v_broca;
  insert into categorias (nombre) values ('PLACAS') returning id into v_placas;
  insert into categorias (nombre) values ('TUERCAS') returning id into v_tuercas;
  insert into categorias (nombre) values ('ACOPLES') returning id into v_acoples;
  insert into categorias (nombre) values ('ANCLAJES') returning id into v_anclajes;
  insert into categorias (nombre) values ('BARRERAS DINAMICAS') returning id into v_barreras;
  insert into categorias (nombre) values ('SUJETACABLES') returning id into v_sujetacables;
  insert into categorias (nombre) values ('GRILLETES') returning id into v_grilletes;
  insert into categorias (nombre) values ('CLIPS DE CONEXION') returning id into v_clips;
  insert into categorias (nombre) values ('INSUMOS DE CONCRETO') returning id into v_insumos;
  insert into categorias (nombre) values ('ACCESORIOS DE PERFORACION') returning id into v_perforacion;
  insert into categorias (nombre) values ('ACCESORIOS DE IZAJE Y AMARRE') returning id into v_izaje;
  insert into categorias (nombre) values ('VARIOS') returning id into v_varios;

  -- Tipos de material (hijo), cada uno colgando de su categoría
  insert into categorias (nombre, categoria_padre_id) values ('Barra Helicoidal D25mm', v_pernos) returning id into v_barra25;
  insert into categorias (nombre, categoria_padre_id) values ('Barra Helicoidal D32mm', v_pernos) returning id into v_barra32;
  insert into categorias (nombre, categoria_padre_id) values ('Perno Autoperforante', v_pernos) returning id into v_perno_auto;

  insert into categorias (nombre, categoria_padre_id) values ('Malla Deltax', v_malla_resist) returning id into v_deltax;
  insert into categorias (nombre, categoria_padre_id) values ('Malla Minax', v_malla_resist) returning id into v_minax;
  insert into categorias (nombre, categoria_padre_id) values ('Malla Tecco', v_malla_resist) returning id into v_tecco;

  insert into categorias (nombre, categoria_padre_id) values ('Geotextil', v_geo) returning id into v_geotextil;
  insert into categorias (nombre, categoria_padre_id) values ('Geomalla Biaxial', v_geo) returning id into v_geomalla;

  insert into categorias (nombre, categoria_padre_id) values ('Malla Triple Torsion', v_malla_diversas) returning id into v_triple_torsion;
  insert into categorias (nombre, categoria_padre_id) values ('Malla Olimpica', v_malla_diversas) returning id into v_olimpica;
  insert into categorias (nombre, categoria_padre_id) values ('Malla Raschel', v_malla_diversas) returning id into v_raschel;

  insert into categorias (nombre, categoria_padre_id) values ('Cable de Acero BOA', v_cable) returning id into v_cable_boa;
  insert into categorias (nombre, categoria_padre_id) values ('Broca Autoperforante', v_broca) returning id into v_broca_auto;

  insert into categorias (nombre, categoria_padre_id) values ('Placa Bahe', v_placas) returning id into v_placa_bahe;
  insert into categorias (nombre, categoria_padre_id) values ('Placa Abovedada', v_placas) returning id into v_placa_abovedada;
  insert into categorias (nombre, categoria_padre_id) values ('Placa Base Nivelante', v_placas) returning id into v_placa_nivelante;
  insert into categorias (nombre, categoria_padre_id) values ('Placa Spike', v_placas) returning id into v_placa_spike;
  insert into categorias (nombre, categoria_padre_id) values ('Placa Tipo Rana', v_placas) returning id into v_placa_rana;

  insert into categorias (nombre, categoria_padre_id) values ('Tuerca Bahe', v_tuercas) returning id into v_tuerca_bahe;
  insert into categorias (nombre, categoria_padre_id) values ('Tuerca Autoperforante', v_tuercas) returning id into v_tuerca_auto;

  insert into categorias (nombre, categoria_padre_id) values ('Acople Helicoidal', v_acoples) returning id into v_acople_helic;
  insert into categorias (nombre, categoria_padre_id) values ('Acople Autoperforante', v_acoples) returning id into v_acople_auto;

  insert into categorias (nombre, categoria_padre_id) values ('Anclaje GA-7001 Tipo I', v_anclajes) returning id into v_anclaje1;
  insert into categorias (nombre, categoria_padre_id) values ('Anclaje GA-7001 Tipo II', v_anclajes) returning id into v_anclaje2;

  insert into categorias (nombre, categoria_padre_id) values ('Barrera GBE 1000', v_barreras) returning id into v_gbe1000;
  insert into categorias (nombre, categoria_padre_id) values ('Barrera GBE 500', v_barreras) returning id into v_gbe500;

  insert into categorias (nombre, categoria_padre_id) values ('Sujetacable', v_sujetacables) returning id into v_sujetacable;
  insert into categorias (nombre, categoria_padre_id) values ('Grillete', v_grilletes) returning id into v_grillete;
  insert into categorias (nombre, categoria_padre_id) values ('Clip de Conexion', v_clips) returning id into v_clip;

  insert into categorias (nombre, categoria_padre_id) values ('Cemento', v_insumos) returning id into v_cemento;
  insert into categorias (nombre, categoria_padre_id) values ('Aditivo', v_insumos) returning id into v_aditivo;
  insert into categorias (nombre, categoria_padre_id) values ('Acero Corrugado', v_insumos) returning id into v_acero_corrugado;
  insert into categorias (nombre, categoria_padre_id) values ('Agua', v_insumos) returning id into v_agua;

  insert into categorias (nombre, categoria_padre_id) values ('Centralizador', v_perforacion) returning id into v_centralizador;
  insert into categorias (nombre, categoria_padre_id) values ('Cancamo', v_izaje) returning id into v_cancamo;
  insert into categorias (nombre, categoria_padre_id) values ('Garrota', v_izaje) returning id into v_garrota;
  insert into categorias (nombre, categoria_padre_id) values ('Alambre', v_varios) returning id into v_alambre;
  insert into categorias (nombre, categoria_padre_id) values ('Soga', v_varios) returning id into v_soga;

  -- Asignación por código (cubre todas las variantes de largo/diámetro que
  -- comparten ese código de un solo saque).
  update materiales set categoria_id = v_barra25 where codigo in ('PERNO.B25', 'PERNO.B25L2');
  update materiales set categoria_id = v_barra32 where codigo = 'PERNO.B32';
  update materiales set categoria_id = v_perno_auto where codigo in ('PERNO.AUTO_R32', 'PERNO.AUTO_R38');

  update materiales set categoria_id = v_deltax where codigo in ('D80.2', 'D80.3');
  update materiales set categoria_id = v_minax where codigo = 'M80.3';
  -- M80.4 es el código compartido por dos productos distintos (ver
  -- comentario de arriba): se distingue por descripción, no por código.
  update materiales set categoria_id = v_deltax where codigo = 'M80.4' and descripcion ilike '%DELTAX%';
  update materiales set categoria_id = v_minax where codigo = 'M80.4' and descripcion ilike '%MINAX%';
  update materiales set categoria_id = v_tecco where codigo in ('T65.3', 'T65.4', 'T80.3');

  update materiales set categoria_id = v_geotextil where codigo = 'GEO_4X100';
  update materiales set categoria_id = v_geomalla where codigo = 'GEO_4X130';

  update materiales set categoria_id = v_triple_torsion where codigo = 'MA_TT';
  update materiales set categoria_id = v_olimpica where codigo = 'MALLA_OL';
  update materiales set categoria_id = v_raschel where codigo = 'RATCHER';

  update materiales set categoria_id = v_cable_boa where codigo in ('CABLE.6', 'CABLE.12', 'CABLE.16', 'CABLE.19', 'CABLE.22');
  update materiales set categoria_id = v_broca_auto where codigo in ('BROCA.R32', 'BROCA.R38');

  update materiales set categoria_id = v_placa_bahe where codigo in ('PLACA.B19', 'PLACA.B25', 'PLACA.B32');
  update materiales set categoria_id = v_placa_abovedada where codigo = 'PLACA.B38';
  update materiales set categoria_id = v_placa_nivelante where codigo = 'PLACA.NIV.GBE1000';
  update materiales set categoria_id = v_placa_spike where codigo = 'PLACA.SP.33';
  update materiales set categoria_id = v_placa_rana where codigo in ('PLACA.TR25', 'PLACA.TR30', 'PLACA.TR32', 'PLACA.TR38');

  update materiales set categoria_id = v_tuerca_bahe where codigo in ('TUERCA.B19', 'TUERCA.B25', 'TUERCA.B32');
  update materiales set categoria_id = v_tuerca_auto where codigo in ('TUERCA.R32', 'TUERCA.R38');

  update materiales set categoria_id = v_acople_helic where codigo in ('ACOPLE.H25', 'ACOPLE.H32');
  update materiales set categoria_id = v_acople_auto where codigo in ('COPLE.R32', 'COPLE.R38');

  update materiales set categoria_id = v_anclaje1 where codigo in ('GA105.2M', 'GA105.3M');
  update materiales set categoria_id = v_anclaje2 where codigo in ('GA145.2M', 'GA145.3M', 'GA145.4M', 'GA145.5M', 'GA185.3M');

  update materiales set categoria_id = v_gbe1000 where codigo in ('BARR.DIN.GBE1000', 'GBE.1000.4M');
  update materiales set categoria_id = v_gbe500 where codigo in ('GBE.500.3M', 'GBE.500.4M');

  update materiales set categoria_id = v_sujetacable where codigo in ('SUJE.6', 'SUJE.12', 'SUJE.16', 'SUJE.19', 'SUJE.22');
  update materiales set categoria_id = v_grillete where codigo in ('GRI.1', 'GRI.12', 'GRI.34', 'GRI.58', 'GRI.78');
  update materiales set categoria_id = v_clip where codigo in ('C.T2', 'C.T3');

  update materiales set categoria_id = v_cemento where codigo in ('CEM', 'CEM.CO', 'CEM.EX');
  update materiales set categoria_id = v_aditivo where codigo in ('SIKAMENT', 'CONCRELISTO', 'INPE_985');
  update materiales set categoria_id = v_acero_corrugado where codigo = 'ACE_CO';
  update materiales set categoria_id = v_agua where codigo = 'AGUA';

  update materiales set categoria_id = v_centralizador where codigo = 'CENTRA';
  update materiales set categoria_id = v_cancamo where codigo = 'CANCAMO';
  update materiales set categoria_id = v_garrota where codigo = 'GARRO';
  update materiales set categoria_id = v_alambre where codigo = 'ALAMBRE';
  update materiales set categoria_id = v_soga where codigo = 'SOGA';

  -- 'SIN-EDP' (descripción "NULL") queda sin categoría a propósito: no es
  -- un material real, es una fila basura que conviene revisar o borrar.
end $$;
