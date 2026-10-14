// Default AI actions and the writing rules template.

import type { AiAction } from '../types'

export const DEFAULT_ACTIONS: AiAction[] = [
  {
    id: 'polish',
    name: 'Polish',
    icon: 'Sparkle',
    builtIn: true,
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
    route: null,
    contextChars: 600,
    instructions: [
      'Only fix spelling, grammar, punctuation, agreement and typos.',
      'Do not change style, word choice or rhythm unless it is an error.',
      'Keep the dialogue punctuation conventions of the book.'
    ].join('\n')
  },
  {
    id: 'show',
    name: "Show, don't tell",
    icon: 'Eye',
    builtIn: true,
    route: null,
    contextChars: 2500,
    instructions: [
      'Find places where emotions or traits are stated directly, and show them instead through action, sensory detail, body language or dialogue.',
      'Keep every fact. Keep the length within about 30% of the original.'
    ].join('\n')
  },
  {
    id: 'expand',
    name: 'Expand',
    icon: 'ArrowsOutLineHorizontal',
    builtIn: true,
    route: null,
    contextChars: 3000,
    instructions: [
      'Expand the passage with concrete sensory detail, inner thought or small beats of action that fit the scene and the characters.',
      'Do not add new plot events. Keep the voice. Aim for about 1.5 to 2 times the length.'
    ].join('\n')
  }
]

export const DEFAULT_ACTION_ID = 'polish'

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
