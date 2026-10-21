// A decision on a proposal changes the board: a column can come or go at the left, a card can move.
// The column that the author worked on stays at the same place of the screen: before the change, the
// board keeps where that column is; after it, the Line view moves the board back by the difference.

let anchor: { key: string; x: number } | null = null

function boxOf(el: Element | null): HTMLElement | null {
  return el?.closest<HTMLElement>('.line-scroll') ?? document.querySelector<HTMLElement>('.line-scroll')
}

/** Keep the column of this element (a button on the board) where it is now. */
export function keepColumn(el: Element): void {
  const box = boxOf(el)
  const col = el.closest<HTMLElement>('.line-col')
  if (!box || !col?.dataset.column) return
  anchor = { key: col.dataset.column, x: col.getBoundingClientRect().left - box.getBoundingClientRect().left }
}

/** Keep the first column on screen where it is now (a decision on the whole proposal). */
export function keepBoard(): void {
  const box = boxOf(null)
  if (!box) return
  const left = box.getBoundingClientRect().left
  const col = [...box.querySelectorAll<HTMLElement>('.line-col')].find((c) => c.getBoundingClientRect().right > left)
  if (col) keepColumn(col)
}

/** After a change: put the kept column back at its place. Call it after each render of the board. */
export function restoreColumn(box: HTMLElement | null): void {
  if (!anchor || !box) return
  const { key, x } = anchor
  anchor = null
  const col = [...box.querySelectorAll<HTMLElement>('.line-col')].find((c) => c.dataset.column === key)
  if (col) box.scrollLeft += col.getBoundingClientRect().left - box.getBoundingClientRect().left - x
}
