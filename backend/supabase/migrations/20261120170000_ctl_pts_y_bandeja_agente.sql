-- Lienzo 6 · Planeamiento › Informe semanal y Bandeja del agente.
-- ctl_pts: plan de trabajo semanal (Excel PLAN DE TRABAJO) que sube cada
--   supervisor martes o miércoles; el sistema lo lee al subirlo (fechas de la
--   semana jueves–miércoles, actividades programadas por día, restricciones).
--   Las restricciones imputables a DESNIVEL se anulan: solo cuentan clima,
--   cliente y terceros (criterio aprobado 20/11/2026).
-- ctl_agente_corrida / ctl_agente_hallazgo: lo que el agente de planeamiento
--   revisó en la bandeja de entrada y lo que encontró. Nada se carga al
--   sistema sin la aprobación de Planeamiento.

create table if not exists public.ctl_pts (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.frentes(id) on delete cascade,
  semana text not null,                 -- S47
  desde date not null,                  -- jueves
  hasta date not null,                  -- miércoles
  archivo text not null,                -- ruta en frentes-archivos
  nombre_archivo text,
  actividades jsonb not null default '[]'::jsonb,   -- [{item, actividad, dias:[0..6]}]
  restricciones jsonb not null default '[]'::jsonb, -- [{actividad, restriccion, responsable, anulada}]
  fuerza_laboral jsonb,                              -- {fecha: personas}
  observaciones text[] not null default '{}',
  estado text not null default 'recibido' check (estado in ('recibido','observado','rechazado')),
  subido_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (frente_id, semana)
);
alter table public.ctl_pts enable row level security;
drop policy if exists ctl_pts_select on public.ctl_pts;
create policy ctl_pts_select on public.ctl_pts for select to authenticated
  using (public.has_permission('frentes.ver') or public.has_permission('procura.ver'));
drop policy if exists ctl_pts_write on public.ctl_pts;
create policy ctl_pts_write on public.ctl_pts for all to authenticated
  using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));

create table if not exists public.ctl_agente_corrida (
  id uuid primary key default gen_random_uuid(),
  ejecutado_en timestamptz not null default now(),
  carpetas text,
  archivos_nuevos int not null default 0,
  archivos_nuevos_detalle text,
  planos_revisados int not null default 0,
  planos_detalle text,
  cronogramas_leidos int not null default 0,
  cronogramas_detalle text
);
alter table public.ctl_agente_corrida enable row level security;
drop policy if exists ctl_agente_corrida_select on public.ctl_agente_corrida;
create policy ctl_agente_corrida_select on public.ctl_agente_corrida for select to authenticated
  using (public.has_permission('procura.crear_version'));

create table if not exists public.ctl_agente_hallazgo (
  id uuid primary key default gen_random_uuid(),
  corrida_id uuid references public.ctl_agente_corrida(id) on delete cascade,
  categoria text not null check (categoria in ('decision','plano','cronograma','evidencia','filtro','informe')),
  orden int not null default 0,
  frente text,
  sector text,
  titulo text not null,
  subtitulo text,
  dato1 text,
  dato2 text,
  destino text,
  nivel text not null default 'MEDIA' check (nivel in ('ALTA','MEDIA','BAJA','OK')),
  detalle text,
  accion text,
  estado text not null default 'abierto' check (estado in ('abierto','resuelto')),
  resuelto_por uuid,
  resuelto_en timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ctl_agente_hallazgo enable row level security;
drop policy if exists ctl_agente_hallazgo_select on public.ctl_agente_hallazgo;
create policy ctl_agente_hallazgo_select on public.ctl_agente_hallazgo for select to authenticated
  using (public.has_permission('procura.crear_version'));
drop policy if exists ctl_agente_hallazgo_update on public.ctl_agente_hallazgo;
create policy ctl_agente_hallazgo_update on public.ctl_agente_hallazgo for update to authenticated
  using (public.has_permission('procura.crear_version')) with check (public.has_permission('procura.crear_version'));

-- Primera corrida del agente (18/11/2026 13:55), cargada desde su revisión de la bandeja de entrada
with c as (insert into public.ctl_agente_corrida (ejecutado_en, carpetas, archivos_nuevos, archivos_nuevos_detalle, planos_revisados, planos_detalle, cronogramas_leidos, cronogramas_detalle)
values ('2026-11-18 13:55:00-05', '01_BANDEJA_ENTRADA (planos, cronogramas, directrices, procura, fotos, sketch de campo) y 06_INFORME_SEMANAL', 2, 'Redline Barrera 18/11 · ZCM07 Activo A1', 20, '5 frentes · 12 grupos', 3, 'ZCM y VPM Rev00 · Barrera Rev01') returning id)
insert into public.ctl_agente_hallazgo (corrida_id, categoria, orden, frente, sector, titulo, subtitulo, dato1, dato2, destino, nivel, detalle, accion) values
((select id from c),'decision',0,null,null,'ZCM07 Activo A1',null,null,null,null,'ALTA','¿lo cargo como nueva revisión (Rev01) del Activo 1, reemplazando a CE1090?',null),
((select id from c),'decision',1,null,null,'Línea base de ZCM06',null,null,null,null,'ALTA','¿Rev00 del 02/11 al 27/11 (la que usa la curva) o la del cronograma de Área 3000 (22/10 al 18/11)?',null),
((select id from c),'decision',2,null,null,'VPM-05',null,null,null,null,'ALTA','¿pedimos Rev01 con las fechas reales antes de activar su curva S?',null),
((select id from c),'decision',3,null,null,'Renombrar el plano de VPM-05',null,null,null,null,'ALTA','Pasarlo a CE1091 y moverlo a 02_FRENTES/VPM05.',null),
((select id from c),'decision',4,null,null,'Barrera N°5',null,null,null,null,'ALTA','¿la reperforación Ø70 de P7, P8 y P9 se valoriza como mayor metrado?',null),
((select id from c),'decision',5,null,null,'Almacén',null,null,null,null,'ALTA','¿retenemos la recepción de la devolución VD-0144 de ZCM06 (retazo 80/3) hasta remedir en campo?',null),
((select id from c),'decision',6,null,null,'Vales y RDC',null,null,null,null,'ALTA','¿hacemos obligatorio el destino del material y la unidad fija por partida desde el próximo reporte?',null),
((select id from c),'plano',0,'ZCM06','Pasivo 1 · Pasivo 2','CE1087 (A) y (B) · Constructivo v3','Plano','74 pernos (P1 39 · P2 35)','MINAX 80/4 · 80/3','02_FRENTES/ZCM06/2_PLANOS','OK','Ya cargado en el sistema; coincide con la biblioteca de pernos.',null),
((select id from c),'plano',1,'ZCM06','Pasivo 1 · Pasivo 2','CE1087 (A) RL01 · 12/11','Redline','74 pernos · P2-P23 retirado','MINAX 80/4 · 80/3','02_FRENTES/ZCM06/3_REDLINE','OK','Vigente. Es la base del sketch y de los metrados.',null),
((select id from c),'plano',2,'ZCM06','Por definir','RED LINE 09NOV (imagen)','Redline','—','—','Por revisar','MEDIA','Imagen JPEG sin datos legibles por texto: confirmar firma de BBA antes de usarla.',null),
((select id from c),'plano',3,'ZCM07','Pasivo 1 · Pasivo 2','CE1089 Rev00 · Pasivo P1 y P2','Plano','39 pernos (P1 21 · P2 18)','DELTAX G80/2','02_FRENTES/ZCM07/2_PLANOS · sector Pasivo 1 y 2','ALTA','El Rev00 del cronograma programa TECCO G65/3 (2,160 m²) y MINAX 80/3 (810 m²); el plano indica DELTAX G80/2.',null),
((select id from c),'plano',4,'ZCM07','Pasivo 1 · Pasivo 2','CE1089 Rev00 (A) RL1 · Pasivo P1-P2','Redline','42 códigos','DELTAX G80/2','02_FRENTES/ZCM07/3_REDLINE','MEDIA','Sin fecha en el nombre ni en el texto: pedir fecha y firma de BBA.',null),
((select id from c),'plano',5,'ZCM07','Activo 1','CE1090 Rev0 · Activo','Plano','70 códigos legibles (P1–P72)','TECCO G65/3','02_FRENTES/ZCM07/2_PLANOS · sector Activo 1','MEDIA','Faltan P15 y P16, y unas 40 etiquetas salen cortadas como "P1": validar contra el CAD.',null),
((select id from c),'plano',6,'ZCM07','Activo 1','REV 0 · Activo A1 (subido hoy 18/11)','Plano','127 pernos (P1–P127)','MINAX 80/4','Retenido: no reemplaza a CE1090 sin tu aprobación','ALTA','Dice "REV 0", igual que CE1090, pero cambia la malla (TECCO G65/3 → MINAX 80/4) y los pernos (72 → 127). Etiquetas con error: "0CM-7A/P50" y "ZCM-7A/102". El área crítica dice "patrón y ángulo sujetos a evaluación en campo".',null),
((select id from c),'plano',7,'ZCM07','Por definir','REDLINE 08.11 y 09.11 (imágenes)','Redline','—','—','Por revisar','MEDIA','Imágenes JPEG: confirmar firma y si ya están dentro del RL1.',null),
((select id from c),'plano',8,'VPM-03','Zona 02 · Zona 03','CE1084 Rev0 (A) Zona 03 y (B) Zona 02','Plano','113 pernos (Z03 62 · Z02 51)','MINAX 80/3 · DELTAX G80/2','02_FRENTES/VPM03/2_PLANOS · sectores Zona 02 y 03','BAJA','El plano dice Área 2000; el cronograma Rev00 lo rotula Área 3000.',null),
((select id from c),'plano',9,'VPM-03','Zona 02 · Zona 03','CE1084 RL1 Zona 03 · Zona 02 · RL 07.11 · RL 15.11','Redline','RL1 Z03 88 códigos · Z02 52','—','02_FRENTES/VPM03/3_REDLINE','MEDIA','RL 15.11 es imagen: confirmar firma. Hay dos redlines de Zona 03 (RL1 y "al 07nov"): definir cuál es el vigente.',null),
((select id from c),'plano',10,'VPM-05','Pasivo','"VMP05 · SKETCH DE AVANCE · CE1087 (A)"','Plano','49 pernos (VM-05/P1–P49)','DELTAX G80/2','Renombrar a CE1091 · 02_FRENTES/VPM05/2_PLANOS','ALTA','El nombre dice CE1087 (que es el plano de ZCM06), pero el contenido es CE1091, Km 8+700–8+860. El Rev00 programa MINAX 80/4 (3,700 m²); el plano indica DELTAX G80/2.',null),
((select id from c),'plano',11,'Barrera N°5','Encapsulado','REDLINE 17.11 y 18.11 · firmados por BBA','Redline','+P34 y +P35 · P1 anulado · P45, P106 y P107 reubicados','MINAX 80/4 · 80/3 · DELTAX G80/2','02_FRENTES/BARRERA5/3_REDLINE','MEDIA','Nota 2 (18/11): reperforación de P7, P8 y P9 con Ø70 por condición del terreno. Definir si se valoriza como mayor metrado (el redline está firmado).',null),
((select id from c),'cronograma',0,'ZCM05, ZCM08, ZCM06, ZCM07, ZCM02',null,'ZCM (Área 3000)','Rev00 · 26/09',null,null,null,'ALTA','ZCM06 figura del 22/10 al 18/11 como "5+980 @ 6+025 Activo"; la línea base cargada para ZCM06 va del 02/11 al 27/11, Pasivo Km 43+194–43+215. Hay dos Rev00 distintos: definir cuál es el oficial.',null),
((select id from c),'cronograma',1,'ZCM07',null,'ZCM (Área 3000)','Rev00 · 26/09',null,null,null,'OK','ZCM07 del 01/11/26 al 12/01/27 · 14 partidas con metrado. Lista para la curva S.',null),
((select id from c),'cronograma',2,'VPM03, VPM02, VPM04, VPM05',null,'VPM (Área 2000)','Rev00 · 29/09',null,null,null,'ALTA','VPM05 programado del 01/01/27 al 20/02/27, pero el frente ya está activo (RDC del 13 al 17/11). Sin un Rev01 la curva S de VPM05 sale sin base. El hito final dice "Entrega de área – VPM04" (copiado).',null),
((select id from c),'cronograma',3,'VPM03',null,'VPM (Área 2000)','Rev00 · 29/09',null,null,null,'MEDIA','Termina el 21/11/26. Si el frente sigue, necesita Rev01 o ampliación.',null),
((select id from c),'cronograma',4,'Barrera Dinámica N°5',null,'Barrera N°5','Rev01 · 26/09',null,null,null,'MEDIA','Termina el 28/11/26. La reperforación Ø70 del redline 18/11 no está en el cronograma.',null),
((select id from c),'evidencia',0,null,null,'VPM-03 · A. Mendez',null,null,null,null,'ALTA','La misma foto aparece 4 veces: dos el 14/11 y dos el 15/11 (archivo idéntico). Además, una foto del 16/11 se repite el 17/11. No se usan como evidencia hasta confirmar.',null),
((select id from c),'evidencia',1,null,null,'VPM-02 · 13/11',null,null,null,null,'MEDIA','Carpeta de fotos de VPM-02, que no es un frente activo. Confirmar si corresponde a VPM-03.',null),
((select id from c),'evidencia',2,null,null,'Raíz 12/11 · C. Montero',null,null,null,null,'MEDIA','6 fotos sin carpeta de frente. El supervisor estuvo en ZCM07 ese día: propuesta asignarlas a ZCM07.',null),
((select id from c),'evidencia',3,null,null,'REPORTES CAPATAZ 14.11.2026.txt',null,null,null,null,'BAJA','Texto sin frente en el nombre: el agente lo cruza con los RDC del 14/11 antes de usarlo.',null),
((select id from c),'filtro',0,'VPM-03',null,'"Instalación de Tirolina" · 51.40 und',null,null,null,null,'MEDIA','und con decimales: la partida se mide en unidades enteras','Bloquear unidad · pedir corrección'),
((select id from c),'filtro',1,'Barrera N°5',null,'"Cosido de malla" en m² y en ml',null,null,null,null,'MEDIA','misma partida en dos unidades','Normalizar a m² (R-03: cosido = malla instalada)'),
((select id from c),'filtro',2,'ZCM06',null,'"Se trasladó 02 rollos minax 80/4 mediante tirolina"',null,null,null,null,'MEDIA','es una actividad logística escrita como partida','No metrar · pasa al comentario de logística'),
((select id from c),'filtro',3,'ZCM07 · VPM-03',null,'"Traslado de malla por Tirolina" · 1,053 y 2,223 m²',null,null,null,null,'MEDIA','m² de traslado que se pueden confundir con malla instalada','Excluir de la malla valorizable'),
((select id from c),'filtro',4,'VPM-03',null,'"Inyección de cáncamos línea de vida" · 34.50 ml',null,null,null,null,'MEDIA','facilidad, no sostenimiento','Partida de línea de vida, no valoriza pernos'),
((select id from c),'informe',0,null,null,'Dos líneas base distintas para ZCM-06',null,null,null,null,'ALTA','El informe S46 dice Real 42 % vs Previsto 39 % (+3 %, adelantado). El sistema, con lo aprobado del Control diario y la curva Rev00, da 43.7 % vs 47.0 % al 11/11 (−3.3 %, atrasado). Hay que definir cuál curva es la oficial antes de automatizar.',null),
((select id from c),'informe',1,null,null,'Stand-by: título y totales',null,null,null,null,'ALTA','El título dice SEM46 (05–11/11) pero las fechas son del 12–18/11 (SEM47). Dice "18 eventos" y hay 25 filas. ZCM-06 18/11 está duplicado (2 × 02:00; el RDC tiene uno). El 13/11 dice 02:20 y el RDC 02:27.',null),
((select id from c),'informe',2,null,null,'Nota de la Figura 01 invertida',null,null,null,null,'MEDIA','"Real 39 % vs Previsto 42 %, adelantado 3 %" contradice la Tabla 01 (Previsto 39 %, Real 42 %).',null),
((select id from c),'informe',3,null,null,'Frente equivocado en VPM-05',null,null,null,null,'MEDIA','La nota de la Figura 05 dice "Curva S VPM-02" y la tabla de metrados de VPM-05 dice "VPM-02 Pasivo".',null),
((select id from c),'informe',4,null,null,'Barrera Mar con dos desviaciones',null,null,null,null,'MEDIA','Tabla 01: +2 % (64 vs 62). Riesgos: +4 % (64 vs 60).',null),
((select id from c),'informe',5,null,null,'Numeración de tablas',null,null,null,null,'MEDIA','Tabla 04, 05, 08, 08, 07: hay una repetida y falta la 06. El sistema numera solo.',null),
((select id from c),'informe',6,null,null,'Fuerza laboral con otra semana',null,null,null,null,'MEDIA','El gráfico dice semana 12–18/11 pero el eje muestra Jue 29 a Mié 04.',null),
((select id from c),'informe',7,null,null,'VPM-02 en Riesgos',null,null,null,null,'MEDIA','Dice "culminado al 100 %" y a la vez "perforación, inyección y malla en progreso".',null);
-- Decisiones ya tomadas por Planeamiento el 20/11/2026
update public.ctl_agente_hallazgo set estado = 'resuelto', resuelto_en = '2026-11-20 10:00:00-05',
  accion = 'Resuelto 20/11: fechas del cronograma Rev00, metrado del plano constructivo o redline aprobado, HH = ratio × metrado.'
 where titulo in ('Línea base de ZCM06', 'Dos líneas base distintas para ZCM-06') or (categoria = 'cronograma' and orden = 0);
update public.ctl_agente_hallazgo set estado = 'resuelto', resuelto_en = '2026-11-20 10:00:00-05',
  accion = 'Resuelto 20/11: la tabla de Stand By sale automática (título por semana, sin duplicados, solo RDC finalizados).'
 where titulo = 'Stand-by: título y totales';
