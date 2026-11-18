import type { Store } from './settings.ts'
import type { installMediaPreview } from './media-preview.ts'

const CARD = '.xnote-grid > .xnote-card'

/**
 * In the masonry feed many videos are on screen at once, and X starts whichever is most in
 * view. Here a video plays only while the pointer is over its card: muted, one at a time.
 */
export function installHoverPlay(store: Store, preview: ReturnType<typeof installMediaPreview>) {
  const on = () => store.get().enabled && store.get().hoverPlay
  // A stationary pointer can outlive the feed when a detail page replaces it.
  let current: WeakRef<Element> | undefined
  let waitingForPreview = false

  // X starts videos from script. A video in the feed may start only under the pointer, which
  // also covers a click on its play button. The refusal is the one browsers give to autoplay.
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const card = this.closest(CARD)
    if (preview.waitingForVideo(this) || (card && (preview.isOpen() || (on() && card !== current?.deref())))) {
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
      waitingForPreview = wait
      previous?.querySelector('video')?.pause()
      current = card ? new WeakRef(card) : undefined
      if (!video || wait || preview.isOpen()) {
        video?.pause()
        return
      }
      video.muted = true
      video.play().catch(() => {}) // not ready or removed: nothing to do
    },
    true,
  )
}
