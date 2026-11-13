import { addStyle, onPageChange, queuePageCheck } from './page.ts'
import { isMediaLayer } from './route.ts'
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

  const sync = () => {
    const { enabled, detailOverlay } = store.get()
    const on = enabled && detailOverlay && isMediaLayer(location.pathname)
    const changed = on !== document.documentElement.classList.contains('xnote-overlay')
    document.documentElement.classList.toggle('xnote-overlay', on)
    // X sizes the media from the viewer's size and only measures again on a window resize.
    if (changed) dispatchEvent(new Event('resize'))
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

      // In the masonry feed, a click on a card opens the overlay instead of the post's page.
      const article = target.closest('.xnote-grid article')
      if (!article) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || getSelection()?.toString()) return
      const interactive = target.closest<HTMLElement>(INTERACTIVE)
      const quote = interactive?.matches('div[role="link"]:has([data-testid="User-Name"])') ? interactive : null
      if (interactive && !quote) return

      let photo: HTMLElement | null | undefined
      let url: string | undefined
      if (quote) {
        const post = quotedPost(quote)
        if (!post) return
        photo = post.photo ? quote.querySelector<HTMLElement>('[data-testid="tweetPhoto"]') : null
        url = location.origin + post.permalink
      } else {
        photo = [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')].find(
          // The media of a quoted post must not open for the quoting post.
          (link) => isMediaLayer(new URL(link.href).pathname) && !link.closest('div[role="link"]'),
        )
        url = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]:has(time)')?.href
      }
      if (!photo && !url) return
      event.preventDefault()
      event.stopPropagation()
      // A post without media has no viewer, so it opens in a new tab and the feed stays in place.
      if (photo) forward(photo)
      else open(url, '_blank', 'noopener')
    },
    true,
  )
}
