import { columnsFor, mergeReadingOrder, placeCards, readingOrder } from './layout.ts'
import { addStyle, onPageChange, queuePageCheck } from './page.ts'
import { fibers, isNewPostsControl } from './react.ts'
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
/* Wide layout: the navigation and the feed touch the sides of the window. Other pages keep X's
   content, centred in the space beside the navigation. */
html.xnote-wide header[role="banner"] { flex-grow: 0 !important; width: auto !important; align-items: flex-start !important; }
html.xnote-wide header[role="banner"] > div { margin-left: 0 !important; }
html.xnote-wide main[role="main"] { flex-grow: 1 !important; align-items: center !important; }
html.xnote-wide.xnote-masonry main[role="main"] > div,
html.xnote-masonry main[role="main"] > div > div,
html.xnote-masonry main[role="main"] > div > div > div,
html.xnote-masonry [data-testid="primaryColumn"],
html.xnote-masonry [data-testid="primaryColumn"] :has(.xnote-grid) {
  width: 100% !important;
  max-width: none !important;
}
/* Otherwise X's layout, and the feed leaves as much blank space on the right as X leaves on the
   left of the navigation (--xnote-feed is set by the script). */
html.xnote-masonry:not(.xnote-wide) main[role="main"] > div > div { width: var(--xnote-feed, 100%) !important; }
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
  overflow-anchor: none;
}
.xnote-grid > * { position: static !important; transform: none !important; top: auto !important; min-width: 0; }
/* X builds the feed again when the user comes back to it. Posts that have no place yet would
   show in one column, then in a heap, then in their places: keep them unseen until then. */
html.xnote-masonry [data-testid="primaryColumn"] section:has([data-testid="cellInnerDiv"]):not(:has(.xnote-grid)),
.xnote-grid > :not([style*="grid-area"]) { visibility: hidden; }
.xnote-grid > .xnote-card { border: 1px solid rgb(128 128 128 / 0.28); border-radius: 16px; overflow: hidden; }
/* X gives every action under a post the same width, so in a narrow card a long count runs into
   the next icon. Size them by their content instead, and as the card gets narrower drop the
   numbers that matter least: first the views, then the reposts. The icons always stay. */
.xnote-grid article [role="group"]:has([data-testid="like"], [data-testid="unlike"]) { container-type: inline-size; }
.xnote-grid article [role="group"]:has([data-testid="like"], [data-testid="unlike"]) > div:not(:last-child) { flex: 1 0 auto !important; }
/* Measured on 56 posts: every action shows in 299px, without the view count in 261px. */
@container (width < 300px) {
  .xnote-grid article [role="group"] a[href$="/analytics"] [data-testid="app-text-transition-container"] { display: none; }
}
@container (width < 262px) {
  .xnote-grid article [role="group"] :is([data-testid="retweet"], [data-testid="unretweet"]) [data-testid="app-text-transition-container"] { display: none; }
}
/* The posts of a thread are one card: X draws a line from one avatar to the next. */
.xnote-grid > .xnote-joined { border-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; }
.xnote-grid > .xnote-card:has(+ .xnote-joined) { border-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
/* Promoted posts, and the "Who to follow" module with its heading and "Show more" link, marked
   from script: as :has() rules they cost the browser a lot on every change of a large feed. */
.xnote-grid > .xnote-skip { display: none !important; }
/* A quoted post with an article puts the article card and the post's text side by side. The card
   takes all of a card's width, which leaves the text a column of no width, one character a line. */
.xnote-grid div[role="link"] div:has(> div > div > [data-testid="article-cover-image"]) { flex-direction: column !important; }
/* Cards far from the window keep their size but the browser skips their content. The height is
   pinned: content-visibility:auto changes it and makes X measure its posts again and again. */
.xnote-grid > .xnote-far { content-visibility: hidden; box-sizing: border-box; height: var(--xnote-far-height); }
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
  let layoutWidth = 0
  let order: HTMLElement[] = []
  type Anchor = { key: string; top: number }
  const arrangements = new Map<string, { keys: string[]; starts: Set<string>; columns: number; anchor?: Anchor | undefined }>()
  const starts = new Set<HTMLElement>()
  const bounds = new Map<HTMLElement, { top: number; bottom: number; left: number; key: string | undefined }>()
  const keyOf = (cell: HTMLElement) => {
    const post = cell.querySelector('time')?.closest('a')?.getAttribute('href')
    return post ? `${feedKey}|${post}` : undefined
  }
  const remember = () => {
    const saved = arrangements.get(feedKey)
    if (!saved) return
    let nearest: Anchor | undefined
    for (const rect of bounds.values()) {
      const top = rect.top - scrollY
      const key = rect.key
      if (key && rect.bottom - scrollY > 54 && top < innerHeight && (!nearest || Math.abs(top - 54) < Math.abs(nearest.top - 54))) nearest = { key, top }
    }
    saved.anchor = nearest
  }
  const capture = () => {
    bounds.clear()
    for (const cell of order) {
      const rect = cell.getBoundingClientRect()
      bounds.set(cell, { top: rect.top + scrollY, bottom: rect.bottom + scrollY, left: rect.left, key: keyOf(cell) })
    }
    remember()
  }
  let restore: { top: number; until: number; anchor?: Anchor | undefined } | undefined
  let updating = false
  // Keep the visible band in place while images settle, until the user moves.
  let hold: { cell: HTMLElement; top: number } | undefined
  for (const type of ['wheel', 'keydown', 'pointerdown', 'touchstart']) addEventListener(type, () => void (hold = undefined), { passive: true })
  // Whether a cell is a later post of a thread, from X's data of the timeline entry (private, checked).
  const later = new WeakMap<HTMLElement, boolean>()
  const isLater = (cell: HTMLElement) => {
    if (!later.has(cell)) {
      const entry = fibers(cell).map((fiber) => fiber.memoizedProps?.item?.data).find(Boolean)
      if (!entry) return false // X has not filled the cell yet
      later.set(cell, entry.conversationPosition?.isStart === false)
    }
    return later.get(cell)!
  }

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
    for (const [index, cell] of all.entries()) {
      const card = cell.querySelector('article') !== null
      const next = all[index + 1]
      cell.classList.toggle(
        'xnote-skip',
        cell.querySelector('[data-testid="placementTracking"] article, [data-testid="UserCell"], a[href^="/i/connect_people"]') !== null ||
          (cell.querySelector('h2[role="heading"]') !== null && next?.querySelector('[data-testid="UserCell"]') != null),
      )
      // A cell must have its final width before its height is read.
      if (!cell.style.gridRowStart || card !== cell.classList.contains('xnote-card')) {
        cell.style.gridColumn = card ? 'auto' : '1 / -1'
      }
      cell.classList.toggle('xnote-card', card)
      resizes.observe(cell)
      far.observe(cell)
    }
    const { cardMinWidth, cardGap: gap } = store.get()
    // The container has a padding of one gap on each side.
    const columns = columnsFor(container.clientWidth - 2 * gap, cardMinWidth, gap)
    const reflow = layoutWidth !== 0 && container.clientWidth !== layoutWidth && !restore
    layoutWidth = container.clientWidth
    container.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`
    if (reflow) {
      // A cached height from the old card width is no longer valid.
      for (const cell of all) {
        cell.classList.remove('xnote-far')
        far.unobserve(cell)
        far.observe(cell)
      }
    }
    // Empty cells and the cells that the CSS hides take no part in the placement.
    let cells = all.filter((cell) => cell.offsetHeight > 0 || void (cell.style.gridArea = '1 / 1'))
    // Back from another page, restore the same reading order as the saved scroll position.
    const saved = !order.length && arrangements.get(feedKey)
    if (saved) {
      const byKey = new Map(cells.map((cell) => [keyOf(cell), cell]))
      order = saved.keys.flatMap((key) => byKey.has(key) ? [byKey.get(key)!] : [])
      for (const key of saved.starts) if (byKey.has(key)) starts.add(byKey.get(key)!)
      pinnedColumns = saved.columns
    }
    // New X nodes join beside their timeline neighbours; never move X's React-owned DOM nodes.
    order = mergeReadingOrder(cells, order, (cell) => !cell.classList.contains('xnote-card'))
    cells = [...order]
    if (columns !== pinnedColumns) pins.clear()
    pinnedColumns = columns
    let keys = cells.map(keyOf)
    let items = cells.map((cell, index) => {
      const full = !cell.classList.contains('xnote-card')
      // Only when the post before it is shown, and is the card directly above.
      const before = cell.previousElementSibling
      const joined = !full && before === cells[index - 1] && before?.classList.contains('xnote-card') === true && isLater(cell)
      cell.classList.toggle('xnote-joined', joined)
      return { height: cell.offsetHeight, full, joined, column: keys[index] ? pins.get(keys[index]) : undefined, start: starts.has(cell) }
    })
    if (reflow) {
      const screenTop = 54 // X's sticky timeline tabs.
      const reading = readingOrder(cells.map((cell, i) => {
        const rect = bounds.get(cell) ?? cell.getBoundingClientRect()
        const offset = bounds.has(cell) ? scrollY : 0
        return { top: rect.top - offset, bottom: rect.bottom - offset, left: rect.left, joined: items[i]!.joined, full: items[i]!.full }
      }), screenTop, innerHeight)
      starts.clear()
      const first = reading.find(({ band, index }) => band === 1 && !items[index]!.full)
      if (first) {
        const cell = cells[first.index]!
        const top = bounds.has(cell) ? bounds.get(cell)!.top - scrollY : cell.getBoundingClientRect().top
        hold = { cell, top: Math.max(screenTop, top) }
      }
      items = reading.map(({ index, band }, i) => {
        const start = band === 1 && i > 0 && reading[i - 1]!.band !== 1
        if (start) starts.add(cells[index]!)
        return { ...items[index]!, column: undefined, start }
      })
      keys = reading.map(({ index }) => keys[index])
      cells = reading.map(({ index }) => cells[index]!)
      order = [...cells]
      pins.clear()
    }
    const placed = placeCards(items, columns, UNIT, gap)
    let shift = 0
    placed.forEach(({ column, row, span }, index) => {
      cells[index]!.style.gridArea = column ? `${row} / ${column} / span ${span} / span 1` : `${row} / 1 / span ${span} / -1`
      // A card can end a few px before its last row, and the card above was moved up as well.
      shift = items[index]!.joined ? shift + items[index - 1]!.height - placed[index - 1]!.span * UNIT : 0
      cells[index]!.style.marginTop = shift ? `${shift}px` : ''
      if (column && keys[index]) pins.set(keys[index], column)
    })
    arrangements.set(feedKey, {
      keys: keys.filter((key) => key !== undefined),
      starts: new Set(keys.flatMap((key, i) => key !== undefined && starts.has(cells[i]!) ? [key] : [])),
      columns,
      anchor: arrangements.get(feedKey)?.anchor,
    })
    if (restore) {
      const cell = restore.anchor && cells[keys.indexOf(restore.anchor.key)]
      // Wait until enough posts are rendered again, but not forever.
      if (cell || document.documentElement.scrollHeight - innerHeight >= restore.top) {
        if (cell && restore.anchor) hold = { cell, top: restore.anchor.top }
        else scrollTo(0, restore.top)
        restore = undefined
      } else if (Date.now() > restore.until) restore = undefined
    }
    if (hold && !hold.cell.isConnected) hold = undefined
    if (hold) scrollBy(0, hold.cell.getBoundingClientRect().top - hold.top)
    capture()
    loadMore()
  }
  const queueLayout = () => {
    if (layoutQueued) return
    layoutQueued = true
    requestAnimationFrame(layout)
  }
  const resizes = new ResizeObserver(queueLayout)
  const children = new MutationObserver(queueLayout)
  // Every loaded post stays on the page, so each change of the feed costs more as it grows.
  const far = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting, boundingClientRect } of entries) {
        const cell = target as HTMLElement
        if (!isIntersecting && boundingClientRect.height > 0) {
          cell.style.setProperty('--xnote-far-height', `${boundingClientRect.height}px`)
          cell.classList.add('xnote-far')
        } else cell.classList.remove('xnote-far')
      }
    },
    { rootMargin: '200% 0px' },
  )

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
    if (onFeed && !restore && (!updating || scrollY === 0)) {
      if (scrollY === 0) updating = false
      // Reading-band alignment is temporary: at the top every column starts at the top again.
      if (scrollY === 0 && starts.size) {
        starts.clear()
        hold = undefined
        queueLayout()
      }
      positions.set(feedKey, scrollY)
      remember()
    }
    loadMore()
  }

  const stop = () => {
    resizes.disconnect()
    children.disconnect()
    far.disconnect()
    if (container) {
      container.classList.remove('xnote-grid')
      for (const cell of container.children as HTMLCollectionOf<HTMLElement>) {
        cell.classList.remove('xnote-card', 'xnote-joined', 'xnote-skip', 'xnote-far')
        cell.style.gridArea = ''
        cell.style.marginTop = ''
      }
      container.style.gridTemplateColumns = ''
    }
    const previous = scroller
    container = scroller = null
    restore = undefined
    hold = undefined
    order = []
    starts.clear()
    bounds.clear()
    layoutWidth = pinnedColumns = 0
    previous?._update?.() // lets X go back to rendering only the posts near the viewport
  }

  const sync = () => {
    const kind = feedKind(location.pathname)
    const values = store.get()
    const root = document.documentElement
    root.classList.toggle('xnote-wide', values.enabled && values.wideLayout)
    if (kind === 'keep') return
    root.style.setProperty('--xnote-gap', `${values.cardGap}px`)
    const wanted = values.enabled && !broken && kind !== null && values[switchFor[kind]]
    root.classList.toggle('xnote-masonry', wanted)
    root.classList.toggle('xnote-profile', wanted && kind === 'profile')
    if (!wanted) return stop()
    if (!values.wideLayout) {
      // X's column of navigation is right-aligned in the header; the space before it is the margin.
      const left = document.querySelector('header[role="banner"] > div')?.getBoundingClientRect().left
      const start = document.querySelector('main[role="main"] > div')?.getBoundingClientRect().left
      if (left !== undefined && start !== undefined) {
        const width = `${Math.round(root.clientWidth - start - left)}px`
        if (root.style.getPropertyValue('--xnote-feed') !== width) root.style.setProperty('--xnote-feed', width)
      }
    }

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
    restore = top && !updating ? { top, until: Date.now() + 3000, anchor: arrangements.get(feedKey)?.anchor } : undefined
    patch(scroller)
    container.classList.add('xnote-grid')
    children.observe(container, { childList: true })
    scroller._update?.()
    lastLoad = Date.now() // X needs a moment to render every post again; the page is short until then
    queueLayout()
  }

  addStyle(CSS)
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!container?.isConnected || !isNewPostsControl(target)) return
    // This is a new start, not a return to the old feed, even if X rebuilds it later.
    updating = true
    restore = hold = undefined
    positions.delete(feedKey)
    arrangements.delete(feedKey)
    pins.clear()
    starts.clear()
    order = []
    bounds.clear()
    layoutWidth = pinnedColumns = 0
    queueLayout()
  }, true)
  onPageChange(sync)
  addEventListener('resize', queuePageCheck)
  addEventListener('scroll', onScroll, { passive: true })
  store.subscribe(() => (capture(), queuePageCheck(), queueLayout()))

  return { isBroken: () => broken }
}
