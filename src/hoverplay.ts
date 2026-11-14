import type { Store } from './settings.ts'

const CARD = '.xnote-grid > .xnote-card'

/**
 * In the masonry feed many videos are on screen at once, and X starts whichever is most in
 * view. Here a video plays only while the pointer is over its card: muted, one at a time.
 */
export function installHoverPlay(store: Store) {
  const on = () => store.get().enabled && store.get().hoverPlay
  let current: Element | null = null

  // X starts videos from script. A video in the feed may start only under the pointer, which
  // also covers a click on its play button. The refusal is the one browsers give to autoplay.
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    const card = on() ? this.closest(CARD) : null
    if (card && card !== current) return Promise.reject(new DOMException('xnote: videos play under the pointer', 'NotAllowedError'))
    return play.call(this)
  }

  addEventListener(
    'mouseover',
    (event) => {
      const card = on() && event.target instanceof Element ? event.target.closest(CARD) : null
      if (card === current) return
      current?.querySelector('video')?.pause()
      current = card
      const video = card?.querySelector('video')
      if (!video) return
      video.muted = true
      video.play().catch(() => {}) // not ready or removed: nothing to do
    },
    true,
  )
}
