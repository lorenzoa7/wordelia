// The Markdown of the chat: the replies of the AI, and the letters of an editor's read (features/read).

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** A link in a reply: it opens in the browser. */
export function ChatLink({ href, children }: { href?: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

const BASE: Components = { a: ChatLink }

/** Markdown text. `components` change some of the elements that it makes, for example the links of a letter. */
export function Markdown({ text, components }: { text: string; components?: Components }): React.JSX.Element {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components ? { ...BASE, ...components } : BASE}>
      {text}
    </ReactMarkdown>
  )
}
