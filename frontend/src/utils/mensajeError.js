// Traduce los errores de la base (Postgres/PostgREST) a una frase clara en
// español, sin códigos ni identificadores internos. Se aplica en UN solo
// lugar (el cliente de Supabase, ver services/supabaseClient.js), así que
// cualquier pantalla que muestre `error.message` ya recibe el texto legible.
//
// El texto técnico original NO se pierde: queda en `error.details` con el
// prefijo "Técnico: " — úsalo (vía textoCrudo) cuando el código necesite
// reconocer un error por su texto o nombre de restricción.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const PREFIJO_TECNICO = 'Técnico: '

// [código SQLSTATE o regex del texto] → frase. Se usa la primera que coincida.
const REGLAS = [
  {
    texto: /Cantidad a reservar \(([\d.]+)\) excede el disponible \(([\d.]+)\)/i,
    frase: (m) =>
      `No hay stock suficiente para aprobar esta línea: se necesitan ${Number(m[1])} y solo hay ${Number(m[2])} disponibles en el contrato de este frente.`,
  },
  { texto: /new row violates row-level security|permission denied|row-level security/i, frase: 'No tienes permiso para hacer esto.' },
  { codigo: '42501', frase: 'No tienes permiso para hacer esto.' },
  { texto: /JWT expired|invalid JWT|jwt malformed/i, frase: 'Tu sesión venció. Vuelve a iniciar sesión.' },
  {
    texto: /null value in column "([^"]+)"/i,
    frase: (m) => `Falta completar un dato obligatorio (${legible(m[1])}).`,
  },
  {
    texto: /duplicate key value violates unique constraint|already exists/i,
    frase: () => 'Ya existe un registro igual: no se puede repetir.',
  },
  {
    texto: /update or delete on table .* violates foreign key constraint/i,
    frase: () => 'No se puede eliminar porque ya tiene movimientos o registros asociados.',
  },
  {
    texto: /violates foreign key constraint/i,
    frase: () => 'Hay un dato que apunta a algo que ya no existe. Vuelve a elegirlo e intenta de nuevo.',
  },
  { texto: /violates check constraint/i, frase: () => 'Hay un valor que no está permitido. Revisa los datos ingresados.' },
  { texto: /invalid input syntax for type (\w+)/i, frase: () => 'Hay un dato con un formato que no es válido.' },
  { texto: /value too long for type/i, frase: () => 'Hay un texto demasiado largo.' },
  { texto: /numeric field overflow/i, frase: () => 'Hay un número demasiado grande.' },
  { texto: /deadlock detected|could not obtain lock|canceling statement due to lock timeout/i, frase: () => 'Otro usuario está modificando lo mismo. Espera unos segundos e intenta de nuevo.' },
  { texto: /canceling statement due to statement timeout/i, frase: () => 'La operación tardó demasiado. Intenta de nuevo.' },
  { texto: /Failed to fetch|NetworkError|network request failed|fetch failed|Load failed/i, frase: () => 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.' },
]

function legible(columna) {
  return String(columna).replace(/_id$/, '').replace(/_/g, ' ')
}

/** Frase clara para un mensaje crudo. Si no lo reconoce, devuelve el mismo
 * mensaje pero sin identificadores internos (los mensajes propios del
 * Sistema ya vienen en español). */
function traducirMensaje(crudo, codigo) {
  const texto = String(crudo ?? '')
  for (const r of REGLAS) {
    if (r.codigo && r.codigo === codigo) return typeof r.frase === 'function' ? r.frase([]) : r.frase
    if (r.texto) {
      const m = texto.match(r.texto)
      if (m) return typeof r.frase === 'function' ? r.frase(m) : r.frase
    }
  }
  return texto.replace(UUID, '(registro)').replace(/\s{2,}/g, ' ').trim()
}

/** Marca el error con la frase clara en `message` y el texto original en
 * `details` ("Técnico: …"), sin tocar el código. */
export function humanizarError(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || typeof cuerpo.message !== 'string') return cuerpo
  const crudo = cuerpo.message
  if (cuerpo.details?.startsWith?.(PREFIJO_TECNICO)) return cuerpo
  const clara = traducirMensaje(crudo, cuerpo.code)
  if (clara === crudo) return cuerpo
  return {
    ...cuerpo,
    message: clara,
    details: `${PREFIJO_TECNICO}${crudo}${cuerpo.details ? ` — ${cuerpo.details}` : ''}`,
  }
}

/** El mensaje técnico original de un error (para reconocerlo por su texto o
 * por el nombre de una restricción), aunque el cliente ya lo haya traducido. */
export function textoCrudo(e) {
  const d = e?.details
  if (typeof d === 'string' && d.startsWith(PREFIJO_TECNICO)) return d.slice(PREFIJO_TECNICO.length)
  return e?.message ?? (e ? String(e) : '')
}
