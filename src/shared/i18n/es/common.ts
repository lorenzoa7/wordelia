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
  confirm: 'Confirmar',
  ok: 'Aceptar',
  settings: 'Ajustes',
  loading: 'Cargando…',
  untitled: 'Sin título',
  words: (v) => (v === 1 ? '1 palabra' : `${n(v)} palabras`),
  chapters: (v) => (v === 1 ? '1 capítulo' : `${n(v)} capítulos`),
  // Effort names stay in English, as in the AI tools.
  efforts: { minimal: 'Mínimo', low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo' },
  providerKind: {
    'claude-code': 'Tu plan de Claude, con el programa Claude Code',
    codex: 'Tu plan de ChatGPT, con el programa Codex',
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
  builtinActionInstructions: {
    polish: [
      'Revisa este pasaje como un corrector de estilo cuidadoso.',
      'Conserva la voz del autor, el sentido, el punto de vista, el tiempo verbal y todos los hechos de la historia.',
      'Corrige la gramática, la ortografía y la puntuación.',
      'Haz que la prosa fluya: varía la longitud y el ritmo de las oraciones, quita palabras de relleno, redundancias y adverbios débiles, y prefiere sustantivos concretos y verbos fuertes.',
      'Cambia los clichés por una frase sencilla y más fresca cuando haya una que encaje.',
      'Mantén los diálogos naturales y fieles a cada personaje, y conserva las convenciones de puntuación de diálogo del libro.',
      'No agregues sucesos, detalles ni explicaciones. No hagas el texto más largo de lo necesario.',
      'Si una oración ya está bien, déjala como está.'
    ].join('\n'),
    tighten: [
      'Quita entre el 10 % y el 30 % de las palabras sin perder el sentido, la voz ni los hechos.',
      'Elimina repeticiones, relleno, rodeos y explicaciones de más.',
      'Conserva la imagen más fuerte de cada oración.'
    ].join('\n'),
    grammar: [
      'Corrige solo errores claros: ortografía, gramática, puntuación, concordancia y erratas.',
      'No cambies el estilo, la elección de palabras ni el ritmo. Conserva las formas orales y regionales (por ejemplo, "pa\'" o "pos") y la voz de cada personaje.',
      'Si no estás seguro de que algo sea un error, déjalo como está.',
      'Conserva las convenciones de puntuación de diálogo del libro.'
    ].join('\n'),
    show: [
      'Busca los lugares donde las emociones o los rasgos se dicen de forma directa y, en su lugar, muéstralos con acciones, detalles de los sentidos, lenguaje corporal o diálogo.',
      'Conserva todos los hechos. Mantén la longitud dentro de un 30 % de la original.'
    ].join('\n'),
    expand: [
      'Amplía el pasaje con detalles sensoriales concretos, pensamientos o pequeñas acciones que encajen con la escena y los personajes.',
      'No agregues sucesos nuevos a la trama. Conserva la voz. Apunta a entre 1,5 y 2 veces la longitud.'
    ].join('\n')
  },
  categories: { characters: 'Personajes', places: 'Lugares', world: 'Mundo', plot: 'Trama', notes: 'Notas' }
}
