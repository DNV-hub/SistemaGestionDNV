-- "Actividad" para el mensaje de WhatsApp que arma el supervisor al terminar
-- de armar su requerimiento (ej. "PIE DEL ACTIVO") — texto libre que escribe
-- él mismo, no sale de ningún catálogo existente. Opcional: un vale sin
-- actividad sigue siendo válido, el mensaje solo la muestra en blanco.
alter table vales add column actividad text;
