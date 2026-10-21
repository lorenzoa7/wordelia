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
    connectHint: 'Nenhuma IA está conectada. Abra Configurações → IA para conectar uma.',
    notConnectedShort: 'IA não conectada',
    notConnectedHint: (name) => `${name} não está conectado. Abra Configurações → IA para conectar.`,
    expired: 'Login da IA expirou',
    expiredHint: (name) => `O login do ${name} expirou. Abra Configurações → IA para entrar de novo.`
  },
  aiErrors: {
    notInstalled: (p) => `O ${p} não está instalado neste computador. Abra Configurações → IA para instalar.`,
    notLoggedIn: (p) => `Você não fez login no ${p}. Abra Configurações → IA para entrar.`,
    noKey: (p) => `Adicione uma chave de API para ${p} em Configurações → IA.`,
    loginExpired: (p) => `O login do ${p} expirou. Abra Configurações → IA para entrar de novo.`,
    badKey: (p) => `A chave de API não funcionou com ${p}. Confira a chave em Configurações → IA.`,
    noCredit: (p) => `A sua conta de ${p} está sem crédito. Adicione crédito no site de ${p} e tente de novo.`,
    usageLimit: 'Você chegou ao limite de uso do seu plano. Tente de novo mais tarde.',
    usageLimitUntil: (time) => `Você chegou ao limite de uso do seu plano. Ele se renova: ${time}.`,
    overloaded: (p) => `O servidor de ${p} está ocupado agora. Tente de novo daqui a pouco.`,
    network: (p) => `Sem conexão com ${p}. Confira a internet e tente de novo.`,
    refused: 'O modelo recusou este pedido.',
    off: (p) => `O provedor ${p} está desligado. Ligue-o em Configurações → IA.`,
    cancelled: 'Interrompido.',
    other: (p) => `${p} não conseguiu responder. Tente de novo.`,
    theAi: 'a IA',
    openSettings: 'Abrir configurações'
  },
  keepBookOpen: 'Manter o livro aberto'
}
