// Filtro por columna tipo Excel para TODAS las tablas del sistema.
//
// No se configura tabla por tabla: un observador global detecta las tablas
// (<table> nativas y las grillas .pl-table de Planeamiento), agrega un
// embudito en cada encabezado y, al tocarlo, abre una lista con los valores de
// esa columna para marcar cuáles mostrar. Las filas que no coinciden se ocultan
// (data-flt-oculto); no se toca ningún dato ni se pide nada al servidor.
//
// Para que una tabla NO lo tenga: <table data-sin-filtro>.

const MIN_FILAS = 3
const SEL_TABLAS = 'table:not([data-flt]), .pl-table:not([data-flt])'

const ESTRUCTURAS = [
  {
    es: (el) => el.tagName === 'TABLE',
    cabeceras: (t) => {
      const fila = t.tHead?.rows[t.tHead.rows.length - 1]
      return fila ? [...fila.cells] : []
    },
    filas: (t) => [...t.tBodies].flatMap((b) => [...b.rows]),
    celdas: (f) => [...f.cells],
  },
  {
    es: (el) => el.classList.contains('pl-table'),
    cabeceras: (c) => {
      const h = c.querySelector('.pl-th')
      return h ? [...h.children] : []
    },
    filas: (c) => [...c.querySelectorAll('.pl-tr')],
    celdas: (f) => [...f.children],
  },
]

const texto = (el) => (el.dataset?.valor ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
const VACIO = '(vacío)'
const valorDe = (celda) => texto(celda) || VACIO
const comparar = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })

const ICONO =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>'

let popover = null // { el, cerrar }

function cerrarPopover() {
  if (!popover) return
  popover.el.remove()
  document.removeEventListener('mousedown', popover.fuera, true)
  document.removeEventListener('keydown', popover.tecla, true)
  window.removeEventListener('resize', popover.cerrar)
  popover = null
}

function mejorarTabla(el) {
  const est = ESTRUCTURAS.find((e) => e.es(el))
  if (!est) return false
  const cabeceras = est.cabeceras(el)
  if (cabeceras.length < 2) return false
  if (cabeceras.some((c) => c.colSpan > 1)) return false
  if (est.filas(el).length < MIN_FILAS) return false

  el.dataset.flt = '1'
  const filtros = new Map() // columna -> Set de valores que SÍ se muestran
  const n = cabeceras.length

  const filasDatos = () => est.filas(el).filter((f) => est.celdas(f).length === n)

  const pasa = (celdas, salvo) => {
    for (const [i, permitidos] of filtros) {
      if (i === salvo) continue
      if (!permitidos.has(valorDe(celdas[i]))) return false
    }
    return true
  }

  function aplicar() {
    for (const fila of est.filas(el)) {
      const celdas = est.celdas(fila)
      if (celdas.length !== n) continue // separadores / filas de "no hay datos"
      if (pasa(celdas, -1)) fila.removeAttribute('data-flt-oculto')
      else fila.setAttribute('data-flt-oculto', '')
    }
    est.cabeceras(el).forEach((c, i) => {
      const b = c.querySelector(':scope > .flt-btn, .flt-btn')
      b?.classList.toggle('on', filtros.has(i))
    })
  }

  // La columna lleva embudito salvo que no tenga nombre o sean controles.
  function columnaFiltrable(i) {
    const c = est.cabeceras(el)[i]
    if (!c || !texto(c) || c.querySelector('input, select')) return false
    const muestra = filasDatos().slice(0, 3)
    return !muestra.some((f) => est.celdas(f)[i]?.querySelector('input, select, textarea'))
  }

  function ponerBotones() {
    est.cabeceras(el).forEach((c, i) => {
      if (c.querySelector('.flt-btn') || !columnaFiltrable(i)) return
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'flt-btn'
      b.dataset.col = String(i)
      b.setAttribute('aria-label', `Filtrar por ${texto(c)}`)
      b.title = 'Filtrar'
      b.innerHTML = ICONO
      c.appendChild(b)
    })
  }

  function abrir(i, boton) {
    cerrarPopover()
    // Valores posibles: los de las filas que pasan los OTROS filtros (como Excel).
    const cuenta = new Map()
    for (const fila of filasDatos()) {
      const celdas = est.celdas(fila)
      if (!pasa(celdas, i)) continue
      const v = valorDe(celdas[i])
      cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
    }
    const valores = [...cuenta.keys()].sort(comparar)
    const elegidos = new Set(filtros.get(i) ?? valores)

    const pop = document.createElement('div')
    pop.className = 'flt-pop'
    pop.setAttribute('role', 'dialog')
    pop.setAttribute('aria-label', 'Filtrar columna')
    pop.innerHTML = `
      <input type="search" class="flt-busca" placeholder="Buscar…" aria-label="Buscar valor" />
      <div class="flt-acc">
        <button type="button" data-a="todo">Seleccionar todo</button>
        <button type="button" data-a="nada">Ninguno</button>
      </div>
      <div class="flt-lista"></div>
      <div class="flt-pie"><button type="button" data-a="limpiar">Quitar filtro</button><button type="button" data-a="cerrar" class="pri">Listo</button></div>`
    document.body.appendChild(pop)

    const lista = pop.querySelector('.flt-lista')
    const busca = pop.querySelector('.flt-busca')

    function pintar() {
      const q = busca.value.trim().toLowerCase()
      const vis = valores.filter((v) => !q || v.toLowerCase().includes(q))
      lista.innerHTML = ''
      if (!vis.length) lista.innerHTML = '<p class="flt-nada">Sin coincidencias</p>'
      for (const v of vis) {
        const fila = document.createElement('label')
        fila.className = 'flt-op'
        const cb = document.createElement('input')
        cb.type = 'checkbox'
        cb.checked = elegidos.has(v)
        cb.addEventListener('change', () => {
          if (cb.checked) elegidos.add(v)
          else elegidos.delete(v)
          confirmar()
        })
        const tx = document.createElement('span')
        tx.className = 'flt-tx'
        tx.textContent = v
        const ct = document.createElement('span')
        ct.className = 'flt-ct'
        ct.textContent = String(cuenta.get(v))
        fila.append(cb, tx, ct)
        lista.appendChild(fila)
      }
    }

    function confirmar() {
      if (elegidos.size === valores.length) filtros.delete(i)
      else filtros.set(i, new Set(elegidos))
      aplicar()
    }

    pop.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a
      if (!a) return
      if (a === 'cerrar') return cerrarPopover()
      if (a === 'limpiar') {
        filtros.delete(i)
        aplicar()
        return cerrarPopover()
      }
      const q = busca.value.trim().toLowerCase()
      const alcance = valores.filter((v) => !q || v.toLowerCase().includes(q))
      if (a === 'todo') alcance.forEach((v) => elegidos.add(v))
      if (a === 'nada') alcance.forEach((v) => elegidos.delete(v))
      confirmar()
      pintar()
    })
    busca.addEventListener('input', pintar)
    pintar()

    // Posición: debajo del embudito, sin salirse de la pantalla.
    const r = boton.getBoundingClientRect()
    const ancho = 260
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8))}px`
    const alto = Math.min(pop.offsetHeight, 380)
    const abajo = r.bottom + 6
    pop.style.top = `${abajo + alto > window.innerHeight - 8 ? Math.max(8, r.top - alto - 6) : abajo}px`

    popover = {
      el: pop,
      cerrar: cerrarPopover,
      fuera: (e) => {
        if (!pop.contains(e.target) && !boton.contains(e.target)) cerrarPopover()
      },
      tecla: (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          e.preventDefault()
          cerrarPopover()
        }
      },
    }
    document.addEventListener('mousedown', popover.fuera, true)
    document.addEventListener('keydown', popover.tecla, true)
    window.addEventListener('resize', popover.cerrar)
    busca.focus()
  }

  // Un solo manejador en la tabla: el embudito nunca dispara el orden de la columna.
  el.addEventListener(
    'click',
    (e) => {
      const b = e.target.closest?.('.flt-btn')
      if (!b || !el.contains(b)) return
      e.stopPropagation()
      e.preventDefault()
      abrir(Number(b.dataset.col), b)
    },
    true,
  )

  // Vue vuelve a pintar filas y encabezados: se reponen los botones y se
  // vuelve a aplicar el filtro, sin tocar nada más.
  let t = null
  const obs = new MutationObserver(() => {
    clearTimeout(t)
    t = setTimeout(() => {
      if (!document.body.contains(el)) {
        obs.disconnect()
        return
      }
      ponerBotones()
      aplicar()
    }, 100)
  })
  obs.observe(el, { childList: true, subtree: true, characterData: true })

  ponerBotones()
  return true
}

let pendiente = null
function escanear() {
  document.querySelectorAll(SEL_TABLAS).forEach((el) => {
    if (el.hasAttribute('data-sin-filtro') || el.closest('.flt-pop, [data-sin-filtro]')) return
    mejorarTabla(el)
  })
}

/** Activa el filtro por columna en todas las tablas, ahora y las que aparezcan después. */
export function iniciarFiltroColumnas() {
  if (typeof document === 'undefined' || window.__filtroColumnas) return
  window.__filtroColumnas = true
  const obs = new MutationObserver(() => {
    clearTimeout(pendiente)
    pendiente = setTimeout(escanear, 200)
  })
  obs.observe(document.body, { childList: true, subtree: true })
  escanear()
}
