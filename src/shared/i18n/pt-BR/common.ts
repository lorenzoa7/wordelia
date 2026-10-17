import type { common as en } from '../en/common'

const n = (v: number): string => v.toLocaleString('pt-BR')

export const common: typeof en = {
  locale: 'pt-BR',
  number: n,
  cancel: 'Cancelar',
  save: 'Salvar',
  delete: 'Excluir',
  close: 'Fechar',
  rename: 'Renomear',
  create: 'Criar',
  open: 'Abrir',
  import: 'Importar',
  export: 'Exportar',
  accept: 'Aceitar',
  reject: 'Rejeitar',
  acceptAll: 'Aceitar tudo',
  rejectAll: 'Rejeitar tudo',
  undo: 'Desfazer',
  retry: 'Tentar de novo',
  copy: 'Copiar',
  copied: 'Copiado.',
  back: 'Voltar',
  next: 'Avançar',
  done: 'Pronto',
  continue: 'Continuar',
  confirm: 'Confirmar',
  ok: 'OK',
  settings: 'Configurações',
  loading: 'Carregando…',
  untitled: 'Sem título',
  words: (v) => (v === 1 ? '1 palavra' : `${n(v)} palavras`),
  chapters: (v) => (v === 1 ? '1 capítulo' : `${n(v)} capítulos`),
  // Effort names stay in English, as in the AI tools.
  efforts: { minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' },
  providerKind: {
    'claude-code': 'Sua assinatura do Claude, pelo programa claude',
    codex: 'Sua assinatura do ChatGPT, pelo programa codex',
    anthropic: 'Pague pelo uso, com uma chave de API',
    openai: 'Pague pelo uso, com uma chave de API'
  },
  tasks: {
    chat: { name: 'Chat', hint: 'Conversas, opiniões e edições propostas.' },
    action: { name: 'Ações', hint: 'Polir e as outras ações no texto selecionado. Aqui a velocidade importa.' },
    sync: { name: 'Sincronização do planejamento', hint: 'Lê os capítulos e atualiza o planejamento.' },
    background: { name: 'Segundo plano', hint: 'Resumos das conversas, títulos e resumos dos capítulos.' }
  },
  builtinActions: { polish: 'Polir', tighten: 'Enxugar', grammar: 'Só gramática', show: 'Mostrar, não contar', expand: 'Expandir' },
  builtinActionInstructions: {
    polish: [
      'Revise este trecho como um preparador de texto cuidadoso.',
      'Mantenha a voz do autor, o sentido, o ponto de vista, o tempo verbal e todos os fatos da história.',
      'Corrija a gramática, a ortografia e a pontuação.',
      'Deixe a prosa fluir: varie o tamanho e o ritmo das frases, corte palavras de enchimento, redundâncias e advérbios fracos, e prefira substantivos concretos e verbos fortes.',
      'Troque clichês por uma expressão simples e mais nova, quando uma couber.',
      'Mantenha os diálogos naturais e fiéis a cada personagem, e mantenha as convenções de pontuação de diálogo do livro.',
      'Não acrescente acontecimentos, detalhes nem explicações. Não deixe o texto mais longo do que o necessário.',
      'Se uma frase já está boa, deixe-a como está.'
    ].join('\n'),
    tighten: [
      'Corte de 10% a 30% das palavras sem perder o sentido, a voz nem os fatos.',
      'Tire repetições, palavras de enchimento, rodeios e explicações demais.',
      'Mantenha a imagem mais forte de cada frase.'
    ].join('\n'),
    grammar: [
      'Corrija só erros claros: ortografia, gramática, pontuação, concordância e erros de digitação.',
      'Não mude o estilo, a escolha de palavras nem o ritmo. Mantenha as formas faladas e regionais (por exemplo, "pra" ou "tá") e a voz de cada personagem.',
      'Quando não tiver certeza de que algo é um erro, deixe como está.',
      'Mantenha as convenções de pontuação de diálogo do livro.'
    ].join('\n'),
    show: [
      'Encontre os trechos em que emoções ou traços de caráter são ditos de forma direta e, em vez disso, mostre-os com ações, detalhes dos sentidos, linguagem corporal ou diálogo.',
      'Mantenha todos os fatos. Mantenha o tamanho até cerca de 30% maior ou menor que o original.'
    ].join('\n'),
    expand: [
      'Amplie o trecho com detalhes concretos dos sentidos, pensamentos ou pequenas ações que combinem com a cena e os personagens.',
      'Não acrescente acontecimentos novos à trama. Mantenha a voz. Busque de 1,5 a 2 vezes o tamanho original.'
    ].join('\n')
  },
  categories: { characters: 'Personagens', places: 'Lugares', world: 'Mundo', plot: 'Trama', notes: 'Notas' }
}
