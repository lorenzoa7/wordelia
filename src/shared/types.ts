// Domain types shared by the main process and the renderer.
// Terms follow GLOSSARY.md.

export type Id = string

/* ------------------------------------------------------------------ */
/* Document model (ProseMirror-compatible JSON)                         */
/* ------------------------------------------------------------------ */

export interface DocMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface DocNode {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  marks?: DocMark[]
  text?: string
}

/* ------------------------------------------------------------------ */
/* Book                                                                 */
/* ------------------------------------------------------------------ */

export type DialogueDash = '—' | '―'
export type SceneBreakStyle = 'asterisks' | 'asterism' | 'fleuron' | 'hash' | 'blank'

export interface Typography {
  fontFamily: string
  /** Points */
  fontSize: number
  lineHeight: number
  /** Em. Space between paragraphs. Books use 0. */
  paragraphSpacing: number
  /** Em. First-line indent of paragraphs. */
  firstLineIndent: number
  align: 'left' | 'justify'
  /** Books do not indent the first paragraph of a chapter or scene. */
  indentFirstParagraph: boolean
  dialogueDash: DialogueDash
  smartQuotes: boolean
  smartEllipsis: boolean
  sceneBreak: SceneBreakStyle
}

export interface ChapterRef {
  id: Id
  /** File name inside `manuscript/` */
  file: string
}

export interface CategoryDef {
  id: Id
  name: string
  /** Folder name inside `planning/` */
  folder: string
  /** Phosphor icon name */
  icon: string
}

export type PageSize = 'A4' | 'A5' | 'Letter' | 'Trade6x9' | 'Digest5_5x8_5' | 'Pocket5x8'

export interface ExportSettings {
  preset: 'book' | 'manuscript'
  pageSize: PageSize
  /** Millimeters */
  margins: { top: number; bottom: number; inner: number; outer: number }
  typography: Pick<Typography, 'fontFamily' | 'fontSize' | 'lineHeight' | 'firstLineIndent' | 'align'>
  chapterHeading: 'number-title' | 'title' | 'number' | 'word-number-title'
  chapterStartsOnNewPage: boolean
  chapterDropFromTop: number
  sceneBreak: SceneBreakStyle
  titlePage: boolean
  pageNumbers: boolean
  runningHeader: boolean
}

export interface BookManifest {
  format: 1
  id: Id
  title: string
  subtitle: string
  author: string
  /** BCP 47 language tag, for example `pt-BR` */
  language: string
  genre: string
  createdAt: string
  updatedAt: string
  chapters: ChapterRef[]
  planning: { categories: CategoryDef[] }
  typography: Typography
  export: ExportSettings
}

export interface Chapter {
  id: Id
  file: string
  title: string
  /** Wordelia Markdown, without frontmatter */
  body: string
  /** Other frontmatter keys, kept as they are */
  meta: Record<string, unknown>
}

export interface Entry {
  id: Id
  /** Folder of the category */
  category: string
  /** Path inside `planning/`, for example `Characters/Heitor.md` */
  file: string
  /** File name without extension */
  name: string
  aliases: string[]
  summary: string
  image: string | null
  body: string
  meta: Record<string, unknown>
}

export interface SyncState {
  /** Chapter id to content hash at the last planning sync */
  chapters: Record<Id, string>
  syncedAt: string | null
}

export interface BookSnapshot {
  root: string
  manifest: BookManifest
  chapters: Chapter[]
  entries: Entry[]
  threads: Thread[]
  writingRules: string
  syncState: SyncState
}

export interface HistoryItem {
  id: string
  at: string
  label: string
  words: number
}

export interface LibraryItem {
  root: string
  id: Id
  title: string
  author: string
  words: number
  chapters: number
  openedAt: string
  /** The first words of the book, for the library card */
  excerpt?: string
  missing?: boolean
}

/* ------------------------------------------------------------------ */
/* AI                                                                   */
/* ------------------------------------------------------------------ */

export type ProviderId = 'claude-code' | 'codex' | 'anthropic' | 'openai'
export type Effort = 'low' | 'medium' | 'high'
export type TaskKind = 'chat' | 'action' | 'sync' | 'background'

export interface ModelChoice {
  provider: ProviderId
  model: string
  effort?: Effort
}

export type ModelRoutes = Record<TaskKind, ModelChoice | null>

export interface ModelInfo {
  id: string
  label: string
  description?: string
  isDefault?: boolean
  /** Tokens */
  contextWindow?: number
  tier?: 'best' | 'balanced' | 'fast'
}

export interface ProviderStatus {
  provider: ProviderId
  installed: boolean
  /** null when the app cannot know without a real request */
  loggedIn: boolean | null
  version?: string
  detail?: string
  account?: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface CompletionRequest {
  route: ModelChoice
  system: string
  messages: ChatTurn[]
  maxTokens?: number
  /** For logs and UI */
  purpose: TaskKind
}

export type StreamEvent =
  | { type: 'start'; model?: string }
  | { type: 'text'; delta: string }
  | { type: 'status'; message: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }

export interface CompletionResult {
  ok: boolean
  text: string
  model?: string
  error?: string
  errorKind?: 'not-installed' | 'not-logged-in' | 'rate-limit' | 'cancelled' | 'network' | 'other'
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number }
}

export interface AiAction {
  id: Id
  name: string
  /** What the AI must do with the selection */
  instructions: string
  /** null: use the `action` model route */
  route: ModelChoice | null
  /** Characters of context before and after the selection */
  contextChars: number
  icon: string
  builtIn: boolean
}

/* ------------------------------------------------------------------ */
/* Threads                                                              */
/* ------------------------------------------------------------------ */

export interface Quote {
  id: Id
  text: string
  /** Where the quote comes from, for example a chapter id */
  source: { kind: 'chapter' | 'entry'; id: Id; label: string }
}

export interface Mention {
  kind: 'chapter' | 'entry' | 'thread'
  id: Id
  label: string
}

export type HunkState = 'pending' | 'accepted' | 'rejected' | 'failed'

export interface ChatMessage {
  id: Id
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  quotes?: Quote[]
  mentions?: Mention[]
  /** Proposal hunk key to state */
  hunks?: Record<string, HunkState>
  model?: string
  error?: string
}

export interface Thread {
  id: Id
  title: string
  brief: string
  digest: string
  /** Number of messages that the digest covers */
  digestedCount: number
  createdAt: string
  updatedAt: string
  pinned: boolean
  route: ModelChoice | null
  messages: ChatMessage[]
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

export type ThemeSetting = 'light' | 'dark' | 'system'

export interface ProviderSettings {
  enabled: boolean
  /** Optional custom path to the CLI binary */
  binPath?: string
}

export interface AppSettings {
  version: 1
  theme: ThemeSetting
  ui: {
    sidebarOpen: boolean
    chatOpen: boolean
    focusMode: boolean
    typewriterScroll: boolean
    zoom: number
    chatWidth: number
  }
  editor: {
    spellcheck: boolean
    showWordCount: boolean
    typewriterSounds: boolean
    /** Words a day. 0 hides the goal. */
    dailyGoal: number
  }
  providers: Record<ProviderId, ProviderSettings>
  routes: ModelRoutes
  actions: AiAction[]
  defaultActionId: Id
  onboarded: boolean
}
