-- current_contrato_id() derivaba el contrato del supervisor a través de
-- usuarios.frente_id -> frentes.contrato_id. En la operación real los
-- supervisores rotan de frente todo el tiempo (a veces de un día al otro),
-- pero el contrato al que pertenecen NO rota nunca — los de Marco no pasan
-- a Sala Eléctrica y viceversa. Atar el contrato al frente actual significa
-- que apenas alguien queda un momento sin frente asignado (algo que pasa
-- seguido, justo por la rotación), current_contrato_id() devuelve null y
-- la política stock_select le esconde TODO el stock en silencio, sin
-- ningún error — exactamente lo que se reportó como "el stock no aparece".
--
-- El contrato pasa a ser un campo propio y estable en usuarios, separado
-- del frente del día a día.
alter table usuarios add column contrato_id uuid references contratos(id);

-- Backfill de continuidad: a quien ya tenía un frente asignado se le copia
-- el contrato de ese frente. A quien no tenía frente, va a necesitar que un
-- administrador se lo asigne una vez desde Usuarios (ya no hace falta
-- volver a tocarlo cada vez que rote de frente).
update usuarios u
set contrato_id = f.contrato_id
from frentes f
where f.id = u.frente_id
  and u.contrato_id is null;

create or replace function public.current_contrato_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select contrato_id from usuarios where id = auth.uid();
$$;
