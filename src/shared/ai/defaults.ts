// Default AI actions and the writing rules template.

import type { AiAction } from '../types'
import { normalizeShortcut } from './shortcuts'

/**
 * The built-in actions: the passes of a line editor that keep the words and the facts of the author.
 * Fix grammar only (proofread), Polish (line edit, the main action), Tighten (cut) and Show, don't tell
 * (one craft note). Expand left the defaults in version 0.7: it is the only action that writes new
 * material, and the chat does that better (see RETIRED_ACTIONS).
 */
export const DEFAULT_ACTIONS: AiAction[] = [
  {
    id: 'polish',
    name: 'Polish',
    icon: 'Sparkle',
    builtIn: true,
    shortcut: 'Ctrl+J',
    route: null,
    contextChars: 2500,
    instructions: [
      'Polish this passage like a careful line editor.',
      "Keep the author's voice, meaning, point of view, tense and every story fact.",
      'Fix grammar, spelling and punctuation.',
      'Make the prose flow: vary sentence length and rhythm, cut filler words, redundancy and weak adverbs, and prefer concrete nouns and strong verbs.',
      'Replace clichés with a fresher, simple phrase when one fits.',
      'Keep dialogue natural and in character, and keep the dialogue punctuation conventions of the book.',
      'Do not add events, details or explanations. Do not make the text longer than it needs to be.',
      'If a sentence is already good, keep it as it is.'
    ].join('\n')
  },
  {
    id: 'tighten',
    name: 'Tighten',
    icon: 'ArrowsInLineHorizontal',
    builtIn: true,
    shortcut: 'Alt+2',
    route: null,
    contextChars: 1500,
    instructions: [
      'Cut 10–30% of the words without losing meaning, voice or facts.',
      'Remove repetition, filler, hedges and over-explanation.',
      'Keep the strongest image in each sentence.'
    ].join('\n')
  },
  {
    id: 'grammar',
    name: 'Fix grammar only',
    icon: 'Checks',
    builtIn: true,
    shortcut: 'Alt+3',
    route: null,
    contextChars: 600,
    instructions: [
      'Only fix clear errors: spelling, grammar, punctuation, agreement and typos.',
      'Do not change style, word choice or rhythm. Keep spoken and regional forms (for example "pra" or "tá" in Portuguese) and the voice of each character.',
      'When you are not sure that something is an error, keep it as it is.',
      'Keep the dialogue punctuation conventions of the book.'
    ].join('\n')
  },
  {
    id: 'show',
    name: "Show, don't tell",
    icon: 'Eye',
    builtIn: true,
    shortcut: 'Alt+4',
    route: null,
    contextChars: 2500,
    instructions: [
      'Find places where emotions or traits are stated directly, and show them instead through action, sensory detail, body language or dialogue.',
      'Keep every fact. Keep the length within about 30% of the original.'
    ].join('\n')
  }
]

/**
 * Built-in actions of older versions, exactly as those versions wrote them to the settings. Settings
 * version 5 removes each one that the author did not change (`withoutRetiredActions`). A changed one
 * stays, and its name and instructions still show in the interface language (`common.builtinActions`).
 */
export const RETIRED_ACTIONS: AiAction[] = [
  {
    id: 'expand',
    name: 'Expand',
    icon: 'ArrowsOutLineHorizontal',
    builtIn: true,
    shortcut: 'Alt+5',
    route: null,
    contextChars: 3000,
    instructions: [
      'Expand the passage with concrete sensory detail, inner thought or small beats of action that fit the scene and the characters.',
      'Do not add new plot events. Keep the voice. Aim for about 1.5 to 2 times the length.'
    ].join('\n')
  }
]

/** Every built-in action that a settings file can hold: the defaults and the retired ones. */
export const BUILTIN_ACTIONS: AiAction[] = [...DEFAULT_ACTIONS, ...RETIRED_ACTIONS]

export const DEFAULT_ACTION_ID = 'polish'

/**
 * True when `a` is the built-in action `def` as the app wrote it: the same name, instructions, icon,
 * model, effort, context and shortcut. `anyShortcut`: settings from before version 4, where the user
 * could not choose a shortcut, so the shortcut that version 4 gave does not count as a change.
 */
export function isUnchangedBuiltIn(a: AiAction, def: AiAction, anyShortcut = false): boolean {
  return (
    a.builtIn === true &&
    a.id === def.id &&
    a.name === def.name &&
    a.instructions === def.instructions &&
    a.icon === def.icon &&
    a.route == null &&
    a.effort == null &&
    a.contextChars === def.contextChars &&
    (anyShortcut || normalizeShortcut(a.shortcut) === def.shortcut)
  )
}

/**
 * Settings version 5: remove the retired built-in actions that the author did not change. A changed
 * one stays, and so does the main action (the author chose it). The other actions keep their
 * shortcuts; a shortcut of a removed action becomes free. The list never becomes empty.
 */
export function withoutRetiredActions(actions: AiAction[], mainId: string, anyShortcut = false): AiAction[] {
  const next = actions.filter((a) => {
    const def = RETIRED_ACTIONS.find((r) => r.id === a.id)
    return !def || a.id === mainId || !isUnchangedBuiltIn(a, def, anyShortcut)
  })
  return next.length ? next : actions
}

/** The first line of the template under its title: a note for the author, not a rule. */
const TEMPLATE_NOTE = 'These rules guide every AI action and chat for this book. Write them in any language. Edit them freely.'
/** An example line of the template: "- (Example: …)". The author can translate the word. */
const EXAMPLE_LINE = /^\s*(?:[-*+]\s+)?\((?:example|examples|exemplo|exemplos|ejemplo|ejemplos)\s*:[^)]*\)\.?\s*$/i

/**
 * The writing rules as the AI gets them. The template of a new book has notes and example lines for
 * the author ("- (Example: … The story takes place in 1899.)"). They are hints, not rules: they never
 * go to the AI. A heading that has no rule under it goes too. Rules with only headings become empty,
 * so the prompt says that the author has not written rules yet.
 */
export function rulesForAi(rules: string): string {
  const lines = rules
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== TEMPLATE_NOTE && !EXAMPLE_LINE.test(l))
  // Remove the headings with no text under them (up to the next heading of the same or a higher level).
  const level = (l: string): number => /^(#{1,6})\s/.exec(l)?.[1].length ?? 0
  const keep = lines.map((l, i) => {
    const h = level(l)
    if (!h) return true
    for (let k = i + 1; k < lines.length; k++) {
      const next = level(lines[k])
      if (next && next <= h) return false
      if (!next && lines[k].trim()) return true
    }
    return false
  })
  return lines
    .filter((_, i) => keep[i])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function writingRulesTemplate(language: string): string {
  return `# Writing rules

These rules guide every AI action and chat for this book. Write them in any language. Edit them freely.

## Language
- Write in ${language}.

## Voice and point of view
- (Example: third person, past tense, close to the point-of-view character.)

## Dialogue
- (Example: dialogue lines start with a dash. Speech tags are set off with dashes.)

## Style
- (Example: short, concrete sentences in action scenes. Few adverbs.)

## Avoid
- (Example: modern slang. The story takes place in 1899.)
`
}
