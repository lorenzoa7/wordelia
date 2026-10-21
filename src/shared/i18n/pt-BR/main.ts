import type { main as en } from '../en/main'

export const main: typeof en = {
  contextMenu: {
    cut: 'Recortar',
    copy: 'Copiar',
    paste: 'Colar',
    selectAll: 'Selecionar tudo',
    noSuggestions: 'Nenhuma sugestão',
    addToDictionary: (word) => `Adicionar “${word}” ao dicionário`
  },
  closeDialog: {
    message: 'Não foi possível salvar algumas mudanças.',
    fileNotWritten: 'Não foi possível gravar um arquivo.',
    syncAppHint: 'Se um app de sincronização (OneDrive, Google Drive, Dropbox) estiver usando o arquivo, espere um pouco e tente de novo.',
    keepOpen: 'Manter a janela aberta',
    closeAnyway: 'Fechar mesmo assim'
  },
  dialogs: {
    chooseFolderFirst: 'Primeiro escolha a pasta do livro.',
    useOpenFolder: 'Abra a pasta com o botão Abrir pasta.',
    chooseImage: 'Escolher uma imagem',
    images: 'Imagens',
    importBook: 'Importar um livro',
    documents: 'Documentos',
    importNotes: 'Importar notas para o planejamento',
    markdownNotes: 'Notas em Markdown'
  },
  export: {
    pdf: { title: 'Exportar PDF', filter: 'PDF' },
    docx: { title: 'Exportar documento do Word', filter: 'Documento do Word' },
    markdown: { title: 'Exportar Markdown', filter: 'Markdown' },
    text: { title: 'Exportar texto', filter: 'Texto' }
  },
  terminal: {
    login: 'Wordelia: entrar',
    update: 'Wordelia: atualizar'
  },
  ai: {
    retrying: 'Tentando de novo…',
    cancelled: 'Cancelado.',
    claudeNotFound: 'O Wordelia não encontrou o programa claude neste computador.',
    claudeLogin: 'Clique em “Entrar…” para fazer login. Ou execute "claude auth login" em um terminal.',
    claudeNotInstalled: 'O Claude Code não está instalado.',
    claudeBadArgs: 'O programa claude não aceitou o pedido. Atualize o Claude Code.',
    claudeExited: (code) => `O claude terminou com o código ${code}`,
    codexNotFound: 'O Wordelia não encontrou o programa codex neste computador.',
    codexLogin: 'Clique em “Entrar…” para fazer login. Ou execute "codex login" em um terminal.',
    codexExpired: 'O login do Codex expirou. Clique em “Entrar…” para sair e entrar de novo.',
    codexNotInstalled: 'O Codex não está instalado.',
    codexError: 'Erro do Codex',
    codexTurn: (status) => `A execução terminou: ${status}`,
    codexStopped: 'O codex app-server parou',
    codexExited: (code) => `O codex terminou com o código ${code}`,
    addApiKey: 'Adicione uma chave de API.',
    apiKeyWorks: 'A chave de API funciona.',
    anthropicAddKey: 'Adicione uma chave da Anthropic API nas Configurações.',
    refusal: 'O modelo recusou este pedido.',
    openaiAddKey: 'Adicione uma chave da OpenAI API nas Configurações.',
    requestFailed: 'O pedido falhou.',
    providerOff: (provider) => `O ${provider} está desligado em Configurações → IA.`,
    noKeyStore: 'Este computador não tem um lugar seguro para a chave (o cofre de chaves do sistema não está disponível).'
  }
}
