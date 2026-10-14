import type { WordeliaBridge } from '../shared/ipc'

declare global {
  interface Window {
    wordelia: WordeliaBridge
  }
}

export {}
