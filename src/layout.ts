/** `column` is the column that a card had before; the card stays there. */
export type Item = { height: number; full: boolean; column?: number | undefined }
/** Grid lines are 1-based. `column` 0 means the item spans every column. */
export type Placement = { column: number; row: number; span: number }

/** How many cards of at least `minWidth` px fit side by side in `width` px. */
export function columnsFor(width: number, minWidth: number, gap: number) {
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
}

/**
 * Masonry placement on a grid whose rows are `unit` px high: each card goes to the column that
 * is shortest so far, and a full-width item starts below every column. A card that already has
 * a column keeps it, so cards only ever move up and down when a height changes.
 */
export function placeCards(items: Item[], columns: number, unit: number, gap: number): Placement[] {
  const next = Array<number>(Math.max(1, columns)).fill(1)
  return items.map(({ height, full, column }) => {
    const span = height > 0 ? Math.ceil((height + gap) / unit) : 1
    if (full) {
      const row = Math.max(...next)
      next.fill(row + span)
      return { column: 0, row, span }
    }
    const kept = column !== undefined && column >= 1 && column <= next.length
    const index = kept ? column - 1 : next.indexOf(Math.min(...next))
    const row = next[index]!
    next[index] = row + span
    return { column: index + 1, row, span }
  })
}
