// Crea las cuentas de acceso de los supervisores del RDC y las vincula con su
// fila en `rdc_supervisores`. Es el primer paso de la Fase B: hasta ahora el
// RDC no tenía login y el supervisor se elegía de un desplegable, así que
// cualquiera podía emitir un reporte a nombre de cualquiera.
//
// Para cada supervisor activo hace tres cosas, en este orden:
//   1. crea la cuenta en Supabase Auth (email + contraseña, ya confirmada),
//   2. crea su perfil en `public.usuarios` con el rol Supervisor,
//   3. escribe `rdc_supervisores.usuario_id` para dejar unida la persona del
//      catálogo con su cuenta — que es lo que después usan las políticas RLS
//      para decidir qué reportes puede ver y editar.
//
// Convención de credenciales, definida por el usuario:
//   email      nombre.apellido@dnv.com
//   contraseña apellido.123
//
// Estas contraseñas son deducibles a propósito: el usuario necesita conservar
// el acceso a todas las cuentas. Quedan fijas, sin cambio forzado en el primer
// ingreso. Vale tenerlo presente: quien conozca el apellido de un supervisor
// puede entrar y emitir reportes a su nombre.
//
// Es idempotente: si la cuenta ya existe o el supervisor ya está vinculado, lo
// saltea en vez de fallar.
//
// Uso:
//   node crear-usuarios-supervisores.mjs           # simulacro, no escribe nada
//   node crear-usuarios-supervisores.mjs --apply   # crea las cuentas
//
// Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (la secret key
// "sb_secret_…" del proyecto) en el entorno.

import { createClient } from '@supabase/supabase-js'

const APLICAR = process.argv.includes('--apply')
const DOMINIO = 'dnv.com'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// "JOSÉ PEÑA" -> "jose.pena". Se quitan tildes y eñes porque el email tiene
// que poder dictarse y escribirse en el teclado de un celular sin sorpresas.
const simplifica = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// De un nombre de catálogo saca nombre, apellido, email y contraseña. Los 18
// supervisores reales vienen como "NOMBRE APELLIDO"; si alguno tuviera más
// palabras se toma la primera como nombre y la última como apellido, y si
// tuviera una sola no se puede armar la credencial y se reporta.
function credenciales(nombreCompleto) {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean)
  if (partes.length < 2) return null
  const nombre = simplifica(partes[0])
  const apellido = simplifica(partes[partes.length - 1])
  if (!nombre || !apellido) return null
  return {
    email: `${nombre}.${apellido}@${DOMINIO}`,
    password: `${apellido}.123`,
    partes: partes.length,
  }
}

async function main() {
  console.log(APLICAR ? '== Creando cuentas de supervisores ==' : '== SIMULACRO (no se crea nada) — usa --apply para aplicar ==')
  console.log(`  proyecto: ${SUPABASE_URL}`)
  console.log(`  dominio : @${DOMINIO}\n`)

  const { data: rolSupervisor, error: errorRol } = await db
    .from('roles').select('id').eq('nombre', 'Supervisor').single()
  if (errorRol) {
    console.error(`No se pudo leer el rol Supervisor: ${errorRol.message}`)
    console.error('Si el mensaje habla de una clave inválida, revisa que sea la secret key ("sb_secret_…").')
    process.exitCode = 1
    return
  }

  const { data: supervisores, error: errorSup } = await db
    .from('rdc_supervisores')
    .select('id, nombre, activo, usuario_id')
    .eq('activo', true)
    .order('orden')
  if (errorSup) {
    console.error(`No se pudieron leer los supervisores: ${errorSup.message}`)
    process.exitCode = 1
    return
  }

  const creadas = []
  const saltadas = []
  const fallidas = []

  // Dos supervisores distintos podrían dar el mismo email (mismo nombre y
  // mismo apellido). No pasa con los datos actuales, pero si pasara habría
  // que resolverlo a mano y no en silencio.
  const vistos = new Map()

  for (const sup of supervisores) {
    const cred = credenciales(sup.nombre)
    if (!cred) {
      fallidas.push({ nombre: sup.nombre, motivo: 'el nombre tiene una sola palabra, no se puede armar nombre.apellido' })
      continue
    }
    if (vistos.has(cred.email)) {
      fallidas.push({ nombre: sup.nombre, motivo: `su email coincide con el de "${vistos.get(cred.email)}"` })
      continue
    }
    vistos.set(cred.email, sup.nombre)

    if (sup.usuario_id) {
      saltadas.push({ nombre: sup.nombre, email: cred.email, motivo: 'ya estaba vinculado' })
      continue
    }

    if (!APLICAR) {
      creadas.push({ nombre: sup.nombre, ...cred })
      continue
    }

    try {
      // 1. Cuenta de acceso. email_confirm evita el correo de verificación:
      // estas direcciones no son buzones reales.
      let usuarioId
      const { data: nuevo, error: errorAuth } = await db.auth.admin.createUser({
        email: cred.email,
        password: cred.password,
        email_confirm: true,
      })

      if (errorAuth) {
        // Si la cuenta ya existía (una corrida anterior que se cortó a medias),
        // se recupera para poder completar el perfil y el vínculo.
        if (/already|registered|exists/i.test(errorAuth.message)) {
          const { data: existente } = await db
            .from('usuarios').select('id').eq('email', cred.email).maybeSingle()
          if (!existente) throw new Error(`la cuenta ya existe en Auth pero no tiene perfil: ${errorAuth.message}`)
          usuarioId = existente.id
        } else {
          throw new Error(errorAuth.message)
        }
      } else {
        usuarioId = nuevo.user.id
      }

      // 2. Perfil. frente_id queda nulo: los frentes del RDC son un maestro
      // aparte (rdc_frentes) y el alcance del supervisor se resuelve por su
      // vínculo con el catálogo, no por usuarios.frente_id.
      const { error: errorPerfil } = await db.from('usuarios').upsert(
        { id: usuarioId, email: cred.email, nombre: sup.nombre, rol_id: rolSupervisor.id },
        { onConflict: 'id' },
      )
      if (errorPerfil) throw new Error(`perfil: ${errorPerfil.message}`)

      // 3. El vínculo que hace funcionar las políticas RLS del módulo RDC.
      const { error: errorVinculo } = await db
        .from('rdc_supervisores').update({ usuario_id: usuarioId }).eq('id', sup.id)
      if (errorVinculo) throw new Error(`vínculo: ${errorVinculo.message}`)

      creadas.push({ nombre: sup.nombre, ...cred })
    } catch (e) {
      fallidas.push({ nombre: sup.nombre, motivo: e.message })
    }
  }

  if (creadas.length) {
    console.log(APLICAR ? 'Cuentas creadas:\n' : 'Cuentas que se crearían:\n')
    console.log('Supervisor              Email                                Contraseña')
    console.log('----------------------  -----------------------------------  ---------------')
    for (const c of creadas) {
      console.log(`${c.nombre.padEnd(22)}  ${c.email.padEnd(35)}  ${c.password}`)
    }
  }

  if (saltadas.length) {
    console.log('\nSalteadas:')
    saltadas.forEach((s) => console.log(`  - ${s.nombre}: ${s.motivo}`))
  }

  if (fallidas.length) {
    console.log('\nCon problemas (requieren decisión manual):')
    fallidas.forEach((f) => console.log(`  ! ${f.nombre}: ${f.motivo}`))
    process.exitCode = 1
  }

  console.log(`\n${creadas.length} cuenta(s), ${saltadas.length} salteada(s), ${fallidas.length} con problemas.`)

  if (!APLICAR) {
    console.log('\nSimulacro terminado. Nada se creó. Repite con --apply para crear las cuentas.')
  } else if (creadas.length) {
    console.log('\nEntrega estas credenciales por un canal privado. Quedan fijas: no se pide')
    console.log('cambiarlas en el primer ingreso.')
  }
}

main().catch((e) => {
  console.error(`\nFalló: ${e.message}`)
  process.exit(1)
})
