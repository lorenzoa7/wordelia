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
  efforts: { minimal: 'Mínimo', low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo' },
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
  categories: { characters: 'Personagens', places: 'Lugares', world: 'Mundo', plot: 'Trama', notes: 'Notas' }
}
