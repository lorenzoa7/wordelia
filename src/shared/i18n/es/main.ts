import type { main as en } from '../en/main'

export const main: typeof en = {
  contextMenu: {
    cut: 'Cortar',
    copy: 'Copiar',
    paste: 'Pegar',
    selectAll: 'Seleccionar todo',
    noSuggestions: 'No hay sugerencias',
    addToDictionary: (word) => `Agregar “${word}” al diccionario`
  },
  closeDialog: {
    message: 'No se pudieron guardar algunos cambios.',
    fileNotWritten: 'No se pudo escribir un archivo.',
    syncAppHint: 'Si una app de sincronización (OneDrive, Google Drive, Dropbox) está usando el archivo, espera un momento e inténtalo de nuevo.',
    keepOpen: 'Mantener la ventana abierta',
    closeAnyway: 'Cerrar de todos modos'
  },
  dialogs: {
    chooseFolderFirst: 'Primero elige la carpeta del libro.',
    useOpenFolder: 'Abre la carpeta con el botón Abrir carpeta.',
    chooseImage: 'Elegir una imagen',
    images: 'Imágenes',
    importBook: 'Importar un libro',
    documents: 'Documentos',
    importNotes: 'Importar notas a la planificación',
    markdownNotes: 'Notas en Markdown'
  },
  export: {
    pdf: { title: 'Exportar PDF', filter: 'PDF' },
    docx: { title: 'Exportar documento de Word', filter: 'Documento de Word' },
    markdown: { title: 'Exportar Markdown', filter: 'Markdown' },
    text: { title: 'Exportar texto', filter: 'Texto' }
  },
  terminal: {
    login: 'Wordelia: iniciar sesión',
    update: 'Wordelia: actualizar'
  },
  ai: {
    retrying: 'Reintentando…',
    cancelled: 'Cancelado.',
    claudeNotFound: 'Wordelia no encontró el programa claude en esta computadora.',
    claudeLogin: 'Haz clic en “Iniciar sesión…”. O ejecuta "claude auth login" en una terminal.',
    claudeNotInstalled: 'Claude Code no está instalado.',
    claudeBadArgs: 'El programa claude no aceptó la solicitud. Actualiza Claude Code.',
    claudeExited: (code) => `claude terminó con el código ${code}`,
    codexNotFound: 'Wordelia no encontró el programa codex en esta computadora.',
    codexLogin: 'Haz clic en “Iniciar sesión…”. O ejecuta "codex login" en una terminal.',
    codexExpired: 'La sesión de Codex caducó. Haz clic en “Iniciar sesión…” para cerrarla e iniciarla de nuevo.',
    codexNotInstalled: 'Codex no está instalado.',
    codexError: 'Error de Codex',
    codexTurn: (status) => `La ejecución terminó: ${status}`,
    codexStopped: 'codex app-server se detuvo',
    codexExited: (code) => `codex terminó con el código ${code}`,
    addApiKey: 'Agrega una clave de API.',
    apiKeyWorks: 'La clave de API funciona.',
    anthropicAddKey: 'Agrega una clave de Anthropic API en Ajustes.',
    refusal: 'El modelo rechazó esta solicitud.',
    openaiAddKey: 'Agrega una clave de OpenAI API en Ajustes.',
    requestFailed: 'La solicitud falló.',
    providerOff: (provider) => `${provider} está desactivado en Ajustes → IA.`
  }
}
