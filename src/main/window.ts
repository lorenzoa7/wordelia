export function themeOverlay(theme: 'light' | 'dark'): Electron.TitleBarOverlayOptions {
  return theme === 'dark'
    ? { color: '#191714', symbolColor: '#c9c0ae', height: 44 }
    : { color: '#ece5d8', symbolColor: '#4a443b', height: 44 }
}
