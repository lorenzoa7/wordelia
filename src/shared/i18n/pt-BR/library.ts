import type { library as en } from '../en/library'

const n = (v: number): string => v.toLocaleString('pt-BR')
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const count = (v: number): string => compact.format(v)
const chapters = (v: number): string => (v === 1 ? '1 capítulo' : `${n(v)} capítulos`)
const words = (v: number): string => (v === 1 ? '1 palavra' : `${count(v)} palavras`)
const listNames = (names: string[]): string =>
  names.slice(0, 3).map((x) => `“${x}”`).join(', ') + (names.length > 3 ? ` e mais ${names.length - 3}` : '')

export const library: typeof en = {
  count,
  tagline: 'Uma mesa tranquila para o seu livro, com um editor ao seu lado.',
  newBook: 'Novo livro',
  openFolder: 'Abrir pasta',
  openFolderTitle: 'Abrir a pasta de um livro',
  importFile: 'Importar DOCX, Markdown ou TXT',
  yourBooks: 'Seus livros',
  emptyLine: 'Capítulo um',
  emptyHint: 'Seu primeiro livro começa aqui. Cada livro é uma pasta comum de arquivos neste computador.',
  folderNotFound: 'Pasta não encontrada',
  bookMeta: (w, c) => `${words(w)} · ${chapters(c)}`,
  bookPages: (v, exact = false) => `${exact ? '' : '≈ '}${v === 1 ? '1 página' : `${n(v)} páginas`}`,
  bookOptions: 'Opções do livro',
  showFolder: 'Mostrar pasta',
  removeFromList: 'Remover da lista',
  justNow: 'agora mesmo',
  couldNotOpen: (error) => `Não foi possível abrir o livro: ${error}`,
  newTitle: 'Um novo livro',
  newDescription: 'O Wordelia guarda cada livro em uma pasta própria, com arquivos simples.',
  creating: 'Criando…',
  createBook: 'Criar livro',
  title: 'Título',
  titlePlaceholder: 'O farol de Santa Ilha',
  author: 'Autor',
  authorPlaceholder: 'Seu nome',
  language: 'Idioma do livro',
  languageHint: 'A IA escreve o texto do livro neste idioma. A verificação ortográfica também usa esse idioma.',
  languageAria: 'Idioma',
  languages: {
    'pt-BR': 'Português (Brasil)',
    'pt-PT': 'Português (Portugal)',
    'en-US': 'Inglês (EUA)',
    'en-GB': 'Inglês (Reino Unido)',
    es: 'Espanhol',
    fr: 'Francês',
    de: 'Alemão',
    it: 'Italiano'
  },
  location: 'Local',
  locationTitle: 'Onde guardar o livro',
  change: 'Alterar…',
  couldNotCreate: (error) => `Não foi possível criar o livro: ${error}`,
  importTitle: 'Importar um livro',
  importing: 'Importando…',
  reading: 'Lendo o arquivo…',
  importSummary: (c, w) => `${chapters(c)} · ${words(w)}`,
  buildPlanning: 'Criar o planejamento com IA',
  buildPlanningNote: 'A IA lê os capítulos e propõe personagens, lugares e notas da trama. Você revisa cada proposta antes de ela ser salva.',
  warnings: (v) =>
    v === 1 ? '1 aviso de formatação do conversor foi ignorado.' : `${n(v)} avisos de formatação do conversor foram ignorados.`,
  importedBook: 'Livro importado',
  imported: (v) => (v === 1 ? '1 capítulo importado.' : `${n(v)} capítulos importados.`),
  importFailed: (error) => `A importação falhou: ${error}`,
  couldNotRead: (error) => `Não foi possível ler o arquivo: ${error}`,
  sceneBreaks: (v) => (v === 1 ? '1 quebra de cena' : `${n(v)} quebras de cena`),
  blankLines: 'Linhas em branco no arquivo',
  blankLinesSpacing: 'Só espaço',
  blankLinesBreaks: 'Quebras de cena',
  nothingToImport: 'Este arquivo não tem texto para importar.',
  buildPlanningWith: (name) => `${name} faz isso depois da importação.`,
  buildPlanningNoAi: 'Para criar o planejamento, conecte uma IA em Configurações → IA.',
  emptyStart: 'Comece seu primeiro livro',
  notBookTitle: 'Esta pasta ainda não é um livro',
  notBookText: (name) => `“${name}” não tem o arquivo wordelia.json, que faz de uma pasta um livro do Wordelia.`,
  notBookNotes: (v) =>
    `Ela tem ${v === 1 ? '1 arquivo Markdown ou de texto' : `${n(v)} arquivos Markdown ou de texto`}. A importação copia os arquivos para um livro novo, um capítulo para cada arquivo. Esta pasta não muda.`,
  notBookMake: '“Transformar em livro” adiciona o wordelia.json e as pastas manuscript, planning e ai a esta pasta.',
  notBookChapters: (v) =>
    `“Transformar em livro” adiciona o wordelia.json a esta pasta. ${v === 1 ? 'O arquivo' : `Os ${n(v)} arquivos`} da pasta manuscript viram os capítulos.`,
  makeBook: 'Transformar em livro',
  importNotes: 'Importar os arquivos',
  insideBookTitle: 'Esta pasta é parte de um livro',
  insideBook: (title) => `Ela fica dentro da pasta de “${title}”. Abrir esse livro?`,
  openThatBook: 'Abrir o livro',
  findFolder: 'Encontrar a pasta…',
  findFolderTitle: (title) => `Onde está a pasta de “${title}” agora?`,
  folderFound: (title) => `“${title}” voltou para a biblioteca.`,
  notABookFolder: 'Essa pasta não é um livro do Wordelia.',
  notThisBook: (title) => (title ? `Essa pasta tem outro livro: “${title}”.` : 'Essa pasta tem outro livro.'),
  removed: (title) => `“${title}” saiu da lista. Os arquivos continuam neste computador.`,
  manifestRepaired: {
    conflict: 'O arquivo wordelia.json do livro tinha duas versões (um conflito de sincronização ou do git). O Wordelia ficou com a versão deste computador. O arquivo antigo está na pasta .wordelia.',
    copy: 'O arquivo wordelia.json do livro estava danificado. O Wordelia restaurou a última cópia boa. O arquivo antigo está na pasta .wordelia.',
    salvage: 'O arquivo wordelia.json do livro estava danificado. O Wordelia consertou o arquivo com as partes que conseguiu ler: confira as configurações do livro. O arquivo antigo está na pasta .wordelia.',
    new: 'Não foi possível ler o arquivo wordelia.json do livro. O Wordelia criou um novo: confira o título, o idioma e a ordem dos capítulos. O arquivo antigo está na pasta .wordelia.'
  },
  showOldFile: 'Mostrar o arquivo antigo',
  chaptersMissing: (names) =>
    names.length === 1
      ? `O arquivo do capítulo “${names[0]}” não está na pasta. O lugar dele na ordem continua: o capítulo volta quando o arquivo chegar (por exemplo, depois de uma sincronização).`
      : `Os arquivos de ${n(names.length)} capítulos não estão na pasta: ${listNames(names)}. Os lugares deles na ordem continuam: os capítulos voltam quando os arquivos chegarem (por exemplo, depois de uma sincronização).`,
  forgetMissing: (v) => (v === 1 ? 'Esquecer este capítulo' : 'Esquecer estes capítulos')

}
