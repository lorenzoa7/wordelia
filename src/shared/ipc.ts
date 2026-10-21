// IPC contract between the renderer and the main process.
// To add a channel: add it here, handle it in src/main/ipc.ts, and the preload exposes it.

import type {
  AppSettings,
  HistoryItem,
  BookSnapshot,
  CompletionRequest,
  CompletionResult,
  LibraryItem,
  ModelInfo,
  ProviderId,
  ProviderStatus,
  StreamEvent,
  UpdateState
} from './types'

export interface ImportedChapter {
  /** '' when the file gives no title: the renderer names the chapter in the book language */
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

/**
 * What a folder that the writer chose is: a book; a folder inside a book (`root` is the book); or another
 * folder, with the count of Markdown and text files at its top (`notes`) and in its `manuscript/` folder.
 */
export type FolderInfo =
  | { kind: 'book' }
  | { kind: 'inside'; root: string; title: string }
  | { kind: 'folder'; name: string; notes: number; chapters: number }

/** Options of `book:open` */
export interface OpenBookOptions {
  /** Make a folder without wordelia.json a book (the writer said yes) */
  makeBook?: boolean
  /** The book language for a new manifest */
  language?: string
}

/** The result of "Find the folder…" for a book that moved */
export type RelocateResult = { ok: true; root: string } | { ok: false; reason: 'notBook' | 'otherBook'; title?: string }

export interface FontFaceSpec {
  family: string
  style: string
  weight: string
  unicodeRange: string
  /** Absolute URL of a font file of the app (http in dev, file in production) */
  url: string
}

export interface PdfExportRequest {
  /** Print HTML. The main process puts the embedded fonts where it finds the comment FONT_FACES. */
  html: string
  defaultName: string
  fonts: FontFaceSpec[]
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
  /** The editor counted the pages of the open book: the card shows this number, not an estimate */
  'library:pages': [[root: string, pages: number, words: number], void]
  /** Put back a card that "Remove from list" took away (Undo) */
  'library:restore': [[item: LibraryItem], void]
  /** Point the card of a moved book to its new folder, when the folder has the same book (by id) */
  'library:relocate': [[oldRoot: string, newRoot: string], RelocateResult]

  'book:create': [[opts: { parentDir: string; title: string; author: string; language: string; empty?: boolean }], BookSnapshot]
  'book:open': [[root: string, opts?: OpenBookOptions], BookSnapshot]
  /** What a chosen folder is: a book, a folder inside a book, or another folder */
  'book:inspectFolder': [[path: string], FolderInfo]
  'book:close': [[root: string], void]
  'book:pickFolder': [[opts: { title: string; create?: boolean }], string | null]
  'book:writeFile': [[root: string, rel: string, content: string], void]
  'book:readFile': [[root: string, rel: string], string | null]
  'book:deleteFile': [[root: string, rel: string], void]
  'book:renameFile': [[root: string, from: string, to: string], void]
  'book:importAsset': [[root: string, sourcePath: string], string]
  'book:pickImage': [[], string | null]
  'book:reveal': [[root: string, rel?: string], void]
  'book:assetUrl': [[root: string, rel: string], string]
  /** The bytes of an image of the planning (`_assets/…`), to draw it: the portraits for the chat. Null when it cannot be read. */
  'book:readAsset': [[root: string, rel: string], Uint8Array | null]
  /** Save an image for a chat message (already made small, WebP). Returns its path relative to planning/. */
  'chat:saveImage': [[root: string, data: Uint8Array, name: string], string]

  'history:save': [[root: string, chapterId: string, label: string, body: string], void]
  'history:list': [[root: string, chapterId: string], HistoryItem[]]
  'history:read': [[root: string, chapterId: string, id: string], string | null]

  'settings:get': [[], AppSettings]
  'settings:set': [[patch: Partial<AppSettings>], AppSettings]

  'ai:status': [[provider: ProviderId], ProviderStatus]
  'ai:models': [[provider: ProviderId], ModelInfo[]]
  'ai:complete': [[requestId: string, req: CompletionRequest], CompletionResult]
  'ai:cancel': [[requestId: string], void]
  'ai:setKey': [[provider: ProviderId, key: string | null], void]
  'ai:hasKey': [[provider: ProviderId], boolean]
  /** Open a terminal window that runs the login command of a CLI provider */
  'ai:openLogin': [[provider: ProviderId], boolean]
  'ai:openUpdate': [[provider: ProviderId], boolean]

  'export:pdf': [[req: PdfExportRequest], string | null]
  'export:docx': [[req: DocxExportRequest], string | null]
  'export:text': [[req: TextExportRequest], string | null]

  'import:pick': [[], string | null]
  'import:read': [[path: string], ImportedBook]
  /** Choose Markdown notes (for the planning). Returns their names and text. */
  'import:pickNotes': [[], Array<{ name: string; text: string }>]

  'app:defaultBooksDir': [[], string]
  'app:version': [[], string]
  'app:flushDone': [[ok: boolean, error: string], void]
  /** The state of the app update now */
  'app:updateState': [[], UpdateState]
  /** Look for a new version now */
  'app:checkUpdate': [[], UpdateState]
  /** Save everything, close, install the downloaded version and start again */
  'app:installUpdate': [[], void]

  'window:setTheme': [[theme: 'light' | 'dark'], void]
  'window:openExternal': [[url: string], void]
  'window:showItem': [[path: string], void]
  'window:setSpellLanguage': [[tag: string], void]
}

/** Events from main to renderer: channel -> payload */
export interface IpcEventMap {
  'book:externalChange': { root: string; rel: string; content: string | null }
  'ai:event': { requestId: string; event: StreamEvent }
  /** The window wants to close: save everything, then call app:flushDone */
  'app:flushRequest': Record<string, never>
  'app:update': UpdateState
  /** The model list of a provider changed, for example when the real models of the claude aliases are known */
  'ai:modelsChanged': { provider: ProviderId }
}

export type InvokeChannel = keyof IpcInvokeMap
export type EventChannel = keyof IpcEventMap
export type InvokeArgs<C extends InvokeChannel> = IpcInvokeMap[C][0]
export type InvokeResult<C extends InvokeChannel> = IpcInvokeMap[C][1]

export const INVOKE_CHANNELS: InvokeChannel[] = [
  'library:list',
  'library:remove',
  'library:touch',
  'library:pages',
  'library:restore',
  'library:relocate',
  'book:create',
  'book:open',
  'book:inspectFolder',
  'book:close',
  'book:pickFolder',
  'book:writeFile',
  'book:readFile',
  'book:deleteFile',
  'book:renameFile',
  'book:importAsset',
  'book:pickImage',
  'book:reveal',
  'book:assetUrl',
  'book:readAsset',
  'chat:saveImage',
  'history:save',
  'history:list',
  'history:read',
  'settings:get',
  'settings:set',
  'ai:status',
  'ai:models',
  'ai:complete',
  'ai:cancel',
  'ai:setKey',
  'ai:hasKey',
  'ai:openLogin',
  'ai:openUpdate',
  'export:pdf',
  'export:docx',
  'export:text',
  'import:pick',
  'import:read',
  'import:pickNotes',
  'app:defaultBooksDir',
  'app:version',
  'app:flushDone',
  'app:updateState',
  'app:checkUpdate',
  'app:installUpdate',
  'window:setTheme',
  'window:openExternal',
  'window:showItem',
  'window:setSpellLanguage'
]

export const EVENT_CHANNELS: EventChannel[] = ['book:externalChange', 'ai:event', 'app:flushRequest', 'app:update', 'ai:modelsChanged']

export interface WordeliaBridge {
  platform: string
  isE2E: boolean
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
  on<C extends EventChannel>(channel: C, listener: (payload: IpcEventMap[C]) => void): () => void
}
