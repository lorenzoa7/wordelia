import type { common as en } from '../en/common'

const n = (v: number): string => v.toLocaleString('es')

export const common: typeof en = {
  locale: 'es',
  number: n,
  cancel: 'Cancelar',
  save: 'Guardar',
  delete: 'Eliminar',
  close: 'Cerrar',
  rename: 'Renombrar',
  create: 'Crear',
  open: 'Abrir',
  import: 'Importar',
  export: 'Exportar',
  accept: 'Aceptar',
  reject: 'Rechazar',
  acceptAll: 'Aceptar todo',
  rejectAll: 'Rechazar todo',
  undo: 'Deshacer',
  retry: 'Reintentar',
  copy: 'Copiar',
  copied: 'Copiado.',
  back: 'Atrás',
  next: 'Siguiente',
  done: 'Listo',
  continue: 'Continuar',
  settings: 'Ajustes',
  loading: 'Cargando…',
  untitled: 'Sin título',
  words: (v) => (v === 1 ? '1 palabra' : `${n(v)} palabras`),
  chapters: (v) => (v === 1 ? '1 capítulo' : `${n(v)} capítulos`),
  efforts: { minimal: 'Mínimo', low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo' },
  providerKind: {
    'claude-code': 'Tu suscripción de Claude, con el programa claude',
    codex: 'Tu suscripción de ChatGPT, con el programa codex',
    anthropic: 'Pago por uso, con una clave de API',
    openai: 'Pago por uso, con una clave de API'
  },
  tasks: {
    chat: { name: 'Chat', hint: 'Conversaciones, opiniones y ediciones propuestas.' },
    action: { name: 'Acciones', hint: 'Pulir y las demás acciones sobre el texto seleccionado. Aquí importa la velocidad.' },
    sync: { name: 'Sincronización de la planificación', hint: 'Lee los capítulos y actualiza la planificación.' },
    background: { name: 'Segundo plano', hint: 'Resúmenes de conversaciones, títulos y resúmenes de capítulos.' }
  },
  builtinActions: { polish: 'Pulir', tighten: 'Condensar', grammar: 'Solo gramática', show: 'Mostrar, no contar', expand: 'Ampliar' },
  categories: { characters: 'Personajes', places: 'Lugares', world: 'Mundo', plot: 'Trama', notes: 'Notas' }
}
