import type { exportDialog as en } from '../en/exportDialog'

export const exportDialog: typeof en = {
  description: 'Crea un archivo para enviar a lectores, editores o editoriales.',
  exporting: 'Exportando…',
  formats: {
    pdf: { label: 'PDF', hint: 'Páginas listas para imprimir', button: 'Exportar PDF' },
    docx: { label: 'Word', hint: 'También para Google Docs', button: 'Exportar Word' },
    md: { label: 'Markdown', hint: 'Un archivo', button: 'Exportar Markdown' },
    txt: { label: 'Texto plano', hint: 'Sin formato', button: 'Exportar texto plano' }
  },
  presets: {
    book: { name: 'Libro', hint: 'Páginas como las de una novela impresa' },
    manuscript: { name: 'Manuscrito', hint: 'Formato estándar para agentes y editoriales' }
  },
  pageSize: 'Tamaño de página',
  pageSizes: {
    A5: 'A5 (148 × 210 mm)',
    Pocket5x8: '5 × 8 pulg.',
    Digest5_5x8_5: '5,5 × 8,5 pulg.',
    Trade6x9: '6 × 9 pulg. (rústica)',
    A4: 'A4 (210 × 297 mm)',
    Letter: 'Carta (8,5 × 11 pulg.)'
  },
  font: 'Fuente',
  size: 'Tamaño',
  lineSpacing: 'Interlineado',
  double: 'Doble',
  chapterHeading: 'Título del capítulo',
  headings: {
    'number-title': 'Número y título',
    'word-number-title': '“Capítulo Uno” y título',
    title: 'Solo el título',
    number: 'Solo el número'
  },
  sceneBreak: 'Salto de escena',
  blankLine: 'Línea en blanco',
  titlePage: 'Página de título',
  pageNumbers: 'Números de página',
  runningHeader: 'Encabezado',
  newPage: 'Cada capítulo en una página nueva',
  docxNote: 'Para Google Docs: sube el archivo .docx a Google Drive y ábrelo con Google Docs. Las fuentes son Google Fonts, así que se ven igual.',
  oneFile: 'Un archivo con todos los capítulos, en orden.',
  mdNote: 'El formato se mantiene en Markdown.',
  txtNote: 'Se quita el formato.',
  exportedTo: (file) => `Exportado a ${file}`,
  show: 'Mostrar',
  exportFailed: (error) => `Error al exportar: ${error}`,
  sameAsScreen: 'Las mismas páginas que en Escribir: tamaño, márgenes y tipografía.'
}
