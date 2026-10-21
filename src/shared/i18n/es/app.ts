import type { app as en } from '../en/app'

export const app: typeof en = {
  update: {
    ready: (v) => `Wordelia ${v} está listo. Reinicia para usarlo.`,
    restartNow: 'Reiniciar ahora',
    badge: 'Actualización lista',
    badgeHint: (v) => `Reiniciar e instalar Wordelia ${v}. Tu trabajo se guarda antes.`
  },
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
  sidebarWidth: 'Ancho de la barra lateral. Usa las flechas para cambiarlo.',
  resizeHint: 'Arrastra para cambiar el ancho. Arrastra hasta el borde para ocultar.',
  openHint: 'Arrastra o haz clic para mostrar',
  provider: {
    connect: 'Conectar una IA',
    connectHint: 'No hay ninguna IA conectada. Abre Ajustes → IA para conectar una.',
    notConnectedShort: 'IA no conectada',
    notConnectedHint: (name) => `${name} no está conectado. Abre Ajustes → IA para conectarlo.`,
    expired: 'La sesión de la IA expiró',
    expiredHint: (name) => `La sesión de ${name} expiró. Abre Ajustes → IA para iniciar sesión de nuevo.`
  },
  aiErrors: {
    notInstalled: (p) => `${p} no está instalado en esta computadora. Abre Ajustes → IA para instalarlo.`,
    notLoggedIn: (p) => `No iniciaste sesión en ${p}. Abre Ajustes → IA para iniciar sesión.`,
    noKey: (p) => `Agrega una clave de API para ${p} en Ajustes → IA.`,
    loginExpired: (p) => `La sesión de ${p} caducó. Abre Ajustes → IA para iniciar sesión de nuevo.`,
    badKey: (p) => `La clave de API no funcionó con ${p}. Revisa la clave en Ajustes → IA.`,
    noCredit: (p) => `Tu cuenta de ${p} no tiene crédito. Agrega crédito en el sitio de ${p} y vuelve a intentarlo.`,
    usageLimit: 'Llegaste al límite de uso de tu plan. Inténtalo más tarde.',
    usageLimitUntil: (time) => `Llegaste al límite de uso de tu plan. Se renueva: ${time}.`,
    overloaded: (p) => `El servidor de ${p} está ocupado. Inténtalo de nuevo en un momento.`,
    network: (p) => `No hay conexión con ${p}. Revisa internet y vuelve a intentarlo.`,
    refused: 'El modelo rechazó esta solicitud.',
    off: (p) => `El proveedor ${p} está desactivado. Actívalo en Ajustes → IA.`,
    cancelled: 'Detenido.',
    other: (p) => `${p} no pudo responder. Inténtalo de nuevo.`,
    theAi: 'la IA',
    openSettings: 'Abrir ajustes'
  },
  keepBookOpen: 'Mantener el libro abierto'
}
