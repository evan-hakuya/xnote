import { t } from './i18n.ts'
import { installGallerySwipe } from './gallery-swipe.ts'
import { addStyle, onPageChange, queuePageCheck } from './page.ts'
import { fibers } from './react.ts'
import { feedKind, isMediaLayer } from './route.ts'
import type { Store } from './settings.ts'

// The detail overlay is one popup size for every post: media or cover on the left, the post and
// its replies in a side column on the right.
const POP = { width: 1280, vw: 92, vh: 88, side: 350, radius: 16 }
const TOP = `${(100 - POP.vh) / 2}vh`
const WIDTH = `min(${POP.width}px, ${POP.vw}vw)`

// A post with media: X's media viewer already has this layout, as a full-screen layer.
const VIEWER = '#layers [role="group"]:has(> [role="dialog"][aria-modal="true"])'
const COLUMN = 'html.xnote-sheet main [data-testid="primaryColumn"]'
const CSS = `
html.xnote-overlay ${VIEWER} {
  display: flex !important;
  align-items: center;
  justify-content: center;
}
html.xnote-overlay ${VIEWER}, dialog.xnote-media-preview::backdrop { background: rgb(0 0 0 / 0.55); }
html.xnote-overlay ${VIEWER} > [role="dialog"], dialog.xnote-media-preview {
  flex: none !important;
  width: ${WIDTH} !important;
  height: ${POP.vh}vh !important;
  border-radius: ${POP.radius}px;
  overflow: hidden;
  background: #000;
}
${VIEWER} [aria-roledescription="carousel"] > .xnote-post-media-track {
  overflow-x: auto !important;
  overflow-y: hidden !important;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}
${VIEWER} [aria-roledescription="carousel"] > .xnote-post-media-track > [role="list"] {
  position: relative !important;
  display: flex !important;
  transform: none !important;
}
${VIEWER} [aria-roledescription="carousel"] > .xnote-post-media-track > [role="list"] > [role="listitem"] {
  position: relative !important;
  flex: none !important;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

/* A post without media has no viewer, so X shows its real post page and xnote lays that out as
   the same popup (the "sheet"). A still copy of the feed lies above the page, with a hole of the
   popup's size. Through the hole show the cover (the text, on the left) and the post page (on
   the right), which scrolls with the window because X's reply list needs that. */
#xnote-backdrop { position: fixed; inset: 0; overflow: hidden; background: var(--xnote-bg); }
#xnote-backdrop * { pointer-events: none !important; }
/* The z-index puts the dimming above the copy's own positioned parts, such as the navigation. */
html.xnote-sheet #xnote-backdrop::after { content: ''; position: absolute; inset: 0; z-index: 99; background: rgb(0 0 0 / 0.55); }
.xnote-snapshot :has(.xnote-grid) { width: 100% !important; max-width: none !important; }
#xnote-cover {
  position: fixed;
  left: calc(50vw - ${WIDTH} / 2);
  top: ${TOP};
  width: calc(${WIDTH} - ${POP.side}px);
  height: ${POP.vh}vh;
  display: flex;
  flex-direction: column;
  /* The cover lies above the hole, so the hole's round corners do not clip it. Its parts have
     no background of their own, so the radius alone is enough and the button names stay whole. */
  border-radius: ${POP.radius}px 0 0 ${POP.radius}px;
  background: color-mix(in srgb, var(--xnote-bg) 90%, gray);
  color: var(--xnote-fg);
}
/* Like X's viewer: "close" at the top left, "hide the side column" at the top right. */
.xnote-cover-tools { position: absolute; inset: 12px 12px auto; display: flex; justify-content: space-between; pointer-events: none; }
/* In X's viewer these buttons are black circles on black media, so only the icon shows, and the
   circle turns a little lighter under the pointer. On the cover that is: no circle, then a grey one. */
.xnote-cover-tools button { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 9999px; background: none; color: inherit; cursor: pointer; pointer-events: auto; }
.xnote-cover-tools button:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.xnote-cover-tools svg { width: 20px; height: 20px; fill: currentColor; }
html.xnote-sheet-wide #xnote-cover { width: ${WIDTH}; border-radius: ${POP.radius}px; }
/* The cover has the text above and, like X's viewer, the post's buttons below. */
.xnote-cover-text { flex: 1; min-height: 0; display: flex; padding: 48px; overflow: auto; }
.xnote-cover-text > * { display: block !important; margin: auto; font-size: var(--xnote-cover-font) !important; line-height: 1.5 !important; -webkit-line-clamp: unset !important; }
/* A long-form article is read on the cover in X's own type, from the top, at a reading width. */
.xnote-cover-text.xnote-cover-article { display: block; padding: 64px 48px 24px; }
.xnote-cover-article > * { width: min(640px, 100%); margin: 0 auto !important; font-size: inherit !important; line-height: inherit !important; }
.xnote-cover-article [role="group"]:has([data-testid="like"], [data-testid="unlike"]) { display: none !important; }
.xnote-cover-actions { flex: none; height: 48px; display: flex; align-items: center; justify-content: center; }
.xnote-cover-actions > * { width: min(600px, 100% - 32px); margin: 0 !important; border: 0 !important; }
/* X colours its buttons and shows their names from script when the pointer is over them. The
   copies have no script, so the same look is plain CSS here. */
#xnote-cover [data-tip] { position: relative; overflow: visible !important; }
/* In the viewer a button keeps its colour and gets a circle of 10% white, on black. The cover
   has the theme's colours, so the circle is 10% of the text colour: light grey or dark grey. */
.xnote-cover-actions [data-tip]:hover svg {
  --ring: color-mix(in srgb, currentColor 10%, transparent);
  border-radius: 50%;
  background: var(--ring);
  box-shadow: 0 0 0 9px var(--ring);
}
#xnote-cover [data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(50% + 20px);
  left: 50%;
  translate: -50% 0;
  padding: 4px 8px;
  border-radius: 16px;
  background: rgb(0 0 0 / 0.8);
  color: #fff;
  font: 11px/12px TwitterChirp, -apple-system, system-ui, sans-serif;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
}
#xnote-cover [data-tip]:hover::after { opacity: 1; transition: opacity 0.1s 0.4s; }
html.xnote-sheet [data-testid="sidebarColumn"] { display: none !important; }
/* The collapsed post on the right, and its "Show more" in the look of X's own. */
html.xnote-sheet main .xnote-collapsed { max-height: var(--xnote-collapsed) !important; overflow: hidden !important; }
#xnote-cover .xnote-show-more { display: none; }
.xnote-show-more { display: block; margin: 4px 0 0; padding: 0; border: 0; background: none; color: rgb(29, 155, 240); font: inherit; font-size: 15px; cursor: pointer; }
.xnote-show-more:hover { text-decoration: underline; }
html.xnote-sheet header[role="banner"] { position: fixed !important; visibility: hidden; }
html.xnote-sheet main[role="main"] { flex-grow: 1 !important; align-items: stretch !important; }
html.xnote-sheet main[role="main"] > div,
html.xnote-sheet main[role="main"] > div > div,
html.xnote-sheet main[role="main"] > div > div > div { width: 100% !important; max-width: none !important; }
${COLUMN} {
  flex: none !important;
  width: ${POP.side}px !important;
  max-width: ${POP.side}px !important;
  min-height: ${POP.vh}vh;
  margin: ${TOP} 0 ${TOP} calc(50vw + ${WIDTH} / 2 - ${POP.side}px) !important;
  border: 0 !important;
  background: var(--xnote-bg);
}
/* The post page's own title bar sticks to the top of the popup, not of the window. */
${COLUMN} > div > div:first-child { top: ${TOP} !important; }
`
// A click on these keeps what X does with it.
const INTERACTIVE = 'a, button, input, textarea, video, [role="button"], [role="link"], [data-testid="videoPlayer"]'
// The parts of a post that do something on a click, for clicks on the cover's copy.
const PARTS = 'a[href], article, [role="link"]'
const CLOSE_ICON = 'M10.59 12 4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z'
const HIDE_ICON = 'M11.59 12L3.54 3.96l1.42-1.42L14.41 12l-9.45 9.46-1.42-1.42L11.59 12zm7 0l-8.05-8.04 1.42-1.42L21.41 12l-9.45 9.46-1.42-1.42L18.59 12z'
const SHOW_ICON = 'M12.04 2.54l1.42 1.42L5.41 12l8.05 8.04-1.42 1.42L2.59 12l9.45-9.46zm7 0l1.42 1.42L12.41 12l8.05 8.04-1.42 1.42L9.59 12l9.45-9.46z'

/**
 * The post that an article or a quoted post shows. A quoted post has no link to itself in the
 * DOM, and a video has no link to X's viewer, so both addresses come from X's React props.
 */
export function postOf(element: object) {
  for (const fiber of fibers(element)) {
    const tweet = fiber.memoizedProps?.tweet
    if (typeof tweet?.permalink !== 'string' || !/^\/\w+\/status\/\d+$/.test(tweet.permalink)) continue
    const viewer = tweet.extended_entities?.media?.[0]?.expanded_url
    const valid = typeof viewer === 'string' && viewer.startsWith(`${tweet.permalink}/`) && isMediaLayer(viewer)
    return { permalink: tweet.permalink as string, viewer: valid ? (viewer as string) : null }
  }
  return null
}

/** X's router. Its `push` opens a path the way a click on a link does. */
export function routerOf(element: object): { push(path: string): void } | null {
  for (const fiber of fibers(element)) {
    const history = fiber.memoizedProps?.history
    if (typeof history?.push === 'function') return history
  }
  return null
}

type Sheet = {
  backdrop: HTMLElement
  cover: HTMLElement
  actions?: Element // the post's real row of buttons, which the cover shows a copy of
  actionsHtml?: string
  from: string // the feed's path
  top: number // the feed's scroll position
  opened: number
  shown: boolean
  trail: string[] // the pages opened inside the sheet, one browser history entry each
  page?: { path: string; since: number; expanded?: true } // the post page that the sheet shows now; expanded after "Show more"
  lines: number // how many lines of text the card showed, for the collapsed post on the right
  closing?: true
  source?: Element // what the cover's text is a copy of
}

// Clone the path down to the grid shallowly so offscreen posts are never copied.
// Explicit grid rows keep each visible card at the same offset in the backdrop.
export function snapshotOf(source: Element, viewportHeight: number): HTMLElement {
  const grid = source.querySelector('.xnote-grid')
  const branch = new Map<Node, Node>()
  for (let node: Node | null = grid; node && node !== source && node.parentNode; node = node.parentNode) {
    branch.set(node.parentNode, node)
  }
  const copy = (node: Node): Node => {
    if (node === grid && grid) {
      const clone = grid.cloneNode(false) as HTMLElement
      clone.style.height = `${grid.getBoundingClientRect().height}px`
      clone.style.boxSizing = 'border-box'
      for (const cell of grid.children) {
        const box = cell.getBoundingClientRect()
        if (box.height > 0 && box.bottom > 0 && box.top < viewportHeight) clone.append(cell.cloneNode(true))
      }
      return clone
    }
    const next = branch.get(node)
    if (!next) return node.cloneNode(true)
    const clone = node.cloneNode(false)
    for (const child of node.childNodes) clone.appendChild(child === next ? copy(child) : child.cloneNode(true))
    return clone
  }
  return copy(source) as HTMLElement
}

function releaseBackdrop(backdrop: HTMLElement) {
  backdrop.remove()
  // A retained descendant otherwise keeps the entire detached feed snapshot alive.
  backdrop.querySelector('.xnote-grid')?.replaceChildren()
  backdrop.replaceChildren()
}

export function installOverlay(store: Store, isReadingPositionReady: (top: number) => boolean, openMedia: (element: Element) => boolean) {
  addStyle(CSS)
  const root = document.documentElement
  let sheet: Sheet | null = null

  const cutHole = () => {
    if (!sheet || sheet.closing) return
    const { radius: r } = POP
    const w = Math.min(POP.width, (innerWidth * POP.vw) / 100) - 2 * r
    const h = (innerHeight * POP.vh) / 100 - 2 * r
    const x = (innerWidth - w) / 2
    const y = (innerHeight - h) / 2 - r
    const arc = `a${r} ${r} 0 0 1`
    sheet.backdrop.style.clipPath =
      `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z ` +
      `M${x} ${y}h${w}${arc} ${r} ${r}v${h}${arc} -${r} ${r}h-${w}${arc} -${r} -${r}v-${h}${arc} ${r} -${r}Z")`
  }

  // X's layer container comes before the page in the document, so the id of a copy in there
  // would win over the real element's id in every lookup. Copies carry no ids.
  const copyOf = (source: Element, snapshot = false) => {
    const copy = snapshot ? snapshotOf(source, innerHeight) : source.cloneNode(true) as HTMLElement
    copy.removeAttribute('id')
    for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id')
    return copy
  }

  const BUTTONS = 'button, a, [role="button"]'
  /** Shows the text and the buttons of `post`, an article or a quoted post. */
  const setCover = (post: Element | null | undefined) => {
    if (!sheet || !post) return
    const [words, bar] = sheet.cover.children as unknown as [HTMLElement, HTMLElement]
    // A long-form article is shown whole: cover image, title and body with the posts it embeds.
    const article = post.querySelector('[data-testid="twitterArticleReadView"]')
    const text = article ?? post.querySelector('[data-testid="tweetText"]')
    words.classList.toggle('xnote-cover-article', article !== null)
    // X adds an article's images after its text, so they count as a change too.
    const key = text ? `${text.querySelectorAll('img').length} ${text.textContent}` : ''
    if (text && key !== words.dataset.key) {
      words.dataset.key = key
      const top = words.scrollTop
      words.replaceChildren(copyOf(text))
      sheet.source = text
      words.scrollTop = top
      const length = text.textContent?.length ?? 0
      sheet.cover.style.setProperty('--xnote-cover-font', length < 60 ? '40px' : length < 240 ? '28px' : '20px')
    }
    const actions = post.querySelector('[role="group"]:has([data-testid="like"], [data-testid="unlike"])')
    // The row changes when the user likes the post or a count moves; then the copy follows.
    if (actions && (actions !== sheet.actions || actions.outerHTML !== sheet.actionsHtml)) {
      sheet.actions = actions
      sheet.actionsHtml = actions.outerHTML
      bar.replaceChildren(copyOf(actions))
      // The name of a button is the last sentence of its label: "12 Likes. Like" -> "Like".
      for (const button of bar.querySelectorAll(`:is(${BUTTONS})[aria-label]`)) {
        const name = button.getAttribute('aria-label')!.split(/[。.]\s*/).filter(Boolean).pop()
        if (name) button.setAttribute('data-tip', name)
      }
    }
  }

  // "Close" leaves the sheet in one step, however many replies the user opened inside it.
  const closeAll = () => {
    if (sheet?.shown && !sheet.closing) history.go(-Math.max(1, sheet.trail.length))
  }

  let wide = false // the side column is hidden; kept for the next sheet, as X's viewer does
  const toolButton = (label: string, path: string, action: () => void) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', label)
    button.setAttribute('data-tip', label)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    shape.setAttribute('d', path)
    svg.append(shape)
    button.append(svg)
    button.addEventListener('click', action)
    return button
  }

  const openSheet = (post: Element) => {
    // Inside X's layer container the copy is above the page and below X's own menus and dialogs.
    const layers = document.getElementById('layers')
    const column = document.querySelector('[data-testid="primaryColumn"]')
    if (!layers || !column) return
    const backdrop = document.createElement('div')
    backdrop.id = 'xnote-backdrop'
    backdrop.setAttribute('aria-hidden', 'true')
    for (const source of [document.querySelector('header[role="banner"]'), column]) {
      if (!source) continue
      const rect = source.getBoundingClientRect()
      const copy = copyOf(source, true)
      // xnote's and X's selectors must not take the copy for the real element.
      copy.removeAttribute('data-testid')
      copy.removeAttribute('role')
      copy.classList.add('xnote-snapshot')
      copy.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;max-width:none;`
      backdrop.append(copy)
    }
    const cover = document.createElement('div')
    cover.id = 'xnote-cover'
    const words = document.createElement('div')
    words.className = 'xnote-cover-text'
    // The copy has no script, and its links leave X for a full page load. A click on it goes to
    // the same part of the real post instead: a photo opens in the media preview; a link, an
    // embedded post or a quoted post gets the click, so X opens it as on the right.
    words.addEventListener('click', (event) => {
      const copy = words.firstElementChild
      const tile = (event.target as Element).closest('[data-testid="tweetPhoto"]')
      const part = (event.target as Element).closest(PARTS)
      if (!copy || (!tile && (!part || part === copy))) return
      event.preventDefault()
      if (!sheet?.source?.isConnected) return
      const same = (selector: string, element: Element) =>
        sheet!.source!.querySelectorAll<HTMLElement>(selector)[[...copy.querySelectorAll(selector)].indexOf(element)]
      if (tile) {
        const real = same('[data-testid="tweetPhoto"]', tile)
        if (real) openMedia(real)
      } else same(PARTS, part!)?.click()
    })
    const bar = document.createElement('div')
    bar.className = 'xnote-cover-actions'
    // The copy is the n-th button of the real row: pass the click on. X does the action.
    bar.addEventListener('click', (event) => {
      event.preventDefault()
      const index = [...bar.querySelectorAll(BUTTONS)].indexOf((event.target as Element).closest(BUTTONS)!)
      if (sheet?.actions?.isConnected) sheet.actions.querySelectorAll<HTMLElement>(BUTTONS)[index]?.click()
    })
    const tools = document.createElement('div')
    tools.className = 'xnote-cover-tools'
    const side = toolButton('', '', () => {
      wide = !wide
      showSide()
    })
    const showSide = () => {
      root.classList.toggle('xnote-sheet-wide', wide)
      for (const name of ['aria-label', 'data-tip']) side.setAttribute(name, t(wide ? 'showSide' : 'hideSide'))
      side.querySelector('path')!.setAttribute('d', wide ? SHOW_ICON : HIDE_ICON)
    }
    tools.append(toolButton(t('close'), CLOSE_ICON, closeAll), side)
    cover.append(words, bar, tools)
    if (sheet) releaseBackdrop(sheet.backdrop) // a sheet that was still closing
    // The right side shows as many lines of the post as its card did; an article, a few.
    const cardText = post.querySelector<HTMLElement>('[data-testid="tweetText"]')
    const lineHeight = cardText ? parseFloat(getComputedStyle(cardText).lineHeight) : NaN
    const lines = cardText && lineHeight > 0 ? Math.max(1, Math.round(cardText.offsetHeight / lineHeight)) : 3
    sheet = { backdrop, cover, from: location.pathname, top: scrollY, opened: Date.now(), shown: false, trail: [], lines }
    setCover(post)
    layers.prepend(backdrop, cover)
    const theme = getComputedStyle(document.body)
    root.style.setProperty('--xnote-bg', theme.backgroundColor)
    root.style.setProperty('--xnote-fg', theme.color)
    root.classList.add('xnote-sheet')
    showSide()
    cutHole()
  }

  const closeSheet = (closing: Sheet) => {
    closing.closing = true
    root.classList.remove('xnote-sheet')
    closing.cover.remove()
    const drop = () => {
      releaseBackdrop(closing.backdrop)
      if (sheet === closing) sheet = null
    }
    if (location.pathname !== closing.from) return drop()
    // Back on the feed: X builds it again and xnote restores the scroll position. The copy shows
    // the same picture, so it covers the page until that is done and nothing flashes.
    closing.backdrop.style.clipPath = ''
    const deadline = performance.now() + 1500
    const reveal = () => {
      if (sheet !== closing) return
      if (location.pathname !== closing.from || isReadingPositionReady(closing.top) || performance.now() >= deadline) return drop()
      requestAnimationFrame(reveal)
    }
    requestAnimationFrame(reveal)
  }

  // On the right, the post shows as much as its card did, then "Show more". All of it is loaded;
  // the rest is only out of sight until the click.
  const collapse = (post: Element, current: Sheet) => {
    const body =
      post.querySelector<HTMLElement>('[data-testid="twitterArticleRichTextView"]') ??
      post.querySelector<HTMLElement>('[data-testid="tweetText"]')
    const on = store.get().sheetCollapse && !current.page?.expanded && body !== null
    // Only on the page: the cover's copy of an article carries the marks along.
    for (const old of document.querySelectorAll('main .xnote-collapsed')) if (old !== body || !on) old.classList.remove('xnote-collapsed')
    let more = document.querySelector('main .xnote-show-more')
    if (!on) return void more?.remove()
    const lineHeight = parseFloat(getComputedStyle(body.firstElementChild ?? body).lineHeight) || 24
    body.style.setProperty('--xnote-collapsed', `${current.lines * lineHeight}px`)
    body.classList.add('xnote-collapsed')
    if (body.scrollHeight <= body.clientHeight + 2) return void more?.remove() // it fits
    if (more?.previousElementSibling === body) return
    more?.remove()
    more = document.createElement('button')
    more.className = 'xnote-show-more'
    more.textContent = t('showMore')
    more.addEventListener('click', (event) => {
      event.stopPropagation() // not a click on the post
      if (current.page) current.page.expanded = true
      collapse(post, current)
    })
    body.after(more)
  }

  const syncSheet = () => {
    if (!sheet || sheet.closing) return
    const path = location.pathname
    if (/\/status\/\d+/.test(path) || (sheet.shown && feedKind(path) === 'keep')) {
      sheet.shown = true
      if (sheet.page?.path !== path) {
        sheet.page = { path, since: Date.now() }
        // The page before the last one again means "back"; any other page is a step forward.
        if (sheet.trail.at(-2) === path) sheet.trail.pop()
        else sheet.trail.push(path)
      }
      // X marks the post that the page is about with tabindex="-1". It changes when the user
      // opens a reply inside the sheet.
      const post = document.querySelector('main article[tabindex="-1"]')
      setCover(post)
      // On a new page X scrolls the post to just below the title bar, as if the bar were at the
      // top of the window. Here the bar is lower and would cover the post's first lines.
      const bar = document.querySelector(`${COLUMN} > div > div:first-child`)
      if (post) collapse(post, sheet)
      if (post && bar && Date.now() - sheet.page.since < 1000) {
        const covered = bar.getBoundingClientRect().bottom - post.getBoundingClientRect().top
        if (covered > 0 && covered < innerHeight / 4) scrollBy(0, -covered)
      }
      return
    }
    if (!sheet.shown && Date.now() - sheet.opened < 2000) return // X has not started the navigation yet
    closeSheet(sheet)
  }

  let swipe: ReturnType<typeof installGallerySwipe> | undefined
  const sync = () => {
    const { enabled, detailOverlay } = store.get()
    const on = enabled && detailOverlay && isMediaLayer(location.pathname)
    const changed = on !== root.classList.contains('xnote-overlay')
    root.classList.toggle('xnote-overlay', on)
    const carousel = enabled && isMediaLayer(location.pathname)
      ? document.querySelector<HTMLElement>(`${VIEWER} [aria-roledescription="carousel"]`)
      : null
    const list = carousel?.querySelector<HTMLElement>('[role="list"]') ?? null
    if (carousel && list) {
      if (!swipe || swipe.list !== list) {
        swipe?.stop()
        swipe = installGallerySwipe(list, carousel)
      }
      swipe.sync()
    } else if (swipe) {
      swipe.stop()
      swipe = undefined
    }
    // X sizes the media from the viewer's size and only measures again on a window resize.
    if (changed) dispatchEvent(new Event('resize'))
    syncSheet()
  }
  onPageChange(sync)
  store.subscribe(queuePageCheck)
  // "Back" must close the sheet before X draws the feed again, not one frame later.
  addEventListener('popstate', syncSheet)
  addEventListener('resize', cutHole)

  // Clicks that xnote passes on to X must not be handled by xnote again.
  let forwarding = false
  const forward = (element: HTMLElement) => {
    forwarding = true
    try {
      element.click()
    } finally {
      forwarding = false
    }
  }

  addEventListener(
    'click',
    (event) => {
      const { enabled, detailOverlay } = store.get()
      const target = event.target
      if (forwarding || !enabled || !detailOverlay || !(target instanceof Element)) return

      // A click outside the popup closes it.
      if (target.matches(`html.xnote-overlay ${VIEWER}`)) return history.back()
      if (target.id === 'xnote-backdrop') return closeAll()

      // In the masonry feed, a click on a card opens the overlay instead of the post's page.
      // Inside the sheet the same holds for a post with media, such as a quoted photo post:
      // it opens in the viewer. A post without media opens in the sheet, which X does itself.
      const inSheet = root.classList.contains('xnote-sheet')
      const article = target.closest(inSheet ? 'main article' : '.xnote-grid article')
      if (!article) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || getSelection()?.toString()) return
      const interactive = target.closest<HTMLElement>(INTERACTIVE)
      const quote = interactive?.matches('div[role="link"]:has([data-testid="User-Name"])') ? interactive : null
      if (interactive && !quote) return

      const subject = quote ?? article
      // A photo of the post itself is a link to the viewer. The media of a quoted post is not.
      const photo = quote
        ? undefined
        : [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')].find(
            (link) => isMediaLayer(new URL(link.href).pathname) && !link.closest('div[role="link"]'),
          )
      const viewer = photo ? null : postOf(subject)?.viewer
      const router = viewer ? routerOf(subject) : null
      // A click on this makes X open the post's page.
      const page = quote ?? article.querySelector<HTMLElement>('a[href*="/status/"]:has(time)')
      if (!photo && !router && (inSheet || !page)) return
      event.preventDefault()
      event.stopPropagation()
      if (photo) return forward(photo)
      if (router && viewer) return router.push(viewer)
      openSheet(subject)
      forward(page!)
    },
    true,
  )

  addEventListener('keydown', (event) => {
    // Escape first closes X's own dialog or menu, when one is open.
    const open = root.classList.contains('xnote-sheet') && !document.querySelector('#layers :is([aria-modal="true"], [role="menu"])')
    if (event.key === 'Escape' && open) closeAll()
  })
}
