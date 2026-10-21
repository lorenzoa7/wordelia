import type { library as en } from '../en/library'

const n = (v: number): string => v.toLocaleString('es')
const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 })
const count = (v: number): string => compact.format(v)
const chapters = (v: number): string => (v === 1 ? '1 capítulo' : `${n(v)} capítulos`)
const words = (v: number): string => (v === 1 ? '1 palabra' : `${count(v)} palabras`)
const listNames = (names: string[]): string =>
  names.slice(0, 3).map((x) => `“${x}”`).join(', ') + (names.length > 3 ? ` y ${names.length - 3} más` : '')

export const library: typeof en = {
  count,
  tagline: 'Un escritorio tranquilo para tu libro, con un editor a tu lado.',
  newBook: 'Nuevo libro',
  openFolder: 'Abrir carpeta',
  openFolderTitle: 'Abrir la carpeta de un libro',
  importFile: 'Importar DOCX, Markdown o TXT',
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
  couldNotRead: (error) => `No se pudo leer el archivo: ${error}`,
  sceneBreaks: (v) => (v === 1 ? '1 salto de escena' : `${n(v)} saltos de escena`),
  blankLines: 'Líneas en blanco del archivo',
  blankLinesSpacing: 'Solo espacio',
  blankLinesBreaks: 'Saltos de escena',
  nothingToImport: 'Este archivo no tiene texto para importar.',
  buildPlanningWith: (name) => `${name} lo hace después de la importación.`,
  buildPlanningNoAi: 'Para crear la planificación, conecta una IA en Ajustes → IA.',
  emptyStart: 'Empieza tu primer libro',
  notBookTitle: 'Esta carpeta aún no es un libro',
  notBookText: (name) => `“${name}” no tiene el archivo wordelia.json, que hace de una carpeta un libro de Wordelia.`,
  notBookNotes: (v) =>
    `Tiene ${v === 1 ? '1 archivo Markdown o de texto' : `${n(v)} archivos Markdown o de texto`}. La importación copia los archivos en un libro nuevo, un capítulo por archivo. Esta carpeta no cambia.`,
  notBookMake: '“Convertir en libro” agrega wordelia.json y las carpetas manuscript, planning y ai a esta carpeta.',
  notBookChapters: (v) =>
    `“Convertir en libro” agrega wordelia.json a esta carpeta. ${v === 1 ? 'El archivo' : `Los ${n(v)} archivos`} de su carpeta manuscript serán los capítulos.`,
  makeBook: 'Convertir en libro',
  importNotes: 'Importar los archivos',
  insideBookTitle: 'Esta carpeta es parte de un libro',
  insideBook: (title) => `Está dentro de la carpeta de “${title}”. ¿Abrir ese libro?`,
  openThatBook: 'Abrir el libro',
  findFolder: 'Buscar la carpeta…',
  findFolderTitle: (title) => `¿Dónde está ahora la carpeta de “${title}”?`,
  folderFound: (title) => `“${title}” volvió a la biblioteca.`,
  notABookFolder: 'Esa carpeta no es un libro de Wordelia.',
  notThisBook: (title) => (title ? `Esa carpeta tiene otro libro: “${title}”.` : 'Esa carpeta tiene otro libro.'),
  removed: (title) => `“${title}” ya no está en la lista. Sus archivos siguen en esta computadora.`,
  manifestRepaired: {
    conflict: 'El archivo wordelia.json del libro tenía dos versiones (un conflicto de sincronización o de git). Wordelia conservó la versión de esta computadora. El archivo anterior está en la carpeta .wordelia.',
    copy: 'El archivo wordelia.json del libro estaba dañado. Wordelia restauró su última copia buena. El archivo anterior está en la carpeta .wordelia.',
    salvage: 'El archivo wordelia.json del libro estaba dañado. Wordelia lo reparó con las partes que pudo leer: revisa los ajustes del libro. El archivo anterior está en la carpeta .wordelia.',
    new: 'No se pudo leer el archivo wordelia.json del libro. Wordelia creó uno nuevo: revisa el título, el idioma y el orden de los capítulos. El archivo anterior está en la carpeta .wordelia.'
  },
  showOldFile: 'Mostrar el archivo anterior',
  chaptersMissing: (names) =>
    names.length === 1
      ? `Falta el archivo del capítulo “${names[0]}”. Su lugar en el orden se mantiene: el capítulo vuelve cuando llegue el archivo (por ejemplo, después de una sincronización).`
      : `Faltan los archivos de ${n(names.length)} capítulos: ${listNames(names)}. Sus lugares en el orden se mantienen: los capítulos vuelven cuando lleguen los archivos (por ejemplo, después de una sincronización).`,
  forgetMissing: (v) => (v === 1 ? 'Olvidar este capítulo' : 'Olvidar estos capítulos')

}
