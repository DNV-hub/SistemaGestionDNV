-- Reporte Diario de Campo: cabecera y detalles.
-- Modelo derivado de docs/MODELO_RDC.md (ingeniería inversa del RDC en
-- producción). Los permisos y RLS van en la migración siguiente.
--
-- ===========================================================================
-- TRES DECISIONES DE ESQUEMA QUE IMPONE EL TRABAJO SIN SEÑAL
-- (restricción 8 de docs/PLAN_MIGRACION_RDC.md — los supervisores llenan el
-- reporte en mina, sin datos, y sincroniza cuando vuelve la conexión)
--
-- 1. LAS LLAVES PRIMARIAS NO TIENEN `default gen_random_uuid()`, A PROPÓSITO.
--    El reporte nace con identidad en el celular, antes de existir en el
--    servidor: el cliente genera el UUID y lo manda. Sin default, un cliente
--    que se olvide de generarlo falla ruidosamente en vez de recibir un id
--    nuevo del servidor — que es justo el bug que rompe la idempotencia (si
--    la conexión se corta a mitad del envío y el cliente reintenta, el
--    servidor crearía un segundo reporte en vez de reconocer el mismo).
--    Con el UUID del cliente, reintentar es un upsert sobre la misma fila.
--
-- 2. `creado_en_dispositivo` NO ES `created_at`. El primero es cuándo el
--    supervisor llenó el reporte (hora local del celular); el segundo, cuándo
--    llegó al servidor. Pueden separarse por días. `created_at` es, por
--    definición, el momento de la sincronización — por eso no se agrega
--    además un `sincronizado_en`, que sería la misma fecha dos veces.
--
-- 3. LOS DOS DESTINOS DE ENVÍO SE RASTREAN POR SEPARADO. Un reporte puede
--    haber llegado a Supabase y haber fallado el webhook de SharePoint, o al
--    revés. `estado_sharepoint` vive acá porque el servidor no puede saberlo
--    solo: se lo cuenta el cliente cuando el webhook responde. El estado
--    equivalente para Supabase NO se modela como columna: que la fila exista
--    en esta tabla ES la prueba de que se sincronizó. El cliente sí lleva su
--    propio `estado_supabase` en la cola de IndexedDB, donde sí significa
--    algo (pendiente / enviado / error).
-- ===========================================================================

create table rdc_reportes (
  id uuid primary key,
  fecha date not null,

  -- Se guarda el sector además del frente aunque sea derivable de
  -- rdc_frentes.sector_id: si mañana un frente se reasigna a otro sector, los
  -- reportes históricos deben seguir diciendo en qué sector se trabajó ese
  -- día. El Excel lo escribe como columna propia.
  sector_id uuid not null references rdc_sectores(id),
  frente_id uuid not null references rdc_frentes(id),

  -- Dos campos de autoría, no uno (docs/PLAN_MIGRACION_RDC.md §A.2):
  --   supervisor_id → quién es el responsable del frente ese día.
  --   creado_por    → quién estaba autenticado al llenarlo, lo pone el
  --                   sistema desde la sesión, nunca el formulario.
  -- Normalmente son la misma persona; separarlos permite que un asistente
  -- llene el reporte de un supervisor sin falsear la autoría, y elimina el
  -- agujero actual (hoy cualquiera elige cualquier nombre de un desplegable).
  supervisor_id uuid not null references rdc_supervisores(id),
  creado_por uuid not null references usuarios(id),
  capataz_id uuid references rdc_capataces(id),

  estado text not null default 'Borrador'
    check (estado in ('Borrador', 'Finalizado')),

  -- Restricción de acceso al frente (bloque condicional de la pestaña
  -- Jornada). Si no hubo, los tres campos quedan nulos.
  restriccion_acceso boolean not null default false,
  restriccion_descripcion text,
  restriccion_inicio time,
  restriccion_fin time,

  refrigerio_salida time,
  refrigerio_retorno time,

  observaciones text,
  requerimientos text,
  restricciones text,

  -- Redline: modificaciones respecto al plano original. El supervisor que lo
  -- firma es de la contratista, de ahí el catálogo aparte.
  redline boolean not null default false,
  redline_supervisor_id uuid references rdc_redline_supervisores(id),
  redline_descripcion text,

  -- Reenvío tras corregir un error. En el RDC actual esto cambia el nombre
  -- del archivo a "{frente}_{fecha}(C).xlsx" para que en SharePoint queden
  -- el original y la corrección, distinguibles a simple vista.
  es_correccion boolean not null default false,

  estado_sharepoint text not null default 'pendiente'
    check (estado_sharepoint in ('pendiente', 'enviado', 'error')),
  sharepoint_nombre_archivo text,
  sharepoint_enviado_at timestamptz,
  sharepoint_intentos integer not null default 0,
  sharepoint_error text,

  creado_en_dispositivo timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Clave de negocio. Sin turno: la operación es solo turno diurno
  -- (docs/MODELO_RDC.md §8.7). Evita que el mismo reporte entre dos veces
  -- desde dos dispositivos del mismo supervisor.
  unique (supervisor_id, frente_id, fecha),

  -- Coherencia interna: no tiene sentido describir una restricción que se
  -- declaró inexistente, ni un redline sin marcar que lo hubo.
  constraint rdc_reportes_restriccion_coherente check (
    restriccion_acceso
    or (restriccion_descripcion is null and restriccion_inicio is null and restriccion_fin is null)
  ),
  constraint rdc_reportes_redline_coherente check (
    redline or (redline_supervisor_id is null and redline_descripcion is null)
  )
);

create trigger trg_rdc_reportes_updated_at
  before update on rdc_reportes
  for each row execute function public.set_updated_at();

create index idx_rdc_reportes_fecha on rdc_reportes(fecha desc);
create index idx_rdc_reportes_frente on rdc_reportes(frente_id);
create index idx_rdc_reportes_supervisor on rdc_reportes(supervisor_id);
create index idx_rdc_reportes_creado_por on rdc_reportes(creado_por);
-- Para la cola de reenvío: buscar lo que quedó sin llegar a SharePoint.
create index idx_rdc_reportes_sharepoint_pendiente on rdc_reportes(estado_sharepoint)
  where estado_sharepoint <> 'enviado';

-- ---------------------------------------------------------------------------
-- Personal presente
--
-- Conteos por categoría, NO personal nominal: el RDC no registra quiénes
-- fueron, solo cuántos de cada tipo. El usuario confirmó conservarlo así; el
-- personal nominal se implementará mucho después (docs/MODELO_RDC.md §8.5).
--
-- Es tabla y no cinco columnas en la cabecera porque así se ve la hoja
-- RECURSOS del Excel (Item / Descripción / Cantidad / Horas), y porque las
-- categorías indirectas dependen del sector: hoy solo el sector
-- "A: 4000 - SALA ELECTRICA" agrega ingeniero residente, supervisor de campo,
-- ingenieros de seguridad, ingeniero de calidad y topógrafo. Como filas, eso
-- es dato; como columnas, sería una migración cada vez que cambie.
--
-- La Vigía cuenta como mano de obra DIRECTA (así lo hace el RDC hoy).
-- ---------------------------------------------------------------------------
create table rdc_reporte_personal (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  categoria text not null,
  tipo text not null check (tipo in ('directa', 'indirecta')),
  cantidad integer not null default 0 check (cantidad >= 0),
  orden integer not null default 0,
  unique (reporte_id, categoria)
);

create index idx_rdc_reporte_personal_reporte on rdc_reporte_personal(reporte_id);

-- ---------------------------------------------------------------------------
-- Maquinaria presente en el frente
--
-- `tipo` es lo que viaja al Excel (una columna por tipo). `maquinaria_id`
-- identifica la máquina concreta cuando el inventario de rdc_maquinarias ya
-- la tiene cargada, y es opcional para no bloquear el módulo mientras ese
-- inventario se llena. Cuando se identifica una máquina puntual la cantidad
-- es 1 por definición — de ahí el check.
--
-- Los equipos escritos a mano ("Equipo no listado" en el RDC actual) entran
-- acá con maquinaria_id nulo: es la vía de escape que el supervisor necesita
-- en campo cuando llega algo que no está en el catálogo.
-- ---------------------------------------------------------------------------
create table rdc_reporte_maquinaria (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  maquinaria_id uuid references rdc_maquinarias(id),
  tipo text not null,
  categoria text not null check (categoria in ('perforacion', 'soporte', 'otro')),
  cantidad integer not null check (cantidad > 0),
  orden integer not null default 0,
  constraint rdc_reporte_maquinaria_unitaria check (maquinaria_id is null or cantidad = 1)
);

create index idx_rdc_reporte_maquinaria_reporte on rdc_reporte_maquinaria(reporte_id);

-- ---------------------------------------------------------------------------
-- Hitos de la jornada
--
-- Los 8 hitos fijos (llegada al frente, charla de seguridad, PETAR, término
-- de jornada…) con su hora. Se guarda también el nombre y no solo el orden
-- para que un reporte viejo siga diciendo qué se marcó, aunque la lista de
-- hitos cambie después.
--
-- No es dato decorativo: el lapso entre el hito 1 (llegada) y el hito 4
-- (término de llenado de documentos) se exporta al Excel como un Stand By de
-- causa "Registro documentario".
-- ---------------------------------------------------------------------------
create table rdc_reporte_hitos (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  orden integer not null,
  nombre text not null,
  hora time,
  unique (reporte_id, orden)
);

create index idx_rdc_reporte_hitos_reporte on rdc_reporte_hitos(reporte_id);

-- ---------------------------------------------------------------------------
-- Metrados de los bloques 1 y 3, y partidas libres
--
-- El bloque 2 (actividades críticas) NO se guarda acá: sus totales se derivan
-- de rdc_reporte_elementos, elemento por elemento. Guardar además el agregado
-- sería tener dos fuentes de verdad que pueden discrepar.
--
-- `partida_codigo` referencia rdc_partidas_estandar.codigo; es nulo para las
-- partidas libres, que el supervisor escribe a mano cuando ejecutó algo que
-- no está en los bloques.
-- ---------------------------------------------------------------------------
create table rdc_reporte_metrados (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  bloque text not null check (bloque in ('1', '3', 'libre')),
  partida_codigo text references rdc_partidas_estandar(codigo),
  partida_nombre text not null,
  unidad text not null,
  cantidad numeric(14,3) not null check (cantidad >= 0),
  hora_inicio time,
  hora_fin time,
  orden integer not null default 0,
  constraint rdc_reporte_metrados_codigo_por_bloque check (
    (bloque = 'libre' and partida_codigo is null)
    or (bloque in ('1', '3') and partida_codigo is not null)
  )
);

create index idx_rdc_reporte_metrados_reporte on rdc_reporte_metrados(reporte_id);

-- ---------------------------------------------------------------------------
-- Elementos de sostenimiento (bloque 2 — actividades críticas)
--
-- Una fila por elemento individual: cada perno perforado, cada perno
-- inyectado, cada paño de malla, cada cable, cada ensayo de Pull Test. Es la
-- colección más grande del reporte — el RDC permite cargar rangos de hasta
-- 200 pernos de una vez, y cada uno genera su propia fila.
--
-- Alimenta la hoja CONTROL_SOSTENIMIENTO del Excel (22 columnas) y, agregada,
-- las filas del bloque 2 de la hoja METRADOS.
--
-- Las combinaciones válidas de elemento + actividad + unidad son las cinco
-- del formulario: Perno/Perforación/ML, Perno/Inyección/ML, Perno/Pull
-- Test/UND, Malla/Instalación/M2 y Cable/Instalación/ML.
-- ---------------------------------------------------------------------------
create table rdc_reporte_elementos (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  elemento text not null check (elemento in ('Perno', 'Malla', 'Cable')),
  actividad text not null check (actividad in ('Perforación', 'Inyección', 'Instalación', 'Pull Test')),
  tipo text,
  sistema text,
  zona text,
  codigo text,
  ubicacion text,
  cantidad numeric(14,3) not null check (cantidad >= 0),
  unidad text not null check (unidad in ('ML', 'M2', 'UND')),
  ancho numeric(10,3),
  largo numeric(10,3),
  -- El Excel trae una columna "Área (M2)" que hoy se calcula en JavaScript al
  -- exportar. Como columna generada no puede quedar desincronizada del ancho
  -- y el largo que le dieron origen.
  area_m2 numeric(14,3) generated always as (ancho * largo) stored,
  diametro text,
  plano text,
  tipo_perforadora text,
  hora_inicio time,
  hora_fin time,
  orden integer not null default 0,
  constraint rdc_reporte_elementos_combinacion check (
    (elemento = 'Perno' and actividad in ('Perforación', 'Inyección', 'Pull Test'))
    or (elemento in ('Malla', 'Cable') and actividad = 'Instalación')
  )
);

create index idx_rdc_reporte_elementos_reporte on rdc_reporte_elementos(reporte_id);
create index idx_rdc_reporte_elementos_codigo on rdc_reporte_elementos(codigo);

-- ---------------------------------------------------------------------------
-- Bitácora de actividades
--
-- Solo las actividades que el supervisor escribe a mano. Las que el RDC
-- genera solo desde los metrados ("Se realizaron perforaciones con un total
-- de 42 ML — Pernos: …") son texto derivado y se vuelven a generar al
-- exportar; guardarlas sería congelar una redacción que puede cambiar.
-- ---------------------------------------------------------------------------
create table rdc_reporte_bitacora (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  hora_inicio time,
  hora_fin time,
  actividad text not null,
  orden integer not null default 0
);

create index idx_rdc_reporte_bitacora_reporte on rdc_reporte_bitacora(reporte_id);

-- ---------------------------------------------------------------------------
-- Stand by (paradas de la cuadrilla)
--
-- Dos formas de declarar la duración, según la causa:
--   - lo normal: rango `desde`–`hasta`.
--   - la causa "CIERRE DE VÍAS POR ENCAPSULADOS": no hay rango, se declara un
--     tiempo total en horas y minutos (así funciona hoy en el RDC).
-- Se guardan las dos representaciones tal como se capturaron; los minutos
-- totales los calcula la aplicación, que es donde ya vive esa regla.
--
-- `causa_otro` acompaña a la causa 'OTRO' (texto libre del supervisor).
-- ---------------------------------------------------------------------------
create table rdc_reporte_standby (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  actividad text,
  desde time,
  hasta time,
  causa text not null,
  causa_otro text,
  responsable text,
  comentario text,
  total_horas integer check (total_horas >= 0),
  total_minutos integer check (total_minutos >= 0),
  orden integer not null default 0,
  constraint rdc_reporte_standby_duracion check (
    (desde is not null and hasta is not null)
    or coalesce(total_horas, 0) > 0
    or coalesce(total_minutos, 0) > 0
  )
);

create index idx_rdc_reporte_standby_reporte on rdc_reporte_standby(reporte_id);

-- ---------------------------------------------------------------------------
-- Programación del día siguiente
--
-- Dos listas separadas en el formulario: lo que se planea ejecutar mañana
-- (elegido de las partidas registradas hoy) y las actividades no programadas.
-- Se distinguen por `tipo` en vez de por tabla: mismos campos, mismo uso.
-- ---------------------------------------------------------------------------
create table rdc_reporte_programacion (
  id uuid primary key,
  reporte_id uuid not null references rdc_reportes(id) on delete cascade,
  tipo text not null check (tipo in ('programada', 'no_programada')),
  etiqueta text,
  descripcion text,
  orden integer not null default 0
);

create index idx_rdc_reporte_programacion_reporte on rdc_reporte_programacion(reporte_id);
