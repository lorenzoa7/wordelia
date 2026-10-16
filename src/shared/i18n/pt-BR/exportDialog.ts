import type { exportDialog as en } from '../en/exportDialog'

export const exportDialog: typeof en = {
  description: 'Crie um arquivo para enviar a leitores, editores ou a uma editora.',
  exporting: 'Exportando…',
  formats: {
    pdf: { label: 'PDF', hint: 'Páginas prontas para impressão', button: 'Exportar PDF' },
    docx: { label: 'Word', hint: 'Também para o Google Docs', button: 'Exportar Word' },
    md: { label: 'Markdown', hint: 'Um arquivo', button: 'Exportar Markdown' },
    txt: { label: 'Texto simples', hint: 'Sem formatação', button: 'Exportar texto simples' }
  },
  presets: {
    book: { name: 'Livro', hint: 'Páginas como as de um romance impresso' },
    manuscript: { name: 'Manuscrito', hint: 'Formato padrão para agentes e editoras' }
  },
  pageSize: 'Tamanho da página',
  pageSizes: {
    A5: 'A5 (148 × 210 mm)',
    Pocket5x8: '5 × 8 pol.',
    Digest5_5x8_5: '5,5 × 8,5 pol.',
    Trade6x9: '6 × 9 pol. (brochura)',
    A4: 'A4 (210 × 297 mm)',
    Letter: 'Carta (8,5 × 11 pol.)'
  },
  font: 'Fonte',
  size: 'Tamanho',
  lineSpacing: 'Espaçamento entre linhas',
  double: 'Duplo',
  chapterHeading: 'Título do capítulo',
  headings: {
    'number-title': 'Número e título',
    'word-number-title': '“Capítulo Um” e título',
    title: 'Só o título',
    number: 'Só o número'
  },
  sceneBreak: 'Quebra de cena',
  blankLine: 'Linha em branco',
  titlePage: 'Folha de rosto',
  pageNumbers: 'Números de página',
  runningHeader: 'Cabeçalho',
  newPage: 'Cada capítulo em uma nova página',
  docxNote: 'Para o Google Docs: envie o arquivo .docx para o Google Drive e abra-o com o Google Docs. As fontes são Google Fonts, então a aparência é a mesma.',
  oneFile: 'Um arquivo com todos os capítulos, em ordem.',
  mdNote: 'A formatação fica em Markdown.',
  txtNote: 'A formatação é removida.',
  exportedTo: (file) => `Exportado para ${file}`,
  show: 'Mostrar',
  exportFailed: (error) => `A exportação falhou: ${error}`
}
