// Migra los catálogos del RDC hacia las tablas `rdc_*` del Sistema.
//
// Dos orígenes distintos, porque así están hoy los datos:
//   1. El proyecto Supabase del RDC (producción) — sectores, frentes,
//      supervisores, capataces, supervisores de redline y prefijos. Solo se
//      LEE, nunca se escribe: esa base está en uso diario en campo.
//   2. El archivo js/config.js del RDC — las 343 partidas EDT por frente, las
//      339 entradas de la biblioteca de pernos y los diez tipos de maquinaria,
//      que hoy viven como constantes de JavaScript y no como tablas.
//
// Es idempotente: sincroniza por clave natural (nombre, o (frente, código)),
// así que correrlo dos veces no duplica nada. Por eso mismo sirve también para
// re-sincronizar más adelante, mientras el RDC viejo siga en producción.
//
// Uso:
//   node migrar-catalogos-rdc.mjs              # simulacro, no escribe nada
//   node migrar-catalogos-rdc.mjs --apply      # aplica los cambios
//
// Requiere en el entorno:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   -> proyecto DESTINO (el Sistema)
// Opcionales (traen por defecto los valores públicos que el propio RDC usa):
//   RDC_SUPABASE_URL, RDC_SUPABASE_ANON_KEY   -> proyecto ORIGEN (el RDC)
//   RDC_CONFIG_JS                             -> ruta a js/config.js del RDC

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'

const aquí = dirname(fileURLToPath(import.meta.url))

const APLICAR = process.argv.includes('--apply')
const argConfig = process.argv.find((a) => a.startsWith('--config='))

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno (proyecto destino).')
  process.exit(1)
}

// Valores públicos del RDC: son los mismos que viajan en su JavaScript y que
// el navegador de cada supervisor usa para leer los catálogos.
const RDC_URL = process.env.RDC_SUPABASE_URL || 'https://iysastfzhnygzuokomvi.supabase.co'
const RDC_KEY = process.env.RDC_SUPABASE_ANON_KEY || 'sb_publishable_vBIch0iT8eku3IzdW86b0g_gAgk73vh'

const RUTA_CONFIG = resolve(
  aquí,
  argConfig ? argConfig.slice('--config='.length) : process.env.RDC_CONFIG_JS || '../../_referencia-rdc/js/config.js',
)

const destino = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const origen = createClient(RDC_URL, RDC_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const resumen = []
const anota = (tabla, filas, nota = '') => resumen.push({ tabla, filas, nota })

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// El RDC usa `estado` booleano (aparece o no en el desplegable) y `orden`
// que puede venir nulo. Las tablas nuevas usan `activo` y `orden not null`.
const normaliza = (fila) => ({ activo: fila.estado !== false, orden: fila.orden ?? 0 })

async function leerOrigen(tabla, columnas) {
  const { data, error } = await origen.from(tabla).select(columnas)
  if (error) throw new Error(`Leyendo ${tabla} del RDC: ${error.message}`)
  return data
}

// Supabase acepta arreglos grandes, pero un lote de cientos de filas puede
// pasarse del límite de tamaño de request. Se parte en tandas.
async function upsert(tabla, filas, onConflict) {
  if (filas.length === 0) return 0
  if (!APLICAR) return filas.length
  for (let i = 0; i < filas.length; i += 400) {
    const tanda = filas.slice(i, i + 400)
    const { error } = await destino.from(tabla).upsert(tanda, { onConflict, ignoreDuplicates: false })
    if (error) throw new Error(`Escribiendo ${tabla}: ${error.message}`)
  }
  return filas.length
}

async function mapaPorNombre(tabla) {
  const { data, error } = await destino.from(tabla).select('id, nombre')
  if (error) throw new Error(`Leyendo ${tabla} del destino: ${error.message}`)
  return new Map(data.map((f) => [f.nombre, f.id]))
}

function leerConfigJs() {
  if (!existsSync(RUTA_CONFIG)) {
    console.error(`No se encontró config.js del RDC en:\n  ${RUTA_CONFIG}\n`)
    console.error('Copia el proyecto RDC a _referencia-rdc/ en la raíz del repo, o pasa --config=<ruta>.')
    process.exit(1)
  }
  // config.js son constantes sueltas sin imports ni exports: se evalúa en un
  // contexto aislado y se leen las que interesan.
  const ctx = createContext({})
  runInContext(
    `${readFileSync(RUTA_CONFIG, 'utf8')};
     this.__salida = {
       PARTIDAS,
       BIBLIOTECA_PERNOS,
       EQUIPOS_PERFORACION_FIJOS,
       EQUIPOS_SOPORTE_FIJOS
     };`,
    ctx,
  )
  return ctx.__salida
}

// ---------------------------------------------------------------------------
// Migración
// ---------------------------------------------------------------------------

async function migrarSectores() {
  const filas = await leerOrigen('sectores', 'id, nombre, estado, orden')
  await upsert('rdc_sectores', filas.map((s) => ({ nombre: s.nombre, ...normaliza(s) })), 'nombre')
  anota('rdc_sectores', filas.length)
  // El RDC referencia sectores por id numérico; acá se necesita el puente
  // entre ese id viejo y el nombre, para resolver los frentes.
  return new Map(filas.map((s) => [s.id, s.nombre]))
}

async function migrarFrentes(nombrePorSectorId) {
  const filas = await leerOrigen('frentes', 'id, nombre, sector_id, estado, orden')
  const sectores = APLICAR ? await mapaPorNombre('rdc_sectores') : new Map()

  const huérfanos = filas.filter((f) => !nombrePorSectorId.has(f.sector_id))
  const migrables = filas.filter((f) => nombrePorSectorId.has(f.sector_id))

  await upsert(
    'rdc_frentes',
    migrables.map((f) => ({
      nombre: f.nombre,
      sector_id: sectores.get(nombrePorSectorId.get(f.sector_id)),
      ...normaliza(f),
    })),
    'nombre',
  )
  anota('rdc_frentes', migrables.length, huérfanos.length ? `${huérfanos.length} sin sector válido, omitidos` : '')
  if (huérfanos.length) {
    huérfanos.forEach((f) => console.warn(`  ! frente "${f.nombre}" apunta al sector ${f.sector_id}, que no existe`))
  }
}

async function migrarPersonas() {
  for (const [origenTabla, destinoTabla] of [
    ['supervisores', 'rdc_supervisores'],
    ['capataces', 'rdc_capataces'],
    ['redline_supervisores', 'rdc_redline_supervisores'],
  ]) {
    const filas = await leerOrigen(origenTabla, 'nombre, estado, orden')
    // usuario_id se deja nulo a propósito: vincular cada supervisor con su
    // cuenta es trabajo de la Fase B, cuando las cuentas existan.
    await upsert(destinoTabla, filas.map((p) => ({ nombre: p.nombre, ...normaliza(p) })), 'nombre')
    const inactivos = filas.filter((p) => p.estado === false).length
    anota(destinoTabla, filas.length, inactivos ? `${inactivos} inactivos` : '')
  }
}

async function migrarPrefijos() {
  const filas = await leerOrigen('prefijos', 'frente, zona, sost, prefijo, plano, estado, orden')
  const frentes = APLICAR ? await mapaPorNombre('rdc_frentes') : new Map()

  const sinFrente = APLICAR ? filas.filter((p) => !frentes.has(p.frente)) : []
  const migrables = APLICAR ? filas.filter((p) => frentes.has(p.frente)) : filas

  await upsert(
    'rdc_prefijos',
    migrables.map((p) => ({
      frente_id: frentes.get(p.frente),
      zona: p.zona,
      sostenimiento: p.sost,
      prefijo: p.prefijo,
      plano: p.plano,
      ...normaliza(p),
    })),
    'frente_id,zona,sostenimiento',
  )
  anota('rdc_prefijos', migrables.length, sinFrente.length ? `${sinFrente.length} sin frente, omitidos` : '')
  sinFrente.forEach((p) => console.warn(`  ! prefijo de "${p.frente}" (${p.zona}/${p.sost}): ese frente no existe`))
}

async function migrarMaquinaria({ EQUIPOS_PERFORACION_FIJOS, EQUIPOS_SOPORTE_FIJOS }) {
  const catálogo = [
    ...EQUIPOS_PERFORACION_FIJOS.map((tipo, i) => ({ tipo, categoria: 'perforacion', orden: i + 1 })),
    ...EQUIPOS_SOPORTE_FIJOS.map((tipo, i) => ({ tipo, categoria: 'soporte', orden: i + 1 })),
  ]

  // Sin clave natural: una máquina se identifica por su placa, que todavía no
  // existe. Se insertan solo los tipos que falten, para que correr el script
  // de nuevo no duplique ni pise lo que el usuario ya haya cargado a mano.
  let existentes = new Set()
  if (APLICAR) {
    const { data, error } = await destino.from('rdc_maquinarias').select('tipo')
    if (error) throw new Error(`Leyendo rdc_maquinarias: ${error.message}`)
    existentes = new Set(data.map((m) => m.tipo))
  }
  const faltantes = catálogo.filter((m) => !existentes.has(m.tipo))

  if (APLICAR && faltantes.length) {
    const { error } = await destino.from('rdc_maquinarias').insert(faltantes)
    if (error) throw new Error(`Escribiendo rdc_maquinarias: ${error.message}`)
  }
  anota('rdc_maquinarias', faltantes.length, 'modelo y placa quedan vacíos, se completan a mano')
}

async function migrarPartidasEdt({ PARTIDAS }) {
  const frentes = APLICAR ? await mapaPorNombre('rdc_frentes') : new Map()
  const filas = []
  const sinFrente = []

  for (const [nombreFrente, partidas] of Object.entries(PARTIDAS)) {
    if (APLICAR && !frentes.has(nombreFrente)) {
      sinFrente.push(nombreFrente)
      continue
    }
    partidas.forEach((p, i) => {
      filas.push({
        frente_id: frentes.get(nombreFrente),
        codigo_edt: p.e,
        nombre: p.n,
        unidad: p.u,
        seccion: p.s,
        orden: i + 1,
      })
    })
  }

  await upsert('rdc_partidas_edt', filas, 'frente_id,codigo_edt')
  anota('rdc_partidas_edt', filas.length, sinFrente.length ? `frentes sin correspondencia: ${sinFrente.join(', ')}` : '')
}

async function migrarBibliotecaPernos({ BIBLIOTECA_PERNOS }) {
  const frentes = APLICAR ? await mapaPorNombre('rdc_frentes') : new Map()
  const filas = []
  const sinFrente = new Set()

  for (const [clave, perno] of Object.entries(BIBLIOTECA_PERNOS)) {
    // La clave es "NOMBRE DEL FRENTE|CÓDIGO DEL PERNO"; el código puede
    // contener barras (L01/P1-36), el nombre del frente no contiene "|".
    const corte = clave.indexOf('|')
    const nombreFrente = clave.slice(0, corte)
    const codigo = clave.slice(corte + 1)
    if (APLICAR && !frentes.has(nombreFrente)) {
      sinFrente.add(nombreFrente)
      continue
    }
    filas.push({
      frente_id: frentes.get(nombreFrente),
      codigo,
      zona: perno.z ?? null,
      sistema: perno.s ?? null,
      ubicacion: perno.u ?? null,
      diametro: perno.d ?? null,
      longitud: perno.l ?? null,
      angulo: perno.a ?? null,
      plano: perno.p ?? null,
    })
  }

  await upsert('rdc_pernos_biblioteca', filas, 'frente_id,codigo')
  anota('rdc_pernos_biblioteca', filas.length, sinFrente.size ? `frentes sin correspondencia: ${[...sinFrente].join(', ')}` : '')
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(APLICAR ? '== Migrando catálogos del RDC ==' : '== SIMULACRO (no se escribe nada) — usa --apply para aplicar ==')
  console.log(`  origen Supabase : ${RDC_URL}`)
  console.log(`  origen config.js: ${RUTA_CONFIG}`)
  console.log(`  destino         : ${SUPABASE_URL}\n`)

  const config = leerConfigJs()

  const nombrePorSectorId = await migrarSectores()
  await migrarFrentes(nombrePorSectorId)
  await migrarPersonas()
  await migrarPrefijos()
  await migrarMaquinaria(config)
  await migrarPartidasEdt(config)
  await migrarBibliotecaPernos(config)

  console.log('\nTabla                      Filas  Nota')
  console.log('-------------------------- -----  ----')
  for (const r of resumen) {
    console.log(`${r.tabla.padEnd(26)} ${String(r.filas).padStart(5)}  ${r.nota}`)
  }

  if (!APLICAR) {
    console.log('\nSimulacro terminado. Nada se escribió. Repite con --apply para aplicar.')
    console.log('Ojo: en simulacro no se resuelven las claves foráneas, así que los')
    console.log('avisos de "sin frente" solo aparecen al aplicar de verdad.')
  } else {
    console.log('\nListo. Los supervisores quedaron sin usuario_id: vincularlos es trabajo de la Fase B.')
  }
}

main().catch((e) => {
  console.error(`\nFalló la migración: ${e.message}`)
  process.exit(1)
})
