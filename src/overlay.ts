import { addStyle, onPageChange, queuePageCheck } from './page.ts'
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
  background: rgb(0 0 0 / 0.55);
}
html.xnote-overlay ${VIEWER} > [role="dialog"] {
  flex: none !important;
  width: ${WIDTH} !important;
  height: ${POP.vh}vh !important;
  border-radius: ${POP.radius}px;
  overflow: hidden;
  background: #000;
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
}
/* The cover has the text above and, like X's viewer, the post's buttons below. */
.xnote-cover-text { flex: 1; min-height: 0; display: flex; padding: 48px; overflow: auto; }
.xnote-cover-text > * { display: block !important; margin: auto; font-size: var(--xnote-cover-font) !important; line-height: 1.5 !important; -webkit-line-clamp: unset !important; }
.xnote-cover-actions { flex: none; height: 48px; display: flex; align-items: center; justify-content: center; }
.xnote-cover-actions > * { width: min(600px, 100% - 32px); margin: 0 !important; border: 0 !important; }
/* X colours its buttons and shows their names from script when the pointer is over them. The
   copies have no script, so the same look is plain CSS here. */
.xnote-cover-actions [data-tip] { --tint: 29 155 240; position: relative; overflow: visible !important; }
.xnote-cover-actions [data-tip]:is([data-testid="retweet"], [data-testid="unretweet"]) { --tint: 0 186 124; }
.xnote-cover-actions [data-tip]:is([data-testid="like"], [data-testid="unlike"]) { --tint: 249 24 128; }
.xnote-cover-actions [data-tip]:hover * { color: rgb(var(--tint)) !important; }
.xnote-cover-actions [data-tip]:hover svg { border-radius: 50%; background: rgb(var(--tint) / 0.1); box-shadow: 0 0 0 8px rgb(var(--tint) / 0.1); }
.xnote-cover-actions [data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(50% + 14px); /* just below the icon, where X shows it */
  left: 50%;
  translate: -50% 0;
  padding: 2px 4px;
  border-radius: 2px;
  background: rgb(91 112 131 / 0.8);
  color: #fff;
  font: 11px/12px TwitterChirp, -apple-system, system-ui, sans-serif;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
}
.xnote-cover-actions [data-tip]:hover::after { opacity: 1; transition: opacity 0.1s 0.4s; }
html.xnote-sheet [data-testid="sidebarColumn"] { display: none !important; }
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

// X's private React internals. Everything read from them is checked before use, and every
// caller has a path that works without them.
function fibers(element: object) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'))
  const chain: any[] = []
  for (let fiber = key ? (element as any)[key] : null; fiber && chain.length < 300; fiber = fiber.return) chain.push(fiber)
  return chain
}

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
  page?: { path: string; since: number } // the post page that the sheet shows now
  closing?: true
}

export function installOverlay(store: Store) {
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
  const copyOf = (source: Element) => {
    const copy = source.cloneNode(true) as HTMLElement
    copy.removeAttribute('id')
    for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id')
    return copy
  }

  const BUTTONS = 'button, a, [role="button"]'
  /** Shows the text and the buttons of `post`, an article or a quoted post. */
  const setCover = (post: Element | null | undefined) => {
    if (!sheet || !post) return
    const [words, bar] = sheet.cover.children as unknown as [HTMLElement, HTMLElement]
    const text = post.querySelector('[data-testid="tweetText"]')
    if (text && text.textContent !== words.textContent) {
      words.replaceChildren(copyOf(text))
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
      const copy = copyOf(source)
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
    const bar = document.createElement('div')
    bar.className = 'xnote-cover-actions'
    // The copy is the n-th button of the real row: pass the click on. X does the action.
    bar.addEventListener('click', (event) => {
      event.preventDefault()
      const index = [...bar.querySelectorAll(BUTTONS)].indexOf((event.target as Element).closest(BUTTONS)!)
      if (sheet?.actions?.isConnected) sheet.actions.querySelectorAll<HTMLElement>(BUTTONS)[index]?.click()
    })
    cover.append(words, bar)
    sheet?.backdrop.remove() // a sheet that was still closing
    sheet = { backdrop, cover, from: location.pathname, top: scrollY, opened: Date.now(), shown: false }
    setCover(post)
    layers.prepend(backdrop, cover)
    root.style.setProperty('--xnote-bg', getComputedStyle(document.body).backgroundColor)
    root.classList.add('xnote-sheet')
    cutHole()
  }

  const closeSheet = (closing: Sheet) => {
    closing.closing = true
    root.classList.remove('xnote-sheet')
    closing.cover.remove()
    const drop = () => {
      closing.backdrop.remove()
      if (sheet === closing) sheet = null
    }
    if (location.pathname !== closing.from) return drop()
    // Back on the feed: X builds it again and xnote restores the scroll position. The copy shows
    // the same picture, so it covers the page until that is done and nothing flashes.
    closing.backdrop.style.clipPath = ''
    const started = Date.now()
    const timer = setInterval(() => {
      const ready = document.querySelector('main .xnote-grid') && Math.abs(scrollY - closing.top) < 4
      if (!ready && Date.now() - started < 1500) return
      clearInterval(timer)
      drop()
    }, 50)
  }

  const syncSheet = () => {
    if (!sheet || sheet.closing) return
    const path = location.pathname
    if (/\/status\/\d+/.test(path) || (sheet.shown && feedKind(path) === 'keep')) {
      sheet.shown = true
      if (sheet.page?.path !== path) sheet.page = { path, since: Date.now() }
      // X marks the post that the page is about with tabindex="-1". It changes when the user
      // opens a reply inside the sheet.
      const post = document.querySelector('main article[tabindex="-1"]')
      setCover(post)
      // On a new page X scrolls the post to just below the title bar, as if the bar were at the
      // top of the window. Here the bar is lower and would cover the post's first lines.
      const bar = document.querySelector(`${COLUMN} > div > div:first-child`)
      if (post && bar && Date.now() - sheet.page.since < 1000) {
        const covered = bar.getBoundingClientRect().bottom - post.getBoundingClientRect().top
        if (covered > 0 && covered < innerHeight / 4) scrollBy(0, -covered)
      }
      return
    }
    if (!sheet.shown && Date.now() - sheet.opened < 2000) return // X has not started the navigation yet
    closeSheet(sheet)
  }

  const sync = () => {
    const { enabled, detailOverlay } = store.get()
    const on = enabled && detailOverlay && isMediaLayer(location.pathname)
    const changed = on !== root.classList.contains('xnote-overlay')
    root.classList.toggle('xnote-overlay', on)
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
      if (target.id === 'xnote-backdrop') return sheet?.closing ? undefined : history.back()

      // In the masonry feed, a click on a card opens the overlay instead of the post's page.
      const article = target.closest('.xnote-grid article')
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
      if (!photo && !router && !page) return
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
    if (event.key === 'Escape' && open) history.back()
  })
}
