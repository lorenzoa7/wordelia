// IPC contract between the renderer and the main process.
// To add a channel: add it here, handle it in src/main/ipc.ts, and the preload exposes it.

import type {
  AppSettings,
  BookSnapshot,
  CompletionRequest,
  CompletionResult,
  LibraryItem,
  ModelInfo,
  ProviderId,
  ProviderStatus,
  StreamEvent
} from './types'

export interface ImportedChapter {
  title: string
  /** DOCX imports give HTML. The renderer converts it to Markdown. */
  html?: string
  markdown?: string
}

export interface ImportedBook {
  title: string
  author: string
  chapters: ImportedChapter[]
  warnings: string[]
}

export interface PdfExportRequest {
  html: string
  defaultName: string
}

export interface DocxExportRequest {
  /** Serialized DocxBook (see src/shared/export/model.ts) */
  book: unknown
  defaultName: string
}

export interface TextExportRequest {
  content: string
  defaultName: string
  extension: 'md' | 'txt'
}

/** Request-response channels: channel -> [args, result] */
export interface IpcInvokeMap {
  'library:list': [[], LibraryItem[]]
  'library:remove': [[root: string], void]
  'library:touch': [[item: LibraryItem], void]

  'book:create': [[opts: { parentDir: string; title: string; author: string; language: string }], BookSnapshot]
  'book:open': [[root: string], BookSnapshot]
  'book:close': [[root: string], void]
  'book:pickFolder': [[opts: { title: string; create?: boolean }], string | null]
  'book:writeFile': [[root: string, rel: string, content: string], void]
  'book:deleteFile': [[root: string, rel: string], void]
  'book:renameFile': [[root: string, from: string, to: string], void]
  'book:importAsset': [[root: string, sourcePath: string], string]
  'book:pickImage': [[], string | null]
  'book:reveal': [[root: string, rel?: string], void]
  'book:assetUrl': [[root: string, rel: string], string]

  'settings:get': [[], AppSettings]
  'settings:set': [[patch: Partial<AppSettings>], AppSettings]

  'ai:status': [[provider: ProviderId], ProviderStatus]
  'ai:models': [[provider: ProviderId], ModelInfo[]]
  'ai:complete': [[requestId: string, req: CompletionRequest], CompletionResult]
  'ai:cancel': [[requestId: string], void]
  'ai:setKey': [[provider: ProviderId, key: string | null], void]
  'ai:hasKey': [[provider: ProviderId], boolean]

  'export:pdf': [[req: PdfExportRequest], string | null]
  'export:docx': [[req: DocxExportRequest], string | null]
  'export:text': [[req: TextExportRequest], string | null]

  'import:pick': [[], string | null]
  'import:read': [[path: string], ImportedBook]

  'window:setTheme': [[theme: 'light' | 'dark'], void]
  'window:openExternal': [[url: string], void]
  'window:showItem': [[path: string], void]
}

/** Events from main to renderer: channel -> payload */
export interface IpcEventMap {
  'book:externalChange': { root: string; rel: string; content: string | null }
  'ai:event': { requestId: string; event: StreamEvent }
}

export type InvokeChannel = keyof IpcInvokeMap
export type EventChannel = keyof IpcEventMap
export type InvokeArgs<C extends InvokeChannel> = IpcInvokeMap[C][0]
export type InvokeResult<C extends InvokeChannel> = IpcInvokeMap[C][1]

export const INVOKE_CHANNELS: InvokeChannel[] = [
  'library:list',
  'library:remove',
  'library:touch',
  'book:create',
  'book:open',
  'book:close',
  'book:pickFolder',
  'book:writeFile',
  'book:deleteFile',
  'book:renameFile',
  'book:importAsset',
  'book:pickImage',
  'book:reveal',
  'book:assetUrl',
  'settings:get',
  'settings:set',
  'ai:status',
  'ai:models',
  'ai:complete',
  'ai:cancel',
  'ai:setKey',
  'ai:hasKey',
  'export:pdf',
  'export:docx',
  'export:text',
  'import:pick',
  'import:read',
  'window:setTheme',
  'window:openExternal',
  'window:showItem'
]

export const EVENT_CHANNELS: EventChannel[] = ['book:externalChange', 'ai:event']

export interface WordeliaBridge {
  platform: string
  isE2E: boolean
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  on<C extends EventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void): () => void
}
