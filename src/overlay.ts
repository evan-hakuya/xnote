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

  addEventListener(
    'click',
    (event) => {
      const { enabled, detailOverlay } = store.get()
      const target = event.target
      if (!enabled || !detailOverlay || !(target instanceof Element)) return

      if (target.matches(`html.xnote-overlay ${BACKDROP}`)) return history.back() // click outside the popup

      // In the masonry feed, a click on a card opens the overlay instead of the post's page.
      const article = target.closest('.xnote-grid article')
      if (!article || target.closest(INTERACTIVE)) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || getSelection()?.toString()) return
      const media = [...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')].find(
        // A quoted post is a div[role="link"] block; its media must not open for the quoting post.
        (link) => isMediaLayer(new URL(link.href).pathname) && !link.closest('div[role="link"]'),
      )
      const post = article.querySelector('a[href*="/status/"]:has(time)') as HTMLAnchorElement | null
      if (!media && !post) return
      event.preventDefault()
      event.stopPropagation()
      // A post without media has no viewer, so it opens in a new tab and the feed stays in place.
      if (media) media.click()
      else open(post!.href, '_blank', 'noopener')
    },
    true,
  )
}
