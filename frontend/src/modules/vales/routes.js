import ValesView from './views/ValesView.vue'
import ValeDetalleView from './views/ValeDetalleView.vue'
import ValeNuevoView from './views/ValeNuevoView.vue'
import SelectorMaterialView from './views/SelectorMaterialView.vue'
import StockEnVivoView from './views/StockEnVivoView.vue'
import DevolucionNuevaView from './views/DevolucionNuevaView.vue'

export const valesRoutes = [
  {
    path: '/vales',
    name: 'vales',
    component: ValesView,
    meta: { permiso: 'vales.ver_propios' },
  },
  // Hoja a pantalla completa para celular (docs/mockups/04-vale-nuevo.html +
  // 05-selector-material.html); el modal centrado sigue siendo el flujo de
  // escritorio, sin tocar. Oculta la barra flotante mientras se está adentro,
  // igual que el formulario de RDC.
  {
    path: '/vales/nuevo',
    name: 'vale-nuevo',
    component: ValeNuevoView,
    meta: { permiso: 'vales.crear', ocultarTabbar: true },
  },
  {
    path: '/vales/nuevo/material',
    name: 'vale-nuevo-material',
    component: SelectorMaterialView,
    meta: { permiso: 'vales.crear', ocultarTabbar: true },
  },
  // Accesos rápidos dentro de "Vales" (antes vivían en el panel de escritorio
  // del supervisor, que en celular ya no tiene forma de alcanzarse).
  {
    path: '/vales/stock',
    name: 'vales-stock',
    component: StockEnVivoView,
    meta: { permiso: 'vales.ver_propios', ocultarTabbar: true },
  },
  {
    path: '/vales/devolucion',
    name: 'vales-devolucion',
    component: DevolucionNuevaView,
    meta: { permiso: 'devoluciones.crear', ocultarTabbar: true },
  },
  {
    path: '/vales/:id',
    name: 'vale-detalle',
    component: ValeDetalleView,
    meta: { permiso: 'vales.ver_propios' },
  },
]
