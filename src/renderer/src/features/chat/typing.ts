// Is the author at work in a text? A reply that arrives must not take the author to another page or
// chapter while they type: the words would go to a place that they do not see.
//
// The author is busy when the focus is in a text field or an editor outside the chat panel, or when
// they typed in one in the last few seconds. The chat composer does not count: the author waits for
// the reply there.

/** How long after the last key in a text the author still counts as busy */
export const TYPING_MS = 4000

let lastTyped = 0

function isField(el: Element | null): boolean {
  return Boolean(el?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))
}

function inChat(el: Element | null): boolean {
  return Boolean(el?.closest('.chat-panel'))
}

function onType(e: Event): void {
  const el = e.target instanceof Element ? e.target : null
  if (isField(el) && !inChat(el)) lastTyped = Date.now()
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', onType, true)
  document.addEventListener('input', onType, true)
}

/** True while the author writes in a text outside the chat. */
export function authorIsBusy(): boolean {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (el && isField(el) && !inChat(el)) return true
  return Date.now() - lastTyped < TYPING_MS
}
