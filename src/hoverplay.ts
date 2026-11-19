import type { Store } from './settings.ts'
import type { installMediaPreview } from './media-preview.ts'

const CARD = '.xnote-grid > .xnote-card'

/**
 * In the masonry feed many videos are on screen at once, and X starts whichever is most in
 * view. Here a video plays only while the pointer is over its card: muted, one at a time.
 */
export function installHoverPlay(store: Store, preview: ReturnType<typeof installMediaPreview>) {
  const on = () => store.get().enabled && store.get().hoverPlay > 0
  // A stationary pointer can outlive the feed when a detail page replaces it.
  let current: WeakRef<Element> | undefined
  let waitingForPreview = false
  let pending: Element | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  // X starts videos from script. A video in the feed may start only under the pointer, which
  // also covers a click on its play button. The refusal is the one browsers give to autoplay.
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const card = this.closest(CARD)
    if ((on() && preview.waitingForVideo(this)) || (card && (preview.isOpen() || (on() && card !== current?.deref())))) {
      return Promise.reject(new DOMException('xnote: videos play under the pointer', 'NotAllowedError'))
    }
    return play.call(this)
  }

  addEventListener(
    'mouseover',
    (event) => {
      const card = on() && event.target instanceof Element ? event.target.closest(CARD) : null
      const previous = current?.deref()
      const video = card?.querySelector('video')
      const wait = !!video && preview.waitingForVideo(video)
      if (card === previous && waitingForPreview === wait) return
      if (card === pending && wait === waitingForPreview) return
      clearTimeout(timer)
      pending = card
      waitingForPreview = wait
      previous?.querySelector('video')?.pause()
      if (!video || wait || preview.isOpen()) {
        video?.pause()
        current = undefined
        return
      }
      const delay = store.get().hoverPlay
      timer = setTimeout(() => {
        if (!on() || pending !== card || !card?.matches(':hover')) return
        current = new WeakRef(card)
        video.muted = true
        video.play().catch(() => {}) // not ready or removed: nothing to do
      }, delay)
    },
    true,
  )
  addEventListener('mouseout', event => {
    if (!(event.target instanceof Element)) return
    const card = event.target.closest(CARD)
    if (card && event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return
    if (card && card === pending) {
      clearTimeout(timer)
      pending = null
      card.querySelector('video')?.pause()
    }
    if (card && card === current?.deref()) {
      current = undefined
      card.querySelector('video')?.pause()
    }
  }, true)
}
