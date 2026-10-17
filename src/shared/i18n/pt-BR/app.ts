import type { app as en } from '../en/app'

export const app: typeof en = {
  update: {
    ready: (v) => `O Wordelia ${v} está pronto. Reinicie para usar.`,
    restartNow: 'Reiniciar agora',
    badge: 'Atualização pronta',
    badgeHint: (v) => `Reiniciar e instalar o Wordelia ${v}. Seu trabalho é salvo antes.`
  },
  showSidebar: 'Mostrar barra lateral',
  hideSidebar: 'Ocultar barra lateral',
  library: 'Biblioteca',
  backToLibrary: 'Voltar para a biblioteca',
  bookSettings: 'Configurações do livro',
  exportBook: 'Exportar…',
  showFolder: 'Mostrar pasta',
  closeBook: 'Fechar livro',
  viewNav: 'Visualização',
  views: { write: 'Escrever', plan: 'Planejar' },
  showChat: 'Mostrar chat',
  hideChat: 'Ocultar chat',
  chatWidth: 'Largura do chat. Use as setas para mudar.',
  sidebarWidth: 'Largura da barra lateral. Use as setas para mudar.',
  resizeHint: 'Arraste para mudar a largura. Arraste até a borda para ocultar.',
  openHint: 'Arraste ou clique para mostrar',
  provider: {
    connect: 'Conectar uma IA',
    checking: 'Verificando…',
    notConnected: (name) => `${name}: não conectado`,
    ready: (name) => `IA pronta: ${name}`,
    openSettings: 'Abrir configurações de IA'
  },
  aiErrors: {
    notInstalled: 'O provedor de IA não está instalado.',
    notLoggedIn: 'Sem login.',
    connectHint: (detail) => `${detail} Abra Configurações → IA para conectar.`,
    rateLimit: 'O provedor de IA diz que o limite de uso foi atingido. Tente de novo mais tarde.',
    network: 'Sem conexão com o provedor de IA.',
    cancelled: 'Interrompido.',
    unknown: 'Algo deu errado.'
  }
}
