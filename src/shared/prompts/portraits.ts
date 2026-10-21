// The portraits of the planning entries, for the chat: which portraits go with a message.
// All of them go small, on sheets (a grid with the name of the entry under each portrait). The
// entries that the message is about go larger too. The renderer draws the images
// (features/chat/portraits.ts).

import type { Entry, Mention } from '../types'
import { isStoryLine } from '../storyline'
import { entriesMentionedIn } from './context'

/** Portraits on one sheet: a grid of 6 × 4. A sheet costs the AI about as much as one large image. */
export const PORTRAITS_PER_SHEET = 24
/** Not more sheets than this in one message */
export const MAX_SHEETS = 4
/** Not more large portraits than this in one message */
export const MAX_FOCUS = 4

export interface PortraitPlan {
  /** The entries with a portrait, sheet by sheet */
  sheets: Entry[][]
  /** The entries that the message is about and that have a portrait: they go larger too */
  focus: Entry[]
}

/** What the message is about: its mentions, the open entry, and its text (names and aliases). */
export interface PortraitFocus {
  mentions: Mention[]
  currentEntryId: string | null
  text: string
}

export function portraitPlan(entries: Entry[], about: PortraitFocus): PortraitPlan {
  const withImage = entries.filter((e) => e.image && !isStoryLine(e))
  const sheets: Entry[][] = []
  for (let i = 0; i < withImage.length && sheets.length < MAX_SHEETS; i += PORTRAITS_PER_SHEET) sheets.push(withImage.slice(i, i + PORTRAITS_PER_SHEET))
  const ids: string[] = []
  const add = (id: string | null): void => {
    if (id && !ids.includes(id)) ids.push(id)
  }
  for (const m of about.mentions) if (m.kind === 'entry') add(m.id)
  add(about.currentEntryId)
  for (const e of entriesMentionedIn(about.text, withImage)) add(e.id)
  const focus = ids
    .map((id) => withImage.find((e) => e.id === id))
    .filter((e): e is Entry => e !== undefined)
    .slice(0, MAX_FOCUS)
  return { sheets, focus }
}
