import { columnsFor, placeCards } from './layout.ts'
import { addStyle, onPageChange, queuePageCheck } from './page.ts'
import { feedKind, type FeedKind } from './route.ts'
import type { Settings, Store } from './settings.ts'

const UNIT = 4 // px height of one grid row
const CELL = '[data-testid="primaryColumn"] section [data-testid="cellInnerDiv"]'
const switchFor = {
  home: 'masonryHome',
  profile: 'masonryProfile',
  search: 'masonrySearch',
} as const satisfies Record<FeedKind, keyof Settings>

const CSS = `
html.xnote-masonry [data-testid="sidebarColumn"] { display: none !important; }
/* X centres the page by letting the navigation grow; give that space to the feed instead. */
html.xnote-masonry header[role="banner"] { flex-grow: 0 !important; }
html.xnote-masonry main[role="main"] { flex-grow: 1 !important; }
html.xnote-masonry main[role="main"] > div,
html.xnote-masonry main[role="main"] > div > div,
html.xnote-masonry main[role="main"] > div > div > div,
html.xnote-masonry [data-testid="primaryColumn"],
html.xnote-masonry [data-testid="primaryColumn"] :has(.xnote-grid) {
  width: 100% !important;
  max-width: none !important;
}
/* A profile's header arrives before its posts: wide from then on, so the page does not jump. */
html.xnote-profile [data-testid="primaryColumn"] :has([data-testid="UserName"]) { max-width: none !important; }
/* A profile's banner and avatar scale with their width: keep the sizes they have at X's 600px. */
html.xnote-profile [data-testid="primaryColumn"] div[style^="padding-bottom: 33.3"]:not([data-testid="cellInnerDiv"] *) {
  padding-bottom: 0 !important;
  height: 200px;
}
html.xnote-profile [data-testid="primaryColumn"] div:has(> div > div > div > div > a[href$="/photo"]) {
  width: 142px !important;
  margin-top: -85px !important;
}
.xnote-grid {
  display: grid !important;
  grid-auto-rows: ${UNIT}px;
  column-gap: var(--xnote-gap);
  align-items: start;
  min-height: 0 !important;
  padding: var(--xnote-gap);
}
.xnote-grid > * { position: static !important; transform: none !important; top: auto !important; min-width: 0; }
.xnote-grid > .xnote-card { border: 1px solid rgb(128 128 128 / 0.28); border-radius: 16px; overflow: hidden; }
/* Promoted posts, and the "Who to follow" module with its heading and "Show more" link. */
.xnote-grid > :has([data-testid="placementTracking"] article),
.xnote-grid > :has([data-testid="UserCell"]),
.xnote-grid > :has(h2[role="heading"]):has(+ * [data-testid="UserCell"]),
.xnote-grid > :has(a[href^="/i/connect_people"]) { display: none !important; }
`

// X's private React internals (ADR-0002). Everything read from them is checked before use.
type Scroller = {
  _getRenderCandidates: (...args: unknown[]) => Record<string, unknown>
  _shouldNormalize?: (...args: unknown[]) => unknown
  _update?: () => void
  props?: { cacheKey?: unknown }
  xnotePatched?: boolean
}

export function findInternals(container: object) {
  const key = Object.keys(container).find((name) => name.startsWith('__reactFiber$'))
  let fiber = key ? (container as any)[key] : null
  let scroller: Scroller | undefined
  for (; fiber; fiber = fiber.return) {
    if (!scroller && typeof fiber.stateNode?._getRenderCandidates === 'function') scroller = fiber.stateNode
    const nearEnd = fiber.memoizedProps?.onNearEnd
    if (scroller && typeof nearEnd === 'function') return { scroller, nearEnd: nearEnd as () => void }
  }
  return null
}

export function installMasonry(store: Store) {
  let container: HTMLElement | null = null
  let scroller: Scroller | null = null
  let broken = false
  let lastLoad = 0
  let layoutQueued = false
  // X restores the scroll position of a feed from its one-column positions, so xnote keeps its own.
  const positions = new Map<string, number>()
  let feedKey = ''
  // The column of every card that was placed, by feed and post. Without it the cards change
  // columns each time a height changes or X builds the feed again, which looks like a reload.
  const pins = new Map<string, number>()
  let pinnedColumns = 0
  let restore: { top: number; until: number } | undefined

  // X only renders the posts near the viewport and positions them for one column. In a grid
  // that removes posts the user still sees, so every loaded post stays rendered.
  const patch = (target: Scroller) => {
    if (target.xnotePatched) return
    target.xnotePatched = true
    const original = target._getRenderCandidates
    target._getRenderCandidates = function (this: Scroller, ...args) {
      const result = original.apply(this, args)
      const all = result?.allItemsWithPositions
      if (this !== scroller || !Array.isArray(all)) return result
      return { ...result, newRenderedItems: all, slice: { start: 0, end: all.length }, arePreferredItemsRendered: true }
    }
    // X scrolls the page to match its one-column positions, which makes the grid jump.
    const normalize = target._shouldNormalize
    if (typeof normalize === 'function') {
      target._shouldNormalize = function (this: Scroller, ...args) {
        return this === scroller ? false : normalize.apply(this, args)
      }
    }
  }

  const layout = () => {
    layoutQueued = false
    if (!container?.isConnected) return
    const all = [...container.children] as HTMLElement[]
    for (const cell of all) {
      const card = cell.querySelector('article') !== null
      // A cell must have its final width before its height is read.
      if (!cell.style.gridRowStart || card !== cell.classList.contains('xnote-card')) {
        cell.style.gridColumn = card ? 'auto' : '1 / -1'
      }
      cell.classList.toggle('xnote-card', card)
      resizes.observe(cell)
    }
    const { cardMinWidth, cardGap: gap } = store.get()
    // The container has a padding of one gap on each side.
    const columns = columnsFor(container.clientWidth - 2 * gap, cardMinWidth, gap)
    container.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`
    // Empty cells and the cells that the CSS hides take no part in the placement.
    const cells = all.filter((cell) => cell.offsetHeight > 0 || void (cell.style.gridArea = '1 / 1'))
    if (columns !== pinnedColumns) pins.clear()
    pinnedColumns = columns
    const keys = cells.map((cell) => {
      const post = cell.querySelector('time')?.closest('a')?.getAttribute('href')
      return post ? `${feedKey}|${post}` : undefined
    })
    const items = cells.map((cell, index) => ({
      height: cell.offsetHeight,
      full: !cell.classList.contains('xnote-card'),
      column: keys[index] ? pins.get(keys[index]) : undefined,
    }))
    placeCards(items, columns, UNIT, gap).forEach(({ column, row, span }, index) => {
      cells[index]!.style.gridArea = column ? `${row} / ${column} / span ${span} / span 1` : `${row} / 1 / span ${span} / -1`
      if (column && keys[index]) pins.set(keys[index], column)
    })
    if (restore) {
      // Wait until enough posts are rendered again, but not forever.
      if (document.documentElement.scrollHeight - innerHeight >= restore.top) {
        scrollTo(0, restore.top)
        restore = undefined
      } else if (Date.now() > restore.until) restore = undefined
    }
    loadMore()
  }
  const queueLayout = () => {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(layout)
  }
  const resizes = new ResizeObserver(queueLayout)
  const children = new MutationObserver(queueLayout)

  // X decides when to load the next page from its one-column positions, which are now wrong,
  // so call its own "near the end" callback instead. X makes the request (ADR-0001).
  const loadMore = () => {
    if (!container?.isConnected || Date.now() - lastLoad < 1200) return
    if (document.documentElement.scrollHeight - innerHeight - scrollY > 2 * innerHeight) return
    lastLoad = Date.now()
    findInternals(container)?.nearEnd()
  }

  const onScroll = () => {
    const onFeed = container?.isConnected && feedKind(location.pathname) !== null
    if (onFeed && !restore) positions.set(feedKey, scrollY)
    loadMore()
  }

  const stop = () => {
    resizes.disconnect()
    children.disconnect()
    if (container) {
      container.classList.remove('xnote-grid')
      for (const cell of container.children as HTMLCollectionOf<HTMLElement>) {
        cell.classList.remove('xnote-card')
        cell.style.gridArea = ''
      }
      container.style.gridTemplateColumns = ''
    }
    const previous = scroller
    container = scroller = null
    restore = undefined
    previous?._update?.() // lets X go back to rendering only the posts near the viewport
  }

  const sync = () => {
    const kind = feedKind(location.pathname)
    if (kind === 'keep') return
    const values = store.get()
    const root = document.documentElement
    root.style.setProperty('--xnote-gap', `${values.cardGap}px`)
    const wanted = values.enabled && !broken && kind !== null && values[switchFor[kind]]
    root.classList.toggle('xnote-masonry', wanted)
    root.classList.toggle('xnote-profile', wanted && kind === 'profile')
    if (!wanted) return stop()

    const next = document.querySelector(CELL)?.parentElement ?? null
    if (next === container || !next) return
    stop()
    const internals = findInternals(next)
    if (!internals) {
      // X changed its internals: fall back to the original single column (ADR-0002).
      broken = true
      console.warn('[xnote] masonry is off: X timeline internals were not found')
      return queuePageCheck()
    }
    container = next
    scroller = internals.scroller
    feedKey = String(scroller.props?.cacheKey ?? location.pathname)
    const top = positions.get(feedKey)
    restore = top ? { top, until: Date.now() + 3000 } : undefined
    patch(scroller)
    container.classList.add('xnote-grid')
    children.observe(container, { childList: true })
    scroller._update?.()
    lastLoad = Date.now() // X needs a moment to render every post again; the page is short until then
    queueLayout()
  }

  addStyle(CSS)
  onPageChange(sync)
  addEventListener('scroll', onScroll, { passive: true })
  store.subscribe(() => (queuePageCheck(), queueLayout()))

  return { isBroken: () => broken }
}
