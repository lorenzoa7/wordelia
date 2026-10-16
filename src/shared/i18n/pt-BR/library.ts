import type { library as en } from '../en/library'

const n = (v: number): string => v.toLocaleString('pt-BR')
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const count = (v: number): string => compact.format(v)
const chapters = (v: number): string => (v === 1 ? '1 capítulo' : `${n(v)} capítulos`)
const words = (v: number): string => (v === 1 ? '1 palavra' : `${count(v)} palavras`)

export const library: typeof en = {
  count,
  tagline: 'Uma mesa tranquila para o seu livro, com um editor ao seu lado.',
  newBook: 'Novo livro',
  openFolder: 'Abrir pasta',
  openFolderTitle: 'Abrir a pasta de um livro',
  importFile: 'Importar DOCX ou Markdown',
  yourBooks: 'Seus livros',
  emptyLine: 'Capítulo um',
  emptyHint: 'Seu primeiro livro começa aqui. Cada livro é uma pasta comum de arquivos neste computador.',
  folderNotFound: 'Pasta não encontrada',
  bookMeta: (w, c) => `${words(w)} · ${chapters(c)}`,
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
  couldNotRead: (error) => `Não foi possível ler o arquivo: ${error}`
}
