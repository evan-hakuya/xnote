import { addStyle, onPageChange, queuePageCheck } from './page.ts'
import { feedKind, isMediaLayer } from './route.ts'
import type { Store } from './settings.ts'

// X's media viewer is a full-screen layer: media on the left, the post and its replies on the
// right. The detail overlay is that same viewer, shrunk into a popup above the feed.
const BACKDROP = '#layers [role="group"]:has(> [role="dialog"][aria-modal="true"])'
const CSS = `
html.xnote-overlay ${BACKDROP} {
  display: flex !important;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.55);
}
html.xnote-overlay ${BACKDROP} > [role="dialog"] {
  flex: none !important;
  width: min(1280px, 92vw) !important;
  height: 88vh !important;
  border-radius: 16px;
  overflow: hidden;
  background: #000;
}

/* The sheet: a post without a viewer. X shows its real post page, which xnote lays out as a
   popup: the text as a cover on the left, the post page on the right, and a still copy of the
   feed behind both. The post page scrolls with the window, because X's reply list needs that,
   so the sheet is as high as the window: a box with margins would not line up after a scroll. */
html { --xnote-sheet: min(1100px, 92vw); --xnote-sheet-side: 450px; }
#xnote-backdrop { position: fixed; inset: 0; z-index: -1; overflow: hidden; }
/* The z-index puts the dimming above the copy's own positioned parts, such as the navigation. */
html.xnote-sheet #xnote-backdrop::after { content: ''; position: absolute; inset: 0; z-index: 99; background: rgb(0 0 0 / 0.55); }
.xnote-snapshot :has(.xnote-grid) { width: 100% !important; max-width: none !important; }
#xnote-cover {
  position: fixed;
  z-index: 2;
  left: calc(50vw - var(--xnote-sheet) / 2);
  top: 0;
  width: calc(var(--xnote-sheet) - var(--xnote-sheet-side));
  height: 100vh;
  box-sizing: border-box;
  padding: 48px;
  display: flex;
  overflow: auto;
  background: color-mix(in srgb, var(--xnote-bg) 90%, gray);
}
#xnote-cover > * { display: block !important; margin: auto; font-size: var(--xnote-cover-font) !important; line-height: 1.5 !important; -webkit-line-clamp: unset !important; }
html.xnote-sheet [data-testid="sidebarColumn"] { display: none !important; }
html.xnote-sheet header[role="banner"] { position: fixed !important; visibility: hidden; }
html.xnote-sheet main[role="main"] { flex-grow: 1 !important; align-items: stretch !important; }
html.xnote-sheet main[role="main"] > div,
html.xnote-sheet main[role="main"] > div > div,
html.xnote-sheet main[role="main"] > div > div > div { width: 100% !important; max-width: none !important; }
html.xnote-sheet main [data-testid="primaryColumn"] {
  flex: none !important;
  width: var(--xnote-sheet-side) !important;
  max-width: var(--xnote-sheet-side) !important;
  min-height: 100vh;
  margin: 0 0 0 calc(50vw + var(--xnote-sheet) / 2 - var(--xnote-sheet-side)) !important;
  border: 0 !important;
  background: var(--xnote-bg);
}
`
// A click on these keeps what X does with it.
const INTERACTIVE = 'a, button, input, textarea, video, [role="button"], [role="link"], [data-testid="videoPlayer"]'

/**
 * A quoted post is a div[role="link"] with no link to the post in the DOM, so its address comes
 * from X's React props (private, checked before use). Returns null when they are not as expected.
 */
export function quotedPost(quote: object) {
  const key = Object.keys(quote).find((name) => name.startsWith('__reactFiber$'))
  let fiber = key ? (quote as any)[key] : null
  for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return) {
    const tweet = fiber.memoizedProps?.tweet
    if (typeof tweet?.permalink === 'string' && /^\/\w+\/status\/\d+$/.test(tweet.permalink)) {
      return { permalink: tweet.permalink as string, photo: tweet.extended_entities?.media?.[0]?.type === 'photo' }
    }
  }
  return null
}

export function installOverlay(store: Store) {
  addStyle(CSS)

  let sheet: { backdrop: HTMLElement; cover: HTMLElement; opened: number; shown: boolean; closed?: number } | null = null
  const sheetOpen = () => document.documentElement.classList.contains('xnote-sheet')

  const setCover = (text: Element | null | undefined) => {
    if (!sheet || !text || text.textContent === sheet.cover.textContent) return
    sheet.cover.replaceChildren(text.cloneNode(true))
    const length = text.textContent?.length ?? 0
    sheet.cover.style.setProperty('--xnote-cover-font', length < 60 ? '40px' : length < 240 ? '28px' : '20px')
  }

  const openSheet = (text: Element | null) => {
    const column = document.querySelector('[data-testid="primaryColumn"]')
    if (!column) return
    const backdrop = document.createElement('div')
    backdrop.id = 'xnote-backdrop'
    backdrop.inert = true
    for (const source of [document.querySelector('header[role="banner"]'), column]) {
      if (!source) continue
      const rect = source.getBoundingClientRect()
      const copy = source.cloneNode(true) as HTMLElement
      // xnote's and X's selectors must not take the copy for the real element.
      copy.removeAttribute('data-testid')
      copy.removeAttribute('role')
      copy.classList.add('xnote-snapshot')
      copy.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;max-width:none;`
      backdrop.append(copy)
    }
    const cover = document.createElement('div')
    cover.id = 'xnote-cover'
    sheet?.backdrop.remove() // a sheet that was still closing
    sheet = { backdrop, cover, opened: Date.now(), shown: false }
    setCover(text)
    document.body.append(backdrop, cover)
    const root = document.documentElement
    root.style.setProperty('--xnote-bg', getComputedStyle(document.body).backgroundColor)
    root.classList.add('xnote-sheet')
  }

  const syncSheet = () => {
    if (!sheet) return
    const path = location.pathname
    if (/\/status\/\d+/.test(path) || (sheet.shown && feedKind(path) === 'keep')) {
      sheet.shown = true
      // X marks the post that the page is about with tabindex="-1". It changes when the user
      // opens a reply inside the sheet.
      return setCover(document.querySelector('main article[tabindex="-1"] [data-testid="tweetText"]'))
    }
    if (!sheet.shown && Date.now() - sheet.opened < 2000) return // X has not started the navigation yet
    document.documentElement.classList.remove('xnote-sheet')
    sheet.cover.remove()
    // Back on the feed: the copy stays until the real feed is there again, so nothing flashes.
    if (!sheet.closed) setTimeout(queuePageCheck, 1600)
    sheet.closed ??= Date.now()
    if (document.querySelector('main .xnote-grid') || Date.now() - sheet.closed > 1500) {
      sheet.backdrop.remove()
      sheet = null
    }
  }

  const sync = () => {
    const { enabled, detailOverlay } = store.get()
    const on = enabled && detailOverlay && isMediaLayer(location.pathname)
    const changed = on !== document.documentElement.classList.contains('xnote-overlay')
    document.documentElement.classList.toggle('xnote-overlay', on)
    // X sizes the media from the viewer's size and only measures again on a window resize.
    if (changed) dispatchEvent(new Event('resize'))
    syncSheet()
  }
  onPageChange(sync)
  store.subscribe(queuePageCheck)

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

      if (target.matches(`html.xnote-overlay ${BACKDROP}`)) return history.back() // click outside the popup
      if (sheetOpen() && !target.closest('[data-testid="primaryColumn"], #xnote-cover, #layers, header')) {
        return history.back() // click outside the sheet
      }

      // In the masonry feed, a click on a card opens the overlay instead of the post's page.
      const article = target.closest('.xnote-grid article')
      if (!article) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || getSelection()?.toString()) return
      const interactive = target.closest<HTMLElement>(INTERACTIVE)
      const quote = interactive?.matches('div[role="link"]:has([data-testid="User-Name"])') ? interactive : null
      if (interactive && !quote) return

      let photo: HTMLElement | null | undefined
      let page: HTMLElement | null // a click on this makes X open the post's page
      if (quote) {
        const post = quotedPost(quote)
        if (!post) return
        photo = post.photo ? quote.querySelector<HTMLElement>('[data-testid="tweetPhoto"]') : null
        page = quote
      } else {
        photo = [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')].find(
          // The media of a quoted post must not open for the quoting post.
          (link) => isMediaLayer(new URL(link.href).pathname) && !link.closest('div[role="link"]'),
        )
        page = article.querySelector<HTMLElement>('a[href*="/status/"]:has(time)')
      }
      if (!photo && !page) return
      event.preventDefault()
      event.stopPropagation()
      if (photo) return forward(photo)
      openSheet((quote ?? article).querySelector('[data-testid="tweetText"]'))
      forward(page!)
    },
    true,
  )

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheetOpen() && !document.querySelector('#layers [aria-modal="true"]')) history.back()
  })
}
