/**
 * `column` is the column that a card had before; the card stays there. A `joined` card is the
 * next post of a thread: it goes directly below the card before it, with no gap.
 * `start` temporarily aligns the earlier posts to the current reading band.
 */
export type Item = { height: number; full: boolean; column?: number | undefined; joined?: boolean; start?: boolean }
/** Grid lines are 1-based. `column` 0 means the item spans every column. */
export type Placement = { column: number; row: number; span: number }

/** How many cards of at least `minWidth` px fit side by side in `width` px. */
export function columnsFor(width: number, minWidth: number, gap: number) {
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
}

/** Append new cards to the reading order, retaining X's controls and thread connections. */
export function mergeReadingOrder<T>(native: T[], previous: T[], full: (item: T) => boolean, joined: (item: T) => boolean = () => false): T[] {
  const result: T[] = []
  let run: T[] = []
  const flush = () => {
    const present = new Set(run)
    const order = previous.filter((item) => present.has(item))
    const known = new Set(order)
    for (const [i, item] of run.entries()) {
      if (known.has(item)) continue
      const before = joined(item) ? order.indexOf(run[i - 1]!) : -1
      order.splice(before < 0 ? order.length : before + 1, 0, item)
      known.add(item)
    }
    result.push(...order)
    run = []
  }
  for (const item of native) {
    if (full(item)) {
      flush()
      result.push(item)
    } else run.push(item)
  }
  flush()
  return result
}

/** Keep the visible band together, in screen order, with whole threads on either side. */
export function readingOrder(bounds: { top: number; bottom: number; left: number; joined?: boolean; full?: boolean }[], top: number, bottom: number) {
  const groups: { indices: number[]; top: number; bottom: number; left: number; full?: boolean }[] = []
  bounds.forEach((rect, index) => {
    const previous = groups.at(-1)
    if (rect.joined && !rect.full && previous && !previous.full) {
      previous.indices.push(index)
      previous.bottom = Math.max(previous.bottom, rect.bottom)
    } else groups.push({ ...rect, indices: [index] })
  })
  const band = (group: { top: number; bottom: number }) => group.bottom <= top ? 0 : group.top >= bottom ? 2 : 1
  const ordered: typeof groups = []
  let run: typeof groups = []
  const flush = () => {
    ordered.push(...run.sort((a, b) => band(a) - band(b) || a.top - b.top || a.left - b.left))
    run = []
  }
  for (const group of groups) {
    if (group.full) {
      flush()
      ordered.push(group)
    } else run.push(group)
  }
  flush()
  return ordered.flatMap((group) => group.indices.map((index) => ({ index, band: band(group) })))
}

/**
 * Masonry placement on a grid whose rows are `unit` px high: each card goes to the column that
 * is shortest so far, and a full-width item starts below every column. A card that already has
 * a column keeps it, so cards only ever move up and down when a height changes.
 */
export function placeCards(items: Item[], columns: number, unit: number, gap: number): Placement[] {
  const spans = items.map(({ height, full }, i) => height > 0 ? Math.ceil((height + (!full && items[i + 1]?.joined ? 0 : gap)) / unit) : 1)
  const boundary = items.findIndex((item) => item.start)
  if (boundary > 0) {
    // Reverse whole threads, not their posts, so the previous screen fills up to the boundary.
    const blocks: { indices: number[]; height: number; full: boolean; column: number | undefined }[] = []
    items.slice(0, boundary).forEach((item, i) => {
      const previous = blocks.at(-1)
      if (item.joined && !item.full && previous && !previous.full) {
        previous.indices.push(i)
        previous.height += spans[i]! * unit
      } else blocks.push({ indices: [i], height: spans[i]! * unit, full: item.full, column: item.column })
    })
    blocks.reverse()
    const above = placeCards(blocks, columns, unit, 0)
    const height = Math.max(...above.map(({ row, span }) => row + span - 1))
    const placed = new Array<Placement>(boundary)
    blocks.forEach((block, i) => {
      const position = above[i]!
      let row = height - position.row - position.span + 2
      for (const index of block.indices) {
        placed[index] = { column: position.column, row, span: spans[index]! }
        row += spans[index]!
      }
    })
    const below = placeCards(items.slice(boundary).map((item) => ({ ...item, start: false })), columns, unit, gap)
    return placed.concat(below.map((position) => ({ ...position, row: position.row + height })))
  }
  const next = Array<number>(Math.max(1, columns)).fill(1)
  let last: number | undefined // the column of the card before, if it was a card
  return items.map(({ full, column, joined }, position) => {
    const span = spans[position]!
    if (full) {
      const row = Math.max(...next)
      next.fill(row + span)
      last = undefined
      return { column: 0, row, span }
    }
    const kept = column !== undefined && column >= 1 && column <= next.length
    const index = joined && last !== undefined ? last : kept ? column - 1 : next.indexOf(Math.min(...next))
    const row = next[index]!
    next[index] = row + span
    last = index
    return { column: index + 1, row, span }
  })
}
