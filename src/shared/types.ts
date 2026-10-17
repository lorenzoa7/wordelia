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
  /** How dialogue is set: a dash at the start of the line (Portuguese, Spanish, French) or quotation marks (English, German) */
  dialogueStyle: 'dash' | 'quotes'
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
  /** Path inside `planning/`, for example `Characters/Marta.md` */
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
/** How long the model thinks before it answers. Each model supports some of these. */
export type Effort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
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
  /** Effort levels that the model accepts. Empty: the model has no effort setting. Unknown: undefined. */
  efforts?: Effort[]
  /** The effort that the model uses when the app sends none */
  defaultEffort?: Effort
  /** For an alias such as "opus": the model that answered last time, for example "Claude Opus 5.5" */
  resolvedLabel?: string
}

export interface ProviderStatus {
  provider: ProviderId
  installed: boolean
  /** null when the app cannot know without a real request */
  loggedIn: boolean | null
  version?: string
  /** The newest published version of the CLI, when the app could check */
  latestVersion?: string
  /** Why the provider is not connected, when the app knows: the saved login has expired */
  reason?: 'expired'
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
  /** A piece of the model's thinking (a summary), when the provider streams it */
  | { type: 'thinking'; delta: string }
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
  /** Effort for this action. Undefined: the effort of the route. */
  effort?: Effort
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
  /**
   * For accepted `<create>` proposals that replaced an entry: the entry file from before, by hunk key.
   * A rewind of the thread uses it to put the old entry back.
   */
  replaced?: Record<string, string>
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
  /**
   * When the user last saw the thread. A reply after this time is new to the user.
   * Threads from before this field have none: they count as seen.
   */
  readAt?: string
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

/** Languages of the app interface. The language of a book is a separate setting. */
export type Locale = 'en' | 'pt-BR' | 'es'

export interface AppSettings {
  /** 2: Claude Code routes have an explicit effort. 3: the chat effort default is medium. */
  version: 3
  /** Language of the interface */
  language: Locale
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
  /** Download new versions in the background and install them on restart */
  autoUpdate: boolean
}

/** The state of the app update, from the main process */
export type UpdateState =
  | { state: 'idle' }
  /** Updates do not work here: a development build, a test run, or the updates are off */
  | { state: 'off' }
  | { state: 'checking' }
  | { state: 'none'; checkedAt: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
