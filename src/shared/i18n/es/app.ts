import type { app as en } from '../en/app'

export const app: typeof en = {
  showSidebar: 'Mostrar barra lateral',
  hideSidebar: 'Ocultar barra lateral',
  library: 'Biblioteca',
  backToLibrary: 'Volver a la biblioteca',
  bookSettings: 'Ajustes del libro',
  exportBook: 'Exportar…',
  showFolder: 'Mostrar carpeta',
  closeBook: 'Cerrar libro',
  viewNav: 'Vista',
  views: { write: 'Escribir', plan: 'Planificar' },
  showChat: 'Mostrar chat',
  hideChat: 'Ocultar chat',
  chatWidth: 'Ancho del chat. Usa las flechas para cambiarlo.',
  provider: {
    connect: 'Conectar una IA',
    checking: 'Comprobando…',
    notConnected: (name) => `${name}: no conectado`,
    ready: (name) => `IA lista: ${name}`,
    openSettings: 'Abrir ajustes de IA'
  },
  aiErrors: {
    notInstalled: 'El proveedor de IA no está instalado.',
    notLoggedIn: 'Sin sesión iniciada.',
    connectHint: (detail) => `${detail} Abre Ajustes → IA para conectarte.`,
    rateLimit: 'El proveedor de IA dice que se alcanzó el límite de uso. Inténtalo más tarde.',
    network: 'No hay conexión con el proveedor de IA.',
    cancelled: 'Detenido.',
    unknown: 'Algo salió mal.'
  }
}
