import type { editor as en } from '../en/editor'

export const editor: typeof en = {
  toolbar: {
    formatting: 'Formatação',
    redo: 'Refazer',
    font: 'Fonte',
    selectedText: 'Texto selecionado',
    bookFont: (font) => `Fonte do livro (${font})`,
    changeBookFont: 'Mudar a fonte do livro inteiro…',
    fontSize: 'Tamanho da fonte',
    bookSize: (size) => `Tamanho do livro (${size})`,
    bold: 'Negrito',
    italic: 'Itálico',
    underline: 'Sublinhado',
    alignment: 'Alinhamento',
    align: { left: 'Esquerda', center: 'Centro', right: 'Direita', justify: 'Justificado' },
    bookDefault: 'Padrão do livro',
    noIndent: 'Sem recuo na primeira linha',
    sceneBreak: 'Quebra de cena',
    findReplace: 'Localizar e substituir',
    focusMode: 'Modo foco',
    typewriterScrolling: 'Manter a linha digitada no meio da tela'
  },
  selection: {
    askChat: 'Perguntar ao chat sobre isto',
    reply: 'Responder',
    withAi: (action) => `${action} com IA`,
    moreActions: 'Mais ações',
    actions: 'Ações',
    editActions: 'Editar ações…',
    chapter: 'Capítulo'
  },
  review: {
    chatProposal: 'Proposta do chat',
    words: (n) => (n === 1 ? '1 palavra' : `${n} palavras`),
    stop: 'Parar'
  },
  find: {
    replaceToggle: 'Substituir',
    find: 'Localizar',
    noResults: 'Nenhum resultado',
    matchCase: 'Diferenciar maiúsculas e minúsculas',
    wholeWord: 'Palavra inteira',
    wholeWordShort: 'P',
    previous: 'Anterior',
    next: 'Próximo',
    replaceWith: 'Substituir por',
    replace: 'Substituir',
    replaceAll: 'Substituir tudo',
    otherChapters: 'Outros capítulos'
  },
  page: {
    placeholder: 'Comece aqui…',
    chapterText: 'Texto do capítulo',
    chapterTitle: 'Título do capítulo',
    nextChapter: 'Começar o próximo capítulo',
    noChapters: 'Este livro ainda não tem capítulos.',
    addFirstChapter: 'Adicionar o primeiro capítulo'
  },
  apply: {
    notFound: 'O texto a mudar não foi encontrado no capítulo. Talvez ele tenha mudado.',
    manyMatches: 'O texto a mudar aparece mais de uma vez no capítulo. Peça à IA um trecho maior.',
    noChapter: 'O capítulo não existe.'
  }
}
