// Excel de Calidad: una hoja por control, con las mismas columnas que se ven
// en pantalla, del frente y periodo elegidos.
import { descargarExcel } from '../../../utils/exportarExcel'
import { hoyIso } from '../../frentes/utils/semanal'
import { PERIODOS } from './calidad'

const r2 = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100)
const oVacio = (filas, columnas) => (filas.length ? filas : [Object.fromEntries(columnas.map((c, i) => [c, i ? '' : 'Sin registros en este periodo']))])
const FUENTE = { reporte: 'Reporte', bitacora: 'Bitácora', sin: 'Sin dato' }

export async function exportarCalidad(nombreFrente, periodo, c) {
  const perforacion = c.perforacion.codigos
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
    .map((p) => ({
      Día: p.fecha,
      Código: p.codigo,
      Zona: p.zona,
      Ubicación: p.ubicacion,
      'Longitud (m)': r2(p.longitud),
      ...(c.conBiblioteca ? { 'En biblioteca': p.enBiblioteca ? 'Sí' : 'No' } : {}),
    }))
  const faltan = c.conBiblioteca
    ? c.perforacion.avance.flatMap((z) =>
        z.ubicaciones.flatMap((u) => u.items.filter((i) => !i.fecha).map((i) => ({ Zona: z.zona, Ubicación: u.ubicacion, Código: i.codigo, 'Longitud (m)': r2(i.longitud) })))
      )
    : []
  const inyeccion = c.inyeccion.porDia.map((d) => ({
    Día: d.fecha,
    Anclajes: d.anclajes,
    ML: r2(d.ml),
    'Bolsas de cemento': d.bolsas != null ? r2(d.bolsas) : null,
    'Bolsas según bitácora': d.enBitacora != null ? r2(d.enBitacora) : null,
    'ML / bolsa': r2(d.rendimiento),
    Fuente: FUENTE[d.fuente],
    Códigos: d.grupos.flatMap((g) => g.items.map((i) => i.codigo)).join(', '),
  }))
  const malla = c.malla.panos.map((p) => ({ Código: p.codigo, Día: p.fecha, 'Ancho (m)': r2(p.ancho), 'Largo (m)': r2(p.largo), 'Área (m²)': r2(p.area), Tipo: p.tipo, Zona: p.zona }))
  const cable = c.cable.tramos.map((t) => ({ Día: t.fecha, Ø: t.diametro, Tramo: t.tramo, ML: r2(t.ml), Zona: t.zona }))
  const pull = c.pullTest.ensayos.map((e) => ({ Día: e.fecha, Zona: e.zona, Anclaje: e.codigo, Ubicación: e.ubicacion, Estado: 'Ejecutado' }))

  const hojas = [
    { nombre: 'Perforación', filas: oVacio(perforacion, ['Día', 'Código']) },
    ...(faltan.length ? [{ nombre: 'Perforación - faltan', filas: faltan }] : []),
    { nombre: 'Inyección', filas: oVacio(inyeccion, ['Día', 'Anclajes']) },
    { nombre: 'Malla', filas: oVacio(malla, ['Código', 'Día']) },
    { nombre: 'Cable', filas: oVacio(cable, ['Día', 'Ø']) },
    { nombre: 'Pull test', filas: oVacio(pull, ['Día', 'Zona']) },
  ]
  const etiqueta = PERIODOS.find((p) => p.clave === periodo)?.etiqueta.replace(' ', '') ?? periodo
  const limpio = nombreFrente.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')
  await descargarExcel(`Calidad_${limpio}_${etiqueta}_${hoyIso()}.xlsx`, hojas)
}
