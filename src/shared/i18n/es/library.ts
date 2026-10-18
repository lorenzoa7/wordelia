import type { library as en } from '../en/library'

const n = (v: number): string => v.toLocaleString('es')
const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 })
const count = (v: number): string => compact.format(v)
const chapters = (v: number): string => (v === 1 ? '1 capítulo' : `${n(v)} capítulos`)
const words = (v: number): string => (v === 1 ? '1 palabra' : `${count(v)} palabras`)

export const library: typeof en = {
  count,
  tagline: 'Un escritorio tranquilo para tu libro, con un editor a tu lado.',
  newBook: 'Nuevo libro',
  openFolder: 'Abrir carpeta',
  openFolderTitle: 'Abrir la carpeta de un libro',
  importFile: 'Importar DOCX o Markdown',
  yourBooks: 'Tus libros',
  emptyLine: 'Capítulo uno',
  emptyHint: 'Tu primer libro empieza aquí. Cada libro es una carpeta común de archivos en esta computadora.',
  folderNotFound: 'No se encontró la carpeta',
  bookMeta: (w, c) => `${words(w)} · ${chapters(c)}`,
  bookPages: (v, exact = false) => `${exact ? '' : '≈ '}${v === 1 ? '1 página' : `${n(v)} páginas`}`,
  bookOptions: 'Opciones del libro',
  showFolder: 'Mostrar carpeta',
  removeFromList: 'Quitar de la lista',
  justNow: 'hace un momento',
  couldNotOpen: (error) => `No se pudo abrir el libro: ${error}`,
  newTitle: 'Un libro nuevo',
  newDescription: 'Wordelia guarda cada libro en su propia carpeta de archivos simples.',
  creating: 'Creando…',
  createBook: 'Crear libro',
  title: 'Título',
  titlePlaceholder: 'El faro de Santa Isla',
  author: 'Autor',
  authorPlaceholder: 'Tu nombre',
  language: 'Idioma del libro',
  languageHint: 'La IA escribe el texto del libro en este idioma. El corrector ortográfico también lo usa.',
  languageAria: 'Idioma',
  languages: {
    'pt-BR': 'Portugués (Brasil)',
    'pt-PT': 'Portugués (Portugal)',
    'en-US': 'Inglés (EE. UU.)',
    'en-GB': 'Inglés (Reino Unido)',
    es: 'Español',
    fr: 'Francés',
    de: 'Alemán',
    it: 'Italiano'
  },
  location: 'Ubicación',
  locationTitle: 'Dónde guardar el libro',
  change: 'Cambiar…',
  couldNotCreate: (error) => `No se pudo crear el libro: ${error}`,
  importTitle: 'Importar un libro',
  importing: 'Importando…',
  reading: 'Leyendo el archivo…',
  importSummary: (c, w) => `${chapters(c)} · ${words(w)}`,
  buildPlanning: 'Crear la planificación con IA',
  buildPlanningNote: 'La IA lee los capítulos y propone personajes, lugares y notas de la trama. Tú revisas cada propuesta antes de que se guarde.',
  warnings: (v) => (v === 1 ? 'Se ignoró 1 aviso de formato del conversor.' : `Se ignoraron ${n(v)} avisos de formato del conversor.`),
  importedBook: 'Libro importado',
  imported: (v) => (v === 1 ? 'Se importó 1 capítulo.' : `Se importaron ${n(v)} capítulos.`),
  importFailed: (error) => `Error al importar: ${error}`,
  couldNotRead: (error) => `No se pudo leer el archivo: ${error}`
}
