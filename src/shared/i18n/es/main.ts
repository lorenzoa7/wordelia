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
    markdownNotes: 'Notas en Markdown',
    notABook: 'Esta carpeta no es un libro de Wordelia. Ábrela con el botón Abrir carpeta.'
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
    claudeNotFound: 'No se encontró el programa claude.',
    claudeLogin: 'Ejecuta "claude auth login" en una terminal para iniciar sesión.',
    claudeNotInstalled: 'Claude Code no está instalado.',
    claudeBadArgs: 'El programa claude rechazó sus argumentos.',
    claudeExited: (code) => `claude terminó con el código ${code}`,
    codexNotFound: 'No se encontró el programa codex.',
    codexLogin: 'Ejecuta "codex login" en una terminal para iniciar sesión.',
    codexExpired: 'La sesión de Codex caducó. En una terminal, ejecuta "codex logout" y luego "codex login".',
    codexNotInstalled: 'Codex no está instalado.',
    codexError: 'Error de Codex',
    codexTurn: (status) => `La ejecución terminó: ${status}`,
    codexStopped: 'codex app-server se detuvo',
    codexExited: (code) => `codex terminó con el código ${code}`,
    addApiKey: 'Agrega una clave de API.',
    apiKeyWorks: 'La clave de API funciona.',
    anthropicAddKey: 'Agrega una clave de Anthropic API en Ajustes.',
    anthropicKeyRejected: 'La clave de Anthropic API fue rechazada.',
    anthropicUnreachable: 'No se pudo conectar con la Anthropic API.',
    refusal: 'El modelo rechazó esta solicitud.',
    rateLimit: 'Se alcanzó el límite de uso. Inténtalo de nuevo pronto.',
    openaiAddKey: 'Agrega una clave de OpenAI API en Ajustes.',
    requestFailed: 'La solicitud falló.'
  }
}
